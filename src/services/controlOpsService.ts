import { getSupabaseClient } from '../lib/supabaseClient';
import {
  SUPABASE_ANON_KEY,
  SUPABASE_BUCKETS,
  SUPABASE_TABLES,
  SUPABASE_URL,
  getSupabaseConfigStatus,
  isSupabaseConfigured,
} from '../lib/supabaseConfig';
import {
  ActividadDiaria,
  CatalogosControlOps,
  EstatusAuditoriaLlamada,
  EstatusVencimiento,
  GastoYRefrendo,
  HorarioSucursalDia,
  LlamadaSucursal,
  MetaSucursal,
  Sucursal,
  UsuarioControlOps,
} from '../types/controlops';
import {
  INITIAL_ACTIVIDADES,
  INITIAL_CATALOGOS,
  INITIAL_GASTOS_REFRENDOS,
  INITIAL_LLAMADAS,
  INITIAL_METAS_SUCURSAL,
  INITIAL_SUCURSALES,
  INITIAL_USUARIOS,
  buildInitialHorarios,
} from '../data/mockData';

const STORAGE_KEYS = {
  LLAMADAS: 'controlops_llamadas_v1',
  ACTIVIDADES: 'controlops_actividades_v1',
  GASTOS_REFRENDOS: 'controlops_gastos_refrendos_v1',
  HORARIOS: 'controlops_horarios_v1',
  USUARIOS: 'controlops_usuarios_v1',
  SUCURSALES: 'controlops_sucursales_v1',
  METAS: 'controlops_metas_v1',
  CATALOGOS: 'controlops_catalogos_v1',
  SESSION_USER: 'controlops_session_user_v1',
};

export interface LoadedOperationalData {
  sucursales: Sucursal[];
  metas: MetaSucursal[];
  catalogos: CatalogosControlOps;
  usuarios: UsuarioControlOps[];
  llamadas: LlamadaSucursal[];
  actividades: ActividadDiaria[];
  gastosYRefrendos: GastoYRefrendo[];
  horarios: HorarioSucursalDia[];
  source: 'supabase' | 'demo';
  remoteCounts?: Record<string, number>;
  warning?: string;
}

export interface ServiceResult<T = unknown> {
  ok: boolean;
  error?: string;
  warning?: string;
  insertedCount?: number;
  data?: T;
}

export interface TableDiagnosticResult {
  table: string;
  ok: boolean;
  rowCount: number;
  error?: string;
}

function formatSupabaseError(err: {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}): string {
  const parts: string[] = [];
  if (err.code) parts.push(`[${err.code}]`);
  if (err.message) parts.push(err.message);
  if (err.details) parts.push(`Detalle: ${err.details}`);
  if (err.hint) parts.push(`Sugerencia: ${err.hint}`);
  return parts.join(' · ') || 'Error desconocido en Supabase';
}

function requireConfiguredSupabase():
  | { ok: true; client: NonNullable<ReturnType<typeof getSupabaseClient>> }
  | { ok: false; error: string } {
  const status = getSupabaseConfigStatus();
  if (!status.configured) {
    return {
      ok: false,
      error:
        status.errorMessage ||
        'Falta configurar VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.',
    };
  }
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      error:
        'No se pudo inicializar el cliente de Supabase. Verifica VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    };
  }
  return { ok: true, client };
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function getSavedSessionUser(): UsuarioControlOps | null {
  return readLocal<UsuarioControlOps | null>(STORAGE_KEYS.SESSION_USER, null);
}

export function saveSessionUser(user: UsuarioControlOps | null): void {
  if (!user) {
    try {
      localStorage.removeItem(STORAGE_KEYS.SESSION_USER);
    } catch {
      // Ignore
    }
    return;
  }
  writeLocal(STORAGE_KEYS.SESSION_USER, user);
}

export async function runSupabaseDiagnostics(): Promise<{
  status: ReturnType<typeof getSupabaseConfigStatus>;
  tables: TableDiagnosticResult[];
}> {
  const status = getSupabaseConfigStatus();
  const client = getSupabaseClient();
  const tableList = Object.values(SUPABASE_TABLES);

  if (!status.configured || !client) {
    return {
      status,
      tables: tableList.map((table) => ({
        table,
        ok: false,
        rowCount: 0,
        error: status.errorMessage || 'Cliente Supabase no inicializado',
      })),
    };
  }

  const tables = await Promise.all(
    tableList.map(async (table): Promise<TableDiagnosticResult> => {
      try {
        const { data, error } = await client.from(table).select('id');
        if (error) {
          return {
            table,
            ok: false,
            rowCount: 0,
            error: formatSupabaseError(error),
          };
        }
        return {
          table,
          ok: true,
          rowCount: data ? data.length : 0,
        };
      } catch (err) {
        return {
          table,
          ok: false,
          rowCount: 0,
          error:
            err instanceof Error ? err.message : 'Error de red al consultar',
        };
      }
    })
  );

  return { status, tables };
}

export async function authenticateUsuario(
  correoOrNombre: string,
  password: string
): Promise<{ user: UsuarioControlOps | null; error?: string }> {
  const input = correoOrNombre.trim().toLowerCase();
  const pass = password.trim();

  if (!input || !pass) {
    return { user: null, error: 'Ingresa tu usuario/correo y contraseña.' };
  }

  const conn = requireConfiguredSupabase();
  if (!conn.ok) {
    return { user: null, error: conn.error };
  }

  try {
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.USUARIOS)
      .select('*');

    if (error) {
      return {
        user: null,
        error: `Error al consultar ${SUPABASE_TABLES.USUARIOS} en Supabase: ${formatSupabaseError(error)}`,
      };
    }

    const users = (data || []) as UsuarioControlOps[];
    if (users.length === 0) {
      return {
        user: null,
        error: `La tabla ${SUPABASE_TABLES.USUARIOS} en Supabase no tiene usuarios registrados.`,
      };
    }

    writeLocal(STORAGE_KEYS.USUARIOS, users);

    const matched = users.find((u) => {
      const uCorreo = (u.correo || '').trim().toLowerCase();
      const uNombre = (u.nombre || '').trim().toLowerCase();
      const uPass = (u.password || '').trim();
      return (uCorreo === input || uNombre === input) && uPass === pass;
    });

    if (!matched) {
      return {
        user: null,
        error: `Usuario o contraseña incorrectos en ${SUPABASE_TABLES.USUARIOS}.`,
      };
    }
    if (!matched.activo) {
      return {
        user: null,
        error: 'Esta cuenta se encuentra desactivada. Contacta al Creador.',
      };
    }
    return { user: matched };
  } catch (err) {
    return {
      user: null,
      error:
        err instanceof Error
          ? `Error de red al conectar con Supabase: ${err.message}`
          : 'No se pudo conectar con Supabase para validar acceso.',
    };
  }
}

export async function loadAllOperationalData(): Promise<LoadedOperationalData> {
  const status = getSupabaseConfigStatus();
  const supabase = getSupabaseClient();

  const localFallback = (warning?: string): LoadedOperationalData => {
    const sucursales = readLocal(STORAGE_KEYS.SUCURSALES, INITIAL_SUCURSALES);
    return {
      sucursales,
      metas: readLocal(STORAGE_KEYS.METAS, INITIAL_METAS_SUCURSAL),
      catalogos: readLocal(STORAGE_KEYS.CATALOGOS, INITIAL_CATALOGOS),
      usuarios: readLocal(STORAGE_KEYS.USUARIOS, INITIAL_USUARIOS),
      llamadas: readLocal(STORAGE_KEYS.LLAMADAS, INITIAL_LLAMADAS),
      actividades: readLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES),
      gastosYRefrendos: readLocal(
        STORAGE_KEYS.GASTOS_REFRENDOS,
        INITIAL_GASTOS_REFRENDOS
      ),
      horarios: readLocal(
        STORAGE_KEYS.HORARIOS,
        buildInitialHorarios(sucursales)
      ),
      source: 'demo',
      warning,
    };
  };

  if (!status.configured || !supabase) {
    return localFallback(
      status.errorMessage ||
        'Supabase no está configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    );
  }

  try {
    const [
      llamadasRes,
      actividadesRes,
      gastosRes,
      horariosRes,
      usuariosRes,
      sucursalesRes,
      metasRes,
      catalogosRes,
    ] = await Promise.all([
      supabase.from(SUPABASE_TABLES.LLAMADAS).select('*'),
      supabase
        .from(SUPABASE_TABLES.ACTIVIDADES)
        .select('*')
        .order('fecha', { ascending: false }),
      supabase
        .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
        .select('*')
        .order('fecha', { ascending: false }),
      supabase.from(SUPABASE_TABLES.HORARIOS).select('*'),
      supabase.from(SUPABASE_TABLES.USUARIOS).select('*'),
      supabase.from(SUPABASE_TABLES.SUCURSALES).select('*'),
      supabase.from(SUPABASE_TABLES.METAS).select('*'),
      supabase.from(SUPABASE_TABLES.CATALOGOS).select('*'),
    ]);

    const tableWarnings: string[] = [];
    if (usuariosRes.error) {
      tableWarnings.push(
        `${SUPABASE_TABLES.USUARIOS}: ${formatSupabaseError(usuariosRes.error)}`
      );
    }
    if (sucursalesRes.error) {
      tableWarnings.push(
        `${SUPABASE_TABLES.SUCURSALES}: ${formatSupabaseError(sucursalesRes.error)}`
      );
    }
    if (metasRes.error) {
      tableWarnings.push(
        `${SUPABASE_TABLES.METAS}: ${formatSupabaseError(metasRes.error)}`
      );
    }
    if (catalogosRes.error) {
      tableWarnings.push(
        `${SUPABASE_TABLES.CATALOGOS}: ${formatSupabaseError(catalogosRes.error)}`
      );
    }
    if (horariosRes.error) {
      tableWarnings.push(
        `${SUPABASE_TABLES.HORARIOS}: ${formatSupabaseError(horariosRes.error)}`
      );
    }
    if (llamadasRes.error) {
      tableWarnings.push(
        `${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(llamadasRes.error)}`
      );
    }
    if (actividadesRes.error) {
      tableWarnings.push(
        `${SUPABASE_TABLES.ACTIVIDADES}: ${formatSupabaseError(actividadesRes.error)}`
      );
    }
    if (gastosRes.error) {
      tableWarnings.push(
        `${SUPABASE_TABLES.GASTOS_REFRENDOS}: ${formatSupabaseError(gastosRes.error)}`
      );
    }

    const remoteCounts: Record<string, number> = {
      [SUPABASE_TABLES.USUARIOS]: usuariosRes.data?.length ?? 0,
      [SUPABASE_TABLES.SUCURSALES]: sucursalesRes.data?.length ?? 0,
      [SUPABASE_TABLES.METAS]: metasRes.data?.length ?? 0,
      [SUPABASE_TABLES.CATALOGOS]: catalogosRes.data?.length ?? 0,
      [SUPABASE_TABLES.HORARIOS]: horariosRes.data?.length ?? 0,
      [SUPABASE_TABLES.ACTIVIDADES]: actividadesRes.data?.length ?? 0,
      [SUPABASE_TABLES.LLAMADAS]: llamadasRes.data?.length ?? 0,
      [SUPABASE_TABLES.GASTOS_REFRENDOS]: gastosRes.data?.length ?? 0,
    };

    const sucursales =
      !sucursalesRes.error && sucursalesRes.data && sucursalesRes.data.length > 0
        ? (sucursalesRes.data as Sucursal[])
        : readLocal(STORAGE_KEYS.SUCURSALES, INITIAL_SUCURSALES);
    if (!sucursalesRes.error && sucursalesRes.data && sucursalesRes.data.length > 0) {
      writeLocal(STORAGE_KEYS.SUCURSALES, sucursales);
    }

    const metas =
      !metasRes.error && metasRes.data && metasRes.data.length > 0
        ? (metasRes.data as MetaSucursal[])
        : readLocal(STORAGE_KEYS.METAS, INITIAL_METAS_SUCURSAL);
    if (!metasRes.error && metasRes.data && metasRes.data.length > 0) {
      writeLocal(STORAGE_KEYS.METAS, metas);
    }

    const usuarios =
      !usuariosRes.error && usuariosRes.data
        ? (usuariosRes.data as UsuarioControlOps[])
        : readLocal(STORAGE_KEYS.USUARIOS, INITIAL_USUARIOS);
    if (!usuariosRes.error && usuariosRes.data) {
      writeLocal(STORAGE_KEYS.USUARIOS, usuarios);
    }

    let catalogos: CatalogosControlOps;
    if (!catalogosRes.error && catalogosRes.data) {
      if (catalogosRes.data.length > 0) {
        catalogos = catalogosRes.data[0] as CatalogosControlOps;
        writeLocal(STORAGE_KEYS.CATALOGOS, catalogos);
      } else {
        // Carga inicial única: insertar las 9 actividades base solo cuando catalogos_controlops está vacío
        const seedCatalog: CatalogosControlOps = {
          id: 'cat-global',
          tareas_obligatorias: INITIAL_CATALOGOS.tareas_obligatorias,
          opciones_llamada: INITIAL_CATALOGOS.opciones_llamada,
        };
        const { data: seededData, error: seedError } = await supabase
          .from(SUPABASE_TABLES.CATALOGOS)
          .insert(seedCatalog)
          .select();
        if (seedError) {
          tableWarnings.push(
            `Seed ${SUPABASE_TABLES.CATALOGOS}: ${formatSupabaseError(seedError)}`
          );
          catalogos = readLocal(STORAGE_KEYS.CATALOGOS, seedCatalog);
        } else {
          catalogos =
            seededData && seededData.length > 0
              ? (seededData[0] as CatalogosControlOps)
              : seedCatalog;
          remoteCounts[SUPABASE_TABLES.CATALOGOS] = 1;
          writeLocal(STORAGE_KEYS.CATALOGOS, catalogos);
        }
      }
    } else {
      catalogos = readLocal(STORAGE_KEYS.CATALOGOS, INITIAL_CATALOGOS);
    }

    let llamadas: LlamadaSucursal[];
    if (!llamadasRes.error && llamadasRes.data) {
      if (llamadasRes.data.length > 0) {
        llamadasSchemaCache.validColumns = new Set(
          Object.keys(llamadasRes.data[0] as Record<string, unknown>)
        );
      }
      llamadas = (llamadasRes.data as Record<string, unknown>[])
        .map((row) => normalizeLlamadaFromDb(row, sucursales))
        .sort((a, b) =>
          (b.fecha_registro || '').localeCompare(a.fecha_registro || '')
        );
      writeLocal(STORAGE_KEYS.LLAMADAS, llamadas);
    } else {
      llamadas = readLocal(STORAGE_KEYS.LLAMADAS, INITIAL_LLAMADAS);
    }

    const actividades =
      !actividadesRes.error && actividadesRes.data
        ? (actividadesRes.data as ActividadDiaria[])
        : readLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    if (!actividadesRes.error && actividadesRes.data) {
      writeLocal(STORAGE_KEYS.ACTIVIDADES, actividades);
    }

    const gastosYRefrendos =
      !gastosRes.error && gastosRes.data
        ? (gastosRes.data as GastoYRefrendo[])
        : readLocal(STORAGE_KEYS.GASTOS_REFRENDOS, INITIAL_GASTOS_REFRENDOS);
    if (!gastosRes.error && gastosRes.data) {
      writeLocal(STORAGE_KEYS.GASTOS_REFRENDOS, gastosYRefrendos);
    }

    const horarios =
      !horariosRes.error && horariosRes.data && horariosRes.data.length > 0
        ? (horariosRes.data as HorarioSucursalDia[])
        : readLocal(STORAGE_KEYS.HORARIOS, buildInitialHorarios(sucursales));
    if (!horariosRes.error && horariosRes.data && horariosRes.data.length > 0) {
      writeLocal(STORAGE_KEYS.HORARIOS, horarios);
    }

    return {
      sucursales,
      metas,
      catalogos,
      usuarios,
      llamadas,
      actividades,
      gastosYRefrendos,
      horarios,
      source: 'supabase',
      remoteCounts,
      warning:
        tableWarnings.length > 0
          ? `Algunas tablas de Supabase reportaron error: ${tableWarnings.join(' | ')}`
          : undefined,
    };
  } catch (err) {
    return localFallback(
      err instanceof Error
        ? `Error de conexión con Supabase: ${err.message}`
        : 'No se pudo conectar con Supabase.'
    );
  }
}

interface LlamadasSchemaCache {
  validColumns: Set<string> | null;
  missingColumns: Set<string>;
  useAliasSucursal: boolean;
  useAliasCliente: boolean;
  omitGeneratedId: boolean;
  useInsertInsteadOfUpsert: boolean;
  openApiChecked: boolean;
}

const llamadasSchemaCache: LlamadasSchemaCache = {
  validColumns: null,
  missingColumns: new Set<string>(),
  useAliasSucursal: false,
  useAliasCliente: false,
  omitGeneratedId: false,
  useInsertInsteadOfUpsert: false,
  openApiChecked: false,
};

function computeSafeVencimiento(fechaVenc: string): EstatusVencimiento {
  if (!fechaVenc) return 'Al corriente';
  const todayStr = new Date().toISOString().slice(0, 10);
  if (fechaVenc < todayStr) return 'Vencido';
  const today = new Date(`${todayStr}T00:00:00`);
  const due = new Date(`${fechaVenc.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 'Al corriente';
  const diffDays = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) return 'Por vencer';
  return 'Al corriente';
}

function normalizeLlamadaFromDb(
  row: Record<string, unknown>,
  sucursales: Sucursal[] = []
): LlamadaSucursal {
  const rawSucName = String(
    row.sucursal_nombre ?? row.sucursal ?? ''
  ).trim();
  const rawSucId = String(row.sucursal_id ?? '').trim();
  const matchedSuc =
    sucursales.find((s) => s.id === rawSucId) ||
    sucursales.find(
      (s) => s.nombre.toLowerCase() === rawSucName.toLowerCase()
    ) ||
    sucursales.find(
      (s) => s.codigo.toLowerCase() === rawSucName.toLowerCase()
    );

  const fechaVenc = row.fecha_vencimiento
    ? String(row.fecha_vencimiento).slice(0, 10)
    : '';
  const reporteCajera = String(row.reporte_cajera ?? 'Sin reporte');
  const rawEstatusVenc = String(row.estatus_vencimiento ?? '');
  const estatusVencimiento: EstatusVencimiento =
    rawEstatusVenc === 'Vencido' ||
    rawEstatusVenc === 'Por vencer' ||
    rawEstatusVenc === 'Al corriente'
      ? rawEstatusVenc
      : computeSafeVencimiento(fechaVenc);

  const rawAud = String(row.estatus_auditoria ?? '');
  const estatusAuditoria: EstatusAuditoriaLlamada =
    rawAud === 'Verificada' || rawAud === 'Falsa' || rawAud === 'Sin auditar'
      ? rawAud
      : 'Sin auditar';

  const idStr = String(
    row.id ??
      `ll-db-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );

  return {
    id: idStr,
    sucursal_id: rawSucId || matchedSuc?.id || '',
    sucursal_nombre: rawSucName || matchedSuc?.nombre || 'Sucursal',
    cliente_nombre: String(row.cliente_nombre ?? row.cliente ?? 'Cliente'),
    contrato: String(row.contrato ?? ''),
    telefono: String(row.telefono ?? ''),
    monto_prestamo: Number(row.monto_prestamo ?? 0) || 0,
    estatus_vencimiento: estatusVencimiento,
    fecha_vencimiento: fechaVenc,
    reporte_cajera: reporteCajera,
    estatus_auditoria: estatusAuditoria,
    observaciones_admin: String(row.observaciones_admin ?? ''),
    cajera_nombre: String(
      row.cajera_nombre ?? matchedSuc?.responsable_caja ?? ''
    ),
    llamada_registrada:
      row.llamada_registrada !== undefined && row.llamada_registrada !== null
        ? Boolean(row.llamada_registrada)
        : reporteCajera !== 'Sin reporte',
    fecha_registro: String(
      row.fecha_registro ?? row.created_at ?? new Date().toISOString()
    ),
  };
}

function isClientTempId(id: string): boolean {
  return id.startsWith('ll-');
}

async function discoverLlamadasSchema(): Promise<void> {
  if (llamadasSchemaCache.validColumns || llamadasSchemaCache.openApiChecked) {
    return;
  }
  llamadasSchemaCache.openApiChecked = true;
  if (!isSupabaseConfigured()) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/openapi+json, application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return;

    const spec = (await res.json()) as {
      definitions?: Record<
        string,
        {
          properties?: Record<
            string,
            { type?: string; format?: string }
          >;
        }
      >;
    };
    const props = spec?.definitions?.[SUPABASE_TABLES.LLAMADAS]?.properties;
    if (props && Object.keys(props).length > 0) {
      llamadasSchemaCache.validColumns = new Set(Object.keys(props));
      const idProp = props.id;
      if (
        idProp &&
        (idProp.type === 'integer' ||
          idProp.type === 'number' ||
          idProp.format === 'uuid')
      ) {
        llamadasSchemaCache.omitGeneratedId = true;
      }
    }
  } catch {
    // OpenAPI introspection is optional; dynamic error-stripping handles fallback
  }
}

function extractMissingColumnFromError(err: {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}): string | null {
  const combined = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`;
  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]?([a-zA-Z0-9_]+)['"]? of relation/i,
    /column [a-zA-Z0-9_]+\.([a-zA-Z0-9_]+) does not exist/i,
    /column ['"]?([a-zA-Z0-9_]+)['"]? does not exist/i,
  ];
  for (const regex of patterns) {
    const match = combined.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function isRlsOrAuthError(err: { code?: string; message?: string }): boolean {
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('jwt')
  );
}

function buildLlamadaPayload(llamada: LlamadaSucursal): Record<string, unknown> {
  const monto = Number(llamada.monto_prestamo);
  const safeMonto = Number.isFinite(monto) && monto >= 0 ? monto : 0;
  const safeFechaVenc =
    llamada.fecha_vencimiento && String(llamada.fecha_vencimiento).trim()
      ? String(llamada.fecha_vencimiento).trim().slice(0, 10)
      : null;

  const candidateValues: Record<string, unknown> = {
    id: llamada.id,
    sucursal_id: llamada.sucursal_id,
    sucursal_nombre: llamada.sucursal_nombre,
    sucursal: llamada.sucursal_nombre,
    cliente_nombre: llamada.cliente_nombre,
    cliente: llamada.cliente_nombre,
    contrato: llamada.contrato,
    telefono: llamada.telefono,
    monto_prestamo: safeMonto,
    estatus_vencimiento: llamada.estatus_vencimiento,
    fecha_vencimiento: safeFechaVenc,
    reporte_cajera: llamada.reporte_cajera || 'Sin reporte',
    estatus_auditoria: llamada.estatus_auditoria || 'Sin auditar',
    observaciones_admin: llamada.observaciones_admin ?? '',
    cajera_nombre: llamada.cajera_nombre ?? '',
    llamada_registrada: Boolean(llamada.llamada_registrada),
    fecha_registro: llamada.fecha_registro || new Date().toISOString(),
  };

  const { validColumns, missingColumns, useAliasSucursal, useAliasCliente, omitGeneratedId } =
    llamadasSchemaCache;

  const payload: Record<string, unknown> = {};

  if (validColumns && validColumns.size > 0) {
    for (const [col, val] of Object.entries(candidateValues)) {
      if (!validColumns.has(col) || missingColumns.has(col)) continue;
      if (col === 'id' && omitGeneratedId && isClientTempId(llamada.id)) {
        continue;
      }
      payload[col] = val;
    }
    return payload;
  }

  // Schema not yet discovered: send canonical columns excluding known missing ones,
  // and map base aliases (sucursal / cliente) if canonical columns were rejected.
  const orderedKeys = [
    'id',
    'sucursal_id',
    'sucursal_nombre',
    ...(useAliasSucursal ? ['sucursal'] : []),
    'cliente_nombre',
    ...(useAliasCliente ? ['cliente'] : []),
    'contrato',
    'telefono',
    'monto_prestamo',
    'estatus_vencimiento',
    'fecha_vencimiento',
    'reporte_cajera',
    'estatus_auditoria',
    'observaciones_admin',
    'cajera_nombre',
    'llamada_registrada',
    'fecha_registro',
  ];

  for (const col of orderedKeys) {
    if (missingColumns.has(col)) continue;
    if (col === 'id' && omitGeneratedId && isClientTempId(llamada.id)) {
      continue;
    }
    payload[col] = candidateValues[col];
  }

  return payload;
}

function mergeDbRowWithInput(
  orig: LlamadaSucursal,
  dbRow: Record<string, unknown>
): LlamadaSucursal {
  const normalizedDb = normalizeLlamadaFromDb(dbRow);
  return {
    ...orig,
    id: dbRow.id !== undefined && dbRow.id !== null ? String(dbRow.id) : orig.id,
    sucursal_id:
      dbRow.sucursal_id !== undefined && dbRow.sucursal_id !== null
        ? normalizedDb.sucursal_id
        : orig.sucursal_id,
    sucursal_nombre:
      dbRow.sucursal_nombre !== undefined || dbRow.sucursal !== undefined
        ? normalizedDb.sucursal_nombre
        : orig.sucursal_nombre,
    cliente_nombre:
      dbRow.cliente_nombre !== undefined || dbRow.cliente !== undefined
        ? normalizedDb.cliente_nombre
        : orig.cliente_nombre,
    contrato:
      dbRow.contrato !== undefined ? normalizedDb.contrato : orig.contrato,
    telefono:
      dbRow.telefono !== undefined ? normalizedDb.telefono : orig.telefono,
    monto_prestamo:
      dbRow.monto_prestamo !== undefined
        ? normalizedDb.monto_prestamo
        : orig.monto_prestamo,
    estatus_vencimiento:
      dbRow.estatus_vencimiento !== undefined
        ? normalizedDb.estatus_vencimiento
        : orig.estatus_vencimiento,
    fecha_vencimiento:
      dbRow.fecha_vencimiento !== undefined
        ? normalizedDb.fecha_vencimiento
        : orig.fecha_vencimiento,
    reporte_cajera:
      dbRow.reporte_cajera !== undefined
        ? normalizedDb.reporte_cajera
        : orig.reporte_cajera,
    estatus_auditoria:
      dbRow.estatus_auditoria !== undefined
        ? normalizedDb.estatus_auditoria
        : orig.estatus_auditoria,
    observaciones_admin:
      dbRow.observaciones_admin !== undefined
        ? normalizedDb.observaciones_admin
        : orig.observaciones_admin,
    cajera_nombre:
      dbRow.cajera_nombre !== undefined
        ? normalizedDb.cajera_nombre
        : orig.cajera_nombre,
    llamada_registrada:
      dbRow.llamada_registrada !== undefined
        ? normalizedDb.llamada_registrada
        : orig.llamada_registrada,
    fecha_registro:
      dbRow.fecha_registro !== undefined || dbRow.created_at !== undefined
        ? normalizedDb.fecha_registro
        : orig.fecha_registro,
  };
}

async function executeLlamadasWriteChunk(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  records: LlamadaSucursal[]
): Promise<{
  ok: boolean;
  savedPairs: { origId: string; saved: LlamadaSucursal }[];
  error?: string;
  schemaFailed?: boolean;
}> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const payloads = records.map(buildLlamadaPayload);
    const hasPayloadKeys = payloads.every((p) => Object.keys(p).length > 0);
    if (!hasPayloadKeys) {
      return {
        ok: false,
        savedPairs: [],
        schemaFailed: true,
        error: `No quedaron columnas válidas para escribir en ${SUPABASE_TABLES.LLAMADAS}.`,
      };
    }

    const hasIdInPayload = payloads.every(
      (p) =>
        (typeof p.id === 'string' && p.id.length > 0) ||
        typeof p.id === 'number'
    );
    const useInsert =
      llamadasSchemaCache.useInsertInsteadOfUpsert || !hasIdInPayload;

    const query = useInsert
      ? client.from(SUPABASE_TABLES.LLAMADAS).insert(payloads).select()
      : client
          .from(SUPABASE_TABLES.LLAMADAS)
          .upsert(payloads, { onConflict: 'id' })
          .select();

    const { data, error } = await query;

    if (!error) {
      if (!data || data.length === 0) {
        return {
          ok: false,
          savedPairs: [],
          error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.LLAMADAS} (revisa políticas RLS).`,
        };
      }
      if (!llamadasSchemaCache.validColumns && data.length > 0) {
        llamadasSchemaCache.validColumns = new Set(
          Object.keys(data[0] as Record<string, unknown>)
        );
      }
      const savedPairs = (data as Record<string, unknown>[]).map((r, i) => {
        const orig = records[i] || records[0];
        return {
          origId: orig.id,
          saved: mergeDbRowWithInput(orig, r),
        };
      });
      return { ok: true, savedPairs };
    }

    if (isRlsOrAuthError(error)) {
      return {
        ok: false,
        savedPairs: [],
        error: `Error de permisos en ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(error)}`,
      };
    }

    const missingCol = extractMissingColumnFromError(error);
    if (missingCol) {
      llamadasSchemaCache.missingColumns.add(missingCol);
      if (llamadasSchemaCache.validColumns) {
        llamadasSchemaCache.validColumns.delete(missingCol);
      }
      if (
        missingCol === 'sucursal_nombre' &&
        !llamadasSchemaCache.missingColumns.has('sucursal')
      ) {
        llamadasSchemaCache.useAliasSucursal = true;
      }
      if (
        missingCol === 'cliente_nombre' &&
        !llamadasSchemaCache.missingColumns.has('cliente')
      ) {
        llamadasSchemaCache.useAliasCliente = true;
      }
      if (missingCol === 'id') {
        llamadasSchemaCache.omitGeneratedId = true;
        llamadasSchemaCache.useInsertInsteadOfUpsert = true;
      }
      continue;
    }

    const msgLower = (error.message || '').toLowerCase();
    if (
      error.code === '42P10' ||
      msgLower.includes('on conflict') ||
      msgLower.includes('no unique or exclusion constraint')
    ) {
      if (!llamadasSchemaCache.useInsertInsteadOfUpsert) {
        llamadasSchemaCache.useInsertInsteadOfUpsert = true;
        continue;
      }
    }

    if (
      error.code === '22P02' &&
      (msgLower.includes('uuid') ||
        msgLower.includes('bigint') ||
        msgLower.includes('integer')) &&
      !llamadasSchemaCache.omitGeneratedId
    ) {
      llamadasSchemaCache.omitGeneratedId = true;
      llamadasSchemaCache.useInsertInsteadOfUpsert = true;
      continue;
    }

    return {
      ok: false,
      savedPairs: [],
      error: formatSupabaseError(error),
    };
  }

  return {
    ok: false,
    savedPairs: [],
    schemaFailed: true,
    error: `No se pudieron compatibilizar las columnas de ${SUPABASE_TABLES.LLAMADAS}.`,
  };
}

export async function saveLlamada(
  llamada: LlamadaSucursal,
  allLlamadas: LlamadaSucursal[]
): Promise<ServiceResult<LlamadaSucursal>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    await discoverLlamadasSchema();
    const res = await executeLlamadasWriteChunk(conn.client, [llamada]);
    if (!res.ok) {
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.LLAMADAS}: ${res.error}`,
      };
    }
    const saved = res.savedPairs[0]?.saved || llamada;
    const nextList = allLlamadas.map((l) => (l.id === llamada.id ? saved : l));
    writeLocal(STORAGE_KEYS.LLAMADAS, nextList);
    return { ok: true, data: saved };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.LLAMADAS}`,
    };
  }
}

export async function saveLlamadasBatch(
  nuevasLlamadas: LlamadaSucursal[],
  allLlamadas: LlamadaSucursal[]
): Promise<ServiceResult<LlamadaSucursal[]>> {
  if (nuevasLlamadas.length === 0) return { ok: true, insertedCount: 0, data: [] };
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    await discoverLlamadasSchema();
    const chunkSize = 200;
    const savedByOrigId = new Map<string, LlamadaSucursal>();
    const allSaved: LlamadaSucursal[] = [];
    const rowWarnings: string[] = [];

    for (let i = 0; i < nuevasLlamadas.length; i += chunkSize) {
      const chunk = nuevasLlamadas.slice(i, i + chunkSize);
      const res = await executeLlamadasWriteChunk(conn.client, chunk);

      if (res.ok) {
        for (const pair of res.savedPairs) {
          savedByOrigId.set(pair.origId, pair.saved);
          allSaved.push(pair.saved);
        }
        continue;
      }

      // If permissions/RLS or complete schema failure, abort clearly
      if (
        res.schemaFailed ||
        (res.error && res.error.toLowerCase().includes('permisos')) ||
        (res.error && res.error.toLowerCase().includes('rls'))
      ) {
        return {
          ok: false,
          error: `Error al importar en ${SUPABASE_TABLES.LLAMADAS}: ${res.error}`,
        };
      }

      // Fallback row-by-row for this chunk so a single bad row doesn't stop the rest
      for (const row of chunk) {
        const singleRes = await executeLlamadasWriteChunk(conn.client, [row]);
        if (singleRes.ok && singleRes.savedPairs.length > 0) {
          const saved = singleRes.savedPairs[0].saved;
          savedByOrigId.set(row.id, saved);
          allSaved.push(saved);
        } else {
          rowWarnings.push(
            `${row.cliente_nombre}: ${singleRes.error || 'omitido por formato incompatible'}`
          );
        }
      }
    }

    if (allSaved.length === 0) {
      return {
        ok: false,
        error:
          rowWarnings[0] ||
          `No se pudo guardar ningún registro en ${SUPABASE_TABLES.LLAMADAS}.`,
      };
    }

    const syncedList = allLlamadas.map((l) => savedByOrigId.get(l.id) || l);
    writeLocal(STORAGE_KEYS.LLAMADAS, syncedList);

    return {
      ok: true,
      insertedCount: allSaved.length,
      data: allSaved,
      warning:
        rowWarnings.length > 0
          ? `${rowWarnings.length} fila(s) omitida(s): ${rowWarnings.slice(0, 3).join(' | ')}`
          : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al importar en ${SUPABASE_TABLES.LLAMADAS}`,
    };
  }
}

export async function deleteLlamadaRecord(
  id: string,
  allLlamadas: LlamadaSucursal[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const { error } = await conn.client
      .from(SUPABASE_TABLES.LLAMADAS)
      .delete()
      .eq('id', id);
    if (error) {
      return {
        ok: false,
        error: `Error al eliminar en ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(error)}`,
      };
    }
    writeLocal(STORAGE_KEYS.LLAMADAS, allLlamadas);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al eliminar en ${SUPABASE_TABLES.LLAMADAS}`,
    };
  }
}

export async function deleteEvidenciaFoto(
  evidenciaUrl: string | null | undefined
): Promise<ServiceResult> {
  if (!evidenciaUrl) return { ok: true };
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) return { ok: true };

  const marker = `/storage/v1/object/public/${SUPABASE_BUCKETS.EVIDENCIAS}/`;
  const idx = evidenciaUrl.indexOf(marker);
  if (idx === -1) return { ok: true };

  const objectPath = decodeURIComponent(
    evidenciaUrl.slice(idx + marker.length).split('?')[0]
  );
  if (!objectPath) return { ok: true };

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKETS.EVIDENCIAS)
    .remove([objectPath]);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function buildActividadPayload(actividad: ActividadDiaria) {
  return {
    id: actividad.id,
    sucursal_id: actividad.sucursal_id,
    sucursal_nombre: actividad.sucursal_nombre,
    titulo: actividad.titulo,
    descripcion: actividad.descripcion ?? '',
    categoria: actividad.categoria,
    responsable: actividad.responsable ?? '',
    fecha: actividad.fecha,
    dias_semana: actividad.dias_semana ?? [],
    hora_limite: actividad.hora_limite ?? null,
    sin_horario_limite: Boolean(actividad.sin_horario_limite),
    hora_completada: actividad.hora_completada ?? null,
    estatus: actividad.estatus,
    evidencia_url: actividad.evidencia_url ?? null,
    observaciones: actividad.observaciones ?? '',
  };
}

export async function saveActividad(
  actividad: ActividadDiaria,
  allActividades: ActividadDiaria[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payload = buildActividadPayload(actividad);
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.ACTIVIDADES)
      .upsert(payload, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.ACTIVIDADES}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.ACTIVIDADES} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.ACTIVIDADES, allActividades);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.ACTIVIDADES}`,
    };
  }
}

export async function saveActividadesBatch(
  nuevas: ActividadDiaria[],
  allActividades: ActividadDiaria[]
): Promise<ServiceResult> {
  if (nuevas.length === 0) return { ok: true };
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payloads = nuevas.map(buildActividadPayload);
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.ACTIVIDADES)
      .upsert(payloads, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.ACTIVIDADES}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó el guardado en ${SUPABASE_TABLES.ACTIVIDADES} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.ACTIVIDADES, allActividades);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.ACTIVIDADES}`,
    };
  }
}

export async function deleteActividadRecord(
  actividad: ActividadDiaria,
  allActividades: ActividadDiaria[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const { error } = await conn.client
      .from(SUPABASE_TABLES.ACTIVIDADES)
      .delete()
      .eq('id', actividad.id);
    if (error) {
      return {
        ok: false,
        error: `Error al eliminar en ${SUPABASE_TABLES.ACTIVIDADES}: ${formatSupabaseError(error)}`,
      };
    }
    if (actividad.evidencia_url) {
      await deleteEvidenciaFoto(actividad.evidencia_url);
    }
    writeLocal(STORAGE_KEYS.ACTIVIDADES, allActividades);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al eliminar en ${SUPABASE_TABLES.ACTIVIDADES}`,
    };
  }
}

export async function deleteActividadesByCatalogTaskId(
  taskId: string,
  allActividades: ActividadDiaria[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const prefix = `act-cat-${taskId}__`;
    const matching = allActividades.filter((a) => a.id.startsWith(prefix));
    const { error } = await conn.client
      .from(SUPABASE_TABLES.ACTIVIDADES)
      .delete()
      .like('id', `${prefix}%`);

    if (error) {
      return {
        ok: false,
        error: `Error al limpiar registros de actividad en ${SUPABASE_TABLES.ACTIVIDADES}: ${formatSupabaseError(error)}`,
      };
    }

    for (const act of matching) {
      if (act.evidencia_url) {
        await deleteEvidenciaFoto(act.evidencia_url);
      }
    }

    const remaining = allActividades.filter((a) => !a.id.startsWith(prefix));
    writeLocal(STORAGE_KEYS.ACTIVIDADES, remaining);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al limpiar actividad en ${SUPABASE_TABLES.ACTIVIDADES}`,
    };
  }
}

export async function saveGastoORefrendo(
  registro: GastoYRefrendo,
  allRegistros: GastoYRefrendo[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
      .upsert(registro, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.GASTOS_REFRENDOS}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.GASTOS_REFRENDOS} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.GASTOS_REFRENDOS, allRegistros);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.GASTOS_REFRENDOS}`,
    };
  }
}

export async function deleteGastoORefrendoRecord(
  registro: GastoYRefrendo,
  allRegistros: GastoYRefrendo[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const { error } = await conn.client
      .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
      .delete()
      .eq('id', registro.id);
    if (error) {
      return {
        ok: false,
        error: `Error al eliminar en ${SUPABASE_TABLES.GASTOS_REFRENDOS}: ${formatSupabaseError(error)}`,
      };
    }
    if (registro.evidencia_url) {
      await deleteEvidenciaFoto(registro.evidencia_url);
    }
    writeLocal(STORAGE_KEYS.GASTOS_REFRENDOS, allRegistros);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al eliminar en ${SUPABASE_TABLES.GASTOS_REFRENDOS}`,
    };
  }
}

export async function saveHorarioDia(
  horario: HorarioSucursalDia,
  allHorarios: HorarioSucursalDia[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payload = {
      id: horario.id,
      sucursal_id: horario.sucursal_id,
      dia: horario.dia,
      hora_limite_actividad: horario.hora_limite_actividad,
      hora_limite_corte: horario.hora_limite_corte,
      sin_horario_limite: Boolean(horario.sin_horario_limite),
    };
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.HORARIOS)
      .upsert(payload, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.HORARIOS}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.HORARIOS} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.HORARIOS, allHorarios);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.HORARIOS}`,
    };
  }
}

export async function saveHorariosBatch(
  targets: HorarioSucursalDia[],
  allHorarios: HorarioSucursalDia[]
): Promise<ServiceResult> {
  if (targets.length === 0) return { ok: true };
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payloads = targets.map((h) => ({
      id: h.id,
      sucursal_id: h.sucursal_id,
      dia: h.dia,
      hora_limite_actividad: h.hora_limite_actividad,
      hora_limite_corte: h.hora_limite_corte,
      sin_horario_limite: Boolean(h.sin_horario_limite),
    }));
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.HORARIOS)
      .upsert(payloads, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.HORARIOS}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.HORARIOS} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.HORARIOS, allHorarios);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.HORARIOS}`,
    };
  }
}

function buildSucursalPayload(sucursal: Sucursal) {
  return {
    id: sucursal.id,
    nombre: sucursal.nombre.trim(),
    codigo: sucursal.codigo.trim(),
    ciudad: (sucursal.ciudad ?? '').trim(),
    responsable_caja: (sucursal.responsable_caja ?? '').trim(),
    meta_llamadas_diarias: Number(sucursal.meta_llamadas_diarias) || 30,
    meta_actividades_diarias: Number(sucursal.meta_actividades_diarias) || 5,
    meta_refrendos_mensual: Number(sucursal.meta_refrendos_mensual) || 40,
    techo_gasto_mensual: Number(sucursal.techo_gasto_mensual) || 0,
    activa: Boolean(sucursal.activa),
  };
}

export async function createSucursal(
  sucursal: Sucursal,
  allSucursales: Sucursal[]
): Promise<ServiceResult<Sucursal>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payload = buildSucursalPayload(sucursal);
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.SUCURSALES)
      .insert(payload)
      .select()
      .single();
    if (error) {
      return {
        ok: false,
        error: `Error al insertar en ${SUPABASE_TABLES.SUCURSALES}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data) {
      return {
        ok: false,
        error: `Supabase no confirmó la inserción en ${SUPABASE_TABLES.SUCURSALES} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.SUCURSALES, allSucursales);
    return { ok: true, data: data as Sucursal };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al insertar en ${SUPABASE_TABLES.SUCURSALES}`,
    };
  }
}

export async function saveSucursal(
  sucursal: Sucursal,
  allSucursales: Sucursal[]
): Promise<ServiceResult<Sucursal>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payload = buildSucursalPayload(sucursal);
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.SUCURSALES)
      .upsert(payload, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error al guardar en ${SUPABASE_TABLES.SUCURSALES}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó el guardado en ${SUPABASE_TABLES.SUCURSALES} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.SUCURSALES, allSucursales);
    return { ok: true, data: data[0] as Sucursal };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.SUCURSALES}`,
    };
  }
}

export async function saveSucursalesBatch(
  sucursales: Sucursal[]
): Promise<ServiceResult> {
  if (sucursales.length === 0) return { ok: true };
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payloads = sucursales.map(buildSucursalPayload);
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.SUCURSALES)
      .upsert(payloads, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error al sincronizar ${SUPABASE_TABLES.SUCURSALES}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó el guardado en ${SUPABASE_TABLES.SUCURSALES} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.SUCURSALES, sucursales);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al sincronizar ${SUPABASE_TABLES.SUCURSALES}`,
    };
  }
}

export async function deleteSucursalRecord(
  id: string,
  allSucursales: Sucursal[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const { error } = await conn.client
      .from(SUPABASE_TABLES.SUCURSALES)
      .delete()
      .eq('id', id);
    if (error) {
      return {
        ok: false,
        error: `Error al eliminar en ${SUPABASE_TABLES.SUCURSALES}: ${formatSupabaseError(error)}`,
      };
    }
    writeLocal(STORAGE_KEYS.SUCURSALES, allSucursales);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al eliminar en ${SUPABASE_TABLES.SUCURSALES}`,
    };
  }
}

export async function saveMetaSucursal(
  meta: MetaSucursal,
  allMetas: MetaSucursal[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payload = {
      id: meta.id,
      sucursal_id: meta.sucursal_id,
      meta_llamadas_diarias: Number(meta.meta_llamadas_diarias) || 30,
      meta_actividades_diarias: Number(meta.meta_actividades_diarias) || 5,
      meta_refrendos_mensual: Number(meta.meta_refrendos_mensual) || 40,
      techo_gasto_mensual: Number(meta.techo_gasto_mensual) || 0,
    };
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.METAS)
      .upsert(payload, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.METAS}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.METAS} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.METAS, allMetas);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.METAS}`,
    };
  }
}

function buildUsuarioInsertPayload(usuario: UsuarioControlOps) {
  return {
    id: usuario.id,
    nombre: usuario.nombre.trim(),
    correo: usuario.correo.trim().toLowerCase(),
    password: usuario.password.trim(),
    rol: usuario.rol,
    sucursal_id: usuario.sucursal_id,
    activo: Boolean(usuario.activo),
  };
}

export async function createUsuario(
  usuario: UsuarioControlOps,
  allUsuarios: UsuarioControlOps[]
): Promise<ServiceResult<UsuarioControlOps>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payload = buildUsuarioInsertPayload(usuario);
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.USUARIOS)
      .insert(payload)
      .select()
      .single();

    if (error) {
      return {
        ok: false,
        error: `Error al insertar en ${SUPABASE_TABLES.USUARIOS}: ${formatSupabaseError(error)}`,
      };
    }

    if (!data) {
      return {
        ok: false,
        error: `Supabase no confirmó la inserción en ${SUPABASE_TABLES.USUARIOS} (revisa RLS).`,
      };
    }

    const savedUser = data as UsuarioControlOps;
    const nextList = allUsuarios.map((u) =>
      u.id === savedUser.id ? savedUser : u
    );
    writeLocal(STORAGE_KEYS.USUARIOS, nextList);
    return { ok: true, data: savedUser };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al insertar en ${SUPABASE_TABLES.USUARIOS}`,
    };
  }
}

export async function updateUsuario(
  usuario: UsuarioControlOps,
  allUsuarios: UsuarioControlOps[]
): Promise<ServiceResult<UsuarioControlOps>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payload = buildUsuarioInsertPayload(usuario);
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.USUARIOS)
      .update({
        nombre: payload.nombre,
        correo: payload.correo,
        password: payload.password,
        rol: payload.rol,
        sucursal_id: payload.sucursal_id,
        activo: payload.activo,
      })
      .eq('id', usuario.id)
      .select();

    if (error) {
      return {
        ok: false,
        error: `Error al actualizar en ${SUPABASE_TABLES.USUARIOS}: ${formatSupabaseError(error)}`,
      };
    }

    let savedUser: UsuarioControlOps | undefined = data?.[0] as
      | UsuarioControlOps
      | undefined;

    if (!savedUser) {
      const { data: inserted, error: insertError } = await conn.client
        .from(SUPABASE_TABLES.USUARIOS)
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        return {
          ok: false,
          error: `Error al registrar usuario en ${SUPABASE_TABLES.USUARIOS}: ${formatSupabaseError(insertError)}`,
        };
      }
      savedUser = inserted as UsuarioControlOps;
    }

    const nextList = allUsuarios.map((u) =>
      u.id === savedUser!.id ? savedUser! : u
    );
    writeLocal(STORAGE_KEYS.USUARIOS, nextList);
    return { ok: true, data: savedUser };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al actualizar en ${SUPABASE_TABLES.USUARIOS}`,
    };
  }
}

export async function deleteUsuarioRecord(
  id: string,
  allUsuarios: UsuarioControlOps[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const { error } = await conn.client
      .from(SUPABASE_TABLES.USUARIOS)
      .delete()
      .eq('id', id);
    if (error) {
      return {
        ok: false,
        error: `Error al eliminar en ${SUPABASE_TABLES.USUARIOS}: ${formatSupabaseError(error)}`,
      };
    }
    writeLocal(STORAGE_KEYS.USUARIOS, allUsuarios);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al eliminar en ${SUPABASE_TABLES.USUARIOS}`,
    };
  }
}

export async function saveCatalogos(
  catalogos: CatalogosControlOps
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const payload = {
      id: catalogos.id || 'cat-global',
      tareas_obligatorias: catalogos.tareas_obligatorias ?? [],
      opciones_llamada: catalogos.opciones_llamada ?? [],
    };
    const { data, error } = await conn.client
      .from(SUPABASE_TABLES.CATALOGOS)
      .upsert(payload, { onConflict: 'id' })
      .select();
    if (error) {
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.CATALOGOS}: ${formatSupabaseError(error)}`,
      };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.CATALOGOS} (revisa RLS).`,
      };
    }
    writeLocal(STORAGE_KEYS.CATALOGOS, catalogos);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al guardar en ${SUPABASE_TABLES.CATALOGOS}`,
    };
  }
}

export async function uploadEvidenciaFoto(
  file: File,
  folder: 'actividades' | 'gastos',
  sucursalId: string
): Promise<{ url: string; uploadedToSupabase: boolean; error?: string }> {
  const supabase = getSupabaseClient();

  if (supabase && isSupabaseConfigured()) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanName = `${folder}/${sucursalId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from(SUPABASE_BUCKETS.EVIDENCIAS)
      .upload(cleanName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (!error) {
      const { data } = supabase.storage
        .from(SUPABASE_BUCKETS.EVIDENCIAS)
        .getPublicUrl(cleanName);
      return { url: data.publicUrl, uploadedToSupabase: true };
    }

    const fallbackUrl = await readFileAsDataURL(file);
    return {
      url: fallbackUrl,
      uploadedToSupabase: false,
      error: `No se pudo subir al bucket "${SUPABASE_BUCKETS.EVIDENCIAS}": ${error.message}. Se guardó vista previa local.`,
    };
  }

  const localUrl = await readFileAsDataURL(file);
  return { url: localUrl, uploadedToSupabase: false };
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

export function resetDemoLocalData(): LoadedOperationalData {
  const horarios = buildInitialHorarios(INITIAL_SUCURSALES);
  writeLocal(STORAGE_KEYS.SUCURSALES, INITIAL_SUCURSALES);
  writeLocal(STORAGE_KEYS.METAS, INITIAL_METAS_SUCURSAL);
  writeLocal(STORAGE_KEYS.CATALOGOS, INITIAL_CATALOGOS);
  writeLocal(STORAGE_KEYS.USUARIOS, INITIAL_USUARIOS);
  writeLocal(STORAGE_KEYS.LLAMADAS, INITIAL_LLAMADAS);
  writeLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
  writeLocal(STORAGE_KEYS.GASTOS_REFRENDOS, INITIAL_GASTOS_REFRENDOS);
  writeLocal(STORAGE_KEYS.HORARIOS, horarios);
  return {
    sucursales: INITIAL_SUCURSALES,
    metas: INITIAL_METAS_SUCURSAL,
    catalogos: INITIAL_CATALOGOS,
    usuarios: INITIAL_USUARIOS,
    llamadas: INITIAL_LLAMADAS,
    actividades: INITIAL_ACTIVIDADES,
    gastosYRefrendos: INITIAL_GASTOS_REFRENDOS,
    horarios,
    source: 'demo',
  };
}
