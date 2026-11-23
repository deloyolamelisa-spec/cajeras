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
  FraseMotivacional,
  GastoYRefrendo,
  HorarioSucursalDia,
  LlamadaSucursal,
  MetaSucursal,
  PlantillaWhatsApp,
  Sucursal,
  UsuarioControlOps,
} from '../types/controlops';
import {
  DEFAULT_FRASES_MOTIVACIONALES,
  DEFAULT_WHATSAPP_TEMPLATES,
  INITIAL_ACTIVIDADES,
  INITIAL_CATALOGOS,
  INITIAL_GASTOS_REFRENDOS,
  INITIAL_LLAMADAS,
  INITIAL_METAS_SUCURSAL,
  INITIAL_SUCURSALES,
  INITIAL_USUARIOS,
  buildInitialHorarios,
} from '../data/mockData';
import {
  addDaysYYYYMMDD,
  calcularPuntualidadEnvio,
  ensureBaseDailyCatalogTasks,
  extractLlamadaBatchInfo,
  getLlamadaLocalDate,
  getMexicoNowParts,
  getTodayLocalYYYYMMDD,
  isLlamadaRealizadaRecord,
  matchesSucursalRecord,
  normalizeSucursalNameForDb,
  parseMoneyInput,
  roundMoney2,
  toLocalYYYYMMDD,
} from '../utils/calculations';

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
    const fetchAllLlamadasPaginated = async (): Promise<{
      data: Record<string, unknown>[] | null;
      error: {
        message?: string;
        details?: string | null;
        hint?: string | null;
        code?: string;
      } | null;
    }> => {
      const pageSize = 1000;
      const allRows: Record<string, unknown>[] = [];
      const seenIds = new Set<string>();
      const pushUniqueRows = (chunk: Record<string, unknown>[]) => {
        for (const r of chunk) {
          const idKey =
            r.id !== undefined && r.id !== null ? String(r.id) : '';
          if (idKey && seenIds.has(idKey)) continue;
          if (idKey) seenIds.add(idKey);
          allRows.push(r);
        }
      };

      const todayMexico = getTodayLocalYYYYMMDD();
      const twoDaysLaterMexico = addDaysYYYYMMDD(todayMexico, 2);
      // Paginated explicit fetch of today's records first so PostgREST's 1000-row cap never cuts off today's calls
      for (let page = 0; page < 10; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const todayOrRes = await supabase
          .from(SUPABASE_TABLES.LLAMADAS)
          .select('*')
          .or(
            `fecha.eq.${todayMexico},and(fecha_registro.gte.${todayMexico},fecha_registro.lt.${twoDaysLaterMexico})`
          )
          .order('id', { ascending: false })
          .range(from, to);
        if (todayOrRes.error || !Array.isArray(todayOrRes.data)) break;
        const chunk = todayOrRes.data as Record<string, unknown>[];
        pushUniqueRows(chunk);
        if (chunk.length < pageSize) break;
      }

      let useOrder = true;
      for (let page = 0; page < 20; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const baseQuery = supabase.from(SUPABASE_TABLES.LLAMADAS).select('*');
        const res = useOrder
          ? await baseQuery.order('id', { ascending: false }).range(from, to)
          : await baseQuery.range(from, to);

        if (res.error) {
          if (useOrder && page === 0) {
            useOrder = false;
            const fallbackRes = await supabase
              .from(SUPABASE_TABLES.LLAMADAS)
              .select('*')
              .range(from, to);
            if (fallbackRes.error) {
              return {
                data: allRows.length > 0 ? allRows : null,
                error: fallbackRes.error,
              };
            }
            const chunk = (fallbackRes.data || []) as Record<string, unknown>[];
            pushUniqueRows(chunk);
            if (chunk.length < pageSize) break;
            continue;
          }
          return {
            data: allRows.length > 0 ? allRows : null,
            error: res.error,
          };
        }

        const chunk = (res.data || []) as Record<string, unknown>[];
        pushUniqueRows(chunk);
        if (chunk.length < pageSize) break;
      }

      return { data: allRows, error: null };
    };

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
      fetchAllLlamadasPaginated(),
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

    const parseWhatsappTemplates = (
      rows: CatalogosControlOps[],
      mainRow?: CatalogosControlOps
    ): PlantillaWhatsApp[] => {
      if (
        mainRow &&
        Array.isArray(mainRow.plantillas_whatsapp) &&
        mainRow.plantillas_whatsapp.length > 0
      ) {
        return mainRow.plantillas_whatsapp;
      }
      const waRow = rows.find((r) => r.id === 'cat-whatsapp');
      if (waRow && Array.isArray(waRow.opciones_llamada)) {
        for (const entry of waRow.opciones_llamada) {
          if (typeof entry === 'string' && entry.trim().startsWith('[')) {
            try {
              const parsed = JSON.parse(entry) as PlantillaWhatsApp[];
              if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
      return DEFAULT_WHATSAPP_TEMPLATES;
    };

    const parseFrasesMotivacionales = (
      rows: CatalogosControlOps[],
      mainRow?: CatalogosControlOps
    ): FraseMotivacional[] => {
      if (mainRow && Array.isArray(mainRow.frases_motivacionales)) {
        return mainRow.frases_motivacionales;
      }
      const frasesRow = rows.find((r) => r.id === 'cat-frases');
      if (frasesRow && Array.isArray(frasesRow.opciones_llamada)) {
        for (const entry of frasesRow.opciones_llamada) {
          if (typeof entry === 'string' && entry.trim().startsWith('[')) {
            try {
              const parsed = JSON.parse(entry) as FraseMotivacional[];
              if (Array.isArray(parsed)) {
                return parsed;
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
      return DEFAULT_FRASES_MOTIVACIONALES;
    };

    let catalogos: CatalogosControlOps;
    if (!catalogosRes.error && catalogosRes.data) {
      const catRows = catalogosRes.data as CatalogosControlOps[];
      if (catRows.length > 0) {
        const rawCat =
          catRows.find((r) => r.id === 'cat-global') ||
          catRows.find(
            (r) => r.id !== 'cat-whatsapp' && r.id !== 'cat-frases'
          ) ||
          catRows[0];
        catalogos = {
          ...rawCat,
          tareas_obligatorias: ensureBaseDailyCatalogTasks(
            rawCat.tareas_obligatorias
          ),
          plantillas_whatsapp: parseWhatsappTemplates(catRows, rawCat),
          frases_motivacionales: parseFrasesMotivacionales(catRows, rawCat),
        };
        writeLocal(STORAGE_KEYS.CATALOGOS, catalogos);
      } else {
        // Carga inicial única: insertar las 9 actividades base solo cuando catalogos_controlops está vacío
        const seedCatalog: CatalogosControlOps = {
          id: 'cat-global',
          tareas_obligatorias: ensureBaseDailyCatalogTasks(
            INITIAL_CATALOGOS.tareas_obligatorias
          ),
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
          const localCat = readLocal(STORAGE_KEYS.CATALOGOS, INITIAL_CATALOGOS);
          catalogos = {
            ...localCat,
            tareas_obligatorias: ensureBaseDailyCatalogTasks(
              localCat.tareas_obligatorias
            ),
            plantillas_whatsapp:
              localCat.plantillas_whatsapp &&
              localCat.plantillas_whatsapp.length > 0
                ? localCat.plantillas_whatsapp
                : DEFAULT_WHATSAPP_TEMPLATES,
            frases_motivacionales: Array.isArray(localCat.frases_motivacionales)
              ? localCat.frases_motivacionales
              : DEFAULT_FRASES_MOTIVACIONALES,
          };
        } else {
          const seededRow =
            seededData && seededData.length > 0
              ? (seededData[0] as CatalogosControlOps)
              : seedCatalog;
          catalogos = {
            ...seededRow,
            tareas_obligatorias: ensureBaseDailyCatalogTasks(
              seededRow.tareas_obligatorias
            ),
            plantillas_whatsapp: DEFAULT_WHATSAPP_TEMPLATES,
            frases_motivacionales: DEFAULT_FRASES_MOTIVACIONALES,
          };
          remoteCounts[SUPABASE_TABLES.CATALOGOS] = 1;
          writeLocal(STORAGE_KEYS.CATALOGOS, catalogos);
        }
      }
    } else {
      const localCat = readLocal(STORAGE_KEYS.CATALOGOS, INITIAL_CATALOGOS);
      catalogos = {
        ...localCat,
        tareas_obligatorias: ensureBaseDailyCatalogTasks(
          localCat.tareas_obligatorias
        ),
        plantillas_whatsapp:
          localCat.plantillas_whatsapp &&
          localCat.plantillas_whatsapp.length > 0
            ? localCat.plantillas_whatsapp
            : DEFAULT_WHATSAPP_TEMPLATES,
        frases_motivacionales: Array.isArray(localCat.frases_motivacionales)
          ? localCat.frases_motivacionales
          : DEFAULT_FRASES_MOTIVACIONALES,
      };
    }

    let llamadas: LlamadaSucursal[];
    if (!llamadasRes.error && llamadasRes.data) {
      if (llamadasRes.data.length > 0) {
        const firstRow = llamadasRes.data[0] as Record<string, unknown>;
        llamadasSchemaCache.validColumns = new Set(Object.keys(firstRow));
        if (typeof firstRow.id === 'number') {
          llamadasSchemaCache.omitGeneratedId = true;
        }
      }
      llamadas = (llamadasRes.data as Record<string, unknown>[])
        .map((row) => normalizeLlamadaFromDb(row, sucursales))
        .sort((a, b) =>
          (b.fecha_registro || '').localeCompare(a.fecha_registro || '')
        );
      writeLocal(STORAGE_KEYS.LLAMADAS, llamadas);
    } else {
      const cachedLlamadas = readLocal<LlamadaSucursal[]>(
        STORAGE_KEYS.LLAMADAS,
        []
      );
      llamadas = cachedLlamadas;
    }

    let actividades: ActividadDiaria[];
    if (!actividadesRes.error && actividadesRes.data) {
      if (actividadesRes.data.length > 0) {
        actividadesSchemaCache.validColumns = new Set(
          Object.keys(actividadesRes.data[0] as Record<string, unknown>)
        );
      }
      actividades = (actividadesRes.data as Record<string, unknown>[]).map(
        (row) => normalizeActividadFromDb(row, sucursales)
      );
      writeLocal(STORAGE_KEYS.ACTIVIDADES, actividades);
    } else {
      actividades = readLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    }

    let gastosYRefrendos: GastoYRefrendo[];
    if (!gastosRes.error && gastosRes.data) {
      if (gastosRes.data.length > 0) {
        gastosSchemaCache.validColumns = new Set(
          Object.keys(gastosRes.data[0] as Record<string, unknown>)
        );
      }
      gastosYRefrendos = (gastosRes.data as Record<string, unknown>[]).map(
        (row) => normalizeGastoFromDb(row, sucursales)
      );
      writeLocal(STORAGE_KEYS.GASTOS_REFRENDOS, gastosYRefrendos);
    } else {
      gastosYRefrendos = readLocal(
        STORAGE_KEYS.GASTOS_REFRENDOS,
        INITIAL_GASTOS_REFRENDOS
      );
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
  requireClientId: boolean;
  requireFechaLlamada: boolean;
  useInsertInsteadOfUpsert: boolean;
  openApiChecked: boolean;
}

const llamadasSchemaCache: LlamadasSchemaCache = {
  validColumns: null,
  missingColumns: new Set<string>(),
  useAliasSucursal: false,
  useAliasCliente: false,
  omitGeneratedId: false,
  requireClientId: false,
  requireFechaLlamada: false,
  useInsertInsteadOfUpsert: false,
  openApiChecked: false,
};

function computeSafeVencimiento(fechaVenc: string): EstatusVencimiento {
  if (!fechaVenc) return 'Al corriente';
  const todayStr = getTodayLocalYYYYMMDD();
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
    sucursales.find((s) =>
      matchesSucursalRecord(
        {
          sucursal_id: rawSucId,
          sucursal_nombre: rawSucName,
          sucursal: rawSucName,
        },
        s
      )
    ) || undefined;

  const fechaVenc = row.fecha_vencimiento
    ? String(row.fecha_vencimiento).slice(0, 10)
    : '';
  const reporteCajera =
    String(row.respuesta ?? row.reporte_cajera ?? 'Sin reporte').trim() ||
    'Sin reporte';
  const hasExplicitStatus =
    (row.realizada !== undefined && row.realizada !== null) ||
    (row.llamada_registrada !== undefined && row.llamada_registrada !== null) ||
    (row.estatus !== undefined && row.estatus !== null && String(row.estatus).trim() !== '') ||
    (row.estado !== undefined && row.estado !== null && String(row.estado).trim() !== '') ||
    (row.estatus_llamada !== undefined && row.estatus_llamada !== null && String(row.estatus_llamada).trim() !== '');
  const isRealizada = hasExplicitStatus
    ? isLlamadaRealizadaRecord(row)
    : reporteCajera !== 'Sin reporte' && reporteCajera !== 'Pendiente';

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

  const parsedMonto = parseMoneyInput(
    row.monto_prestamo ??
      row.monto ??
      row.prestamo ??
      row.importe ??
      row.saldo ??
      0
  );
  const rawFechaCol = row.fecha ? String(row.fecha).trim() : '';
  const rawFechaRegistroCol = row.fecha_registro
    ? String(row.fecha_registro).trim()
    : '';
  const rawCreatedAt = row.created_at ? String(row.created_at).trim() : '';
  const rawFechaLlamada = String(row.fecha_llamada ?? '').trim();

  const resolvedLocalDate = toLocalYYYYMMDD(
    rawFechaCol ||
      rawFechaRegistroCol ||
      rawFechaLlamada ||
      rawCreatedAt ||
      getTodayLocalYYYYMMDD()
  );

  const rawHora = String(row.hora_llamada ?? '').trim();
  const horaLlamada =
    rawHora ||
    (isRealizada && rawCreatedAt
      ? getMexicoNowParts(new Date(rawCreatedAt)).hhmm
      : undefined);

  const rawLote = Number(row.lote_base);
  const loteBase =
    Number.isInteger(rawLote) && rawLote >= 1 ? rawLote : undefined;

  return {
    id: idStr,
    sucursal_id: matchedSuc?.id || rawSucId || '',
    sucursal_nombre: matchedSuc?.nombre || rawSucName || 'Sucursal',
    sucursal: rawSucName || normalizeSucursalNameForDb(matchedSuc?.nombre) || 'SUCURSAL',
    cliente_nombre: String(
      row.cliente_nombre ?? row.cliente ?? row.nombre_cliente ?? 'Cliente'
    ),
    contrato: String(row.contrato ?? ''),
    telefono: String(row.telefono ?? ''),
    monto_prestamo: parsedMonto,
    monto: parsedMonto,
    estatus_vencimiento: estatusVencimiento,
    fecha_vencimiento: fechaVenc,
    reporte_cajera: reporteCajera,
    respuesta: reporteCajera,
    estatus_auditoria: estatusAuditoria,
    observaciones_admin: String(
      row.observaciones_admin ??
        row.observaciones ??
        row.observacion ??
        row.notas_cajera ??
        ''
    ),
    cajera_nombre: String(
      row.cajera_nombre ?? matchedSuc?.responsable_caja ?? ''
    ),
    cajera_id:
      row.cajera_id !== undefined && row.cajera_id !== null
        ? String(row.cajera_id)
        : undefined,
    llamada_registrada: isRealizada,
    realizada: isRealizada,
    estatus: isRealizada ? 'Realizada' : 'Pendiente',
    estado: isRealizada ? 'Realizada' : 'Pendiente',
    hora_llamada: horaLlamada,
    fecha_llamada: rawFechaLlamada
      ? toLocalYYYYMMDD(rawFechaLlamada)
      : undefined,
    fecha: rawFechaCol ? toLocalYYYYMMDD(rawFechaCol) : resolvedLocalDate,
    fecha_registro: rawFechaRegistroCol
      ? toLocalYYYYMMDD(rawFechaRegistroCol)
      : resolvedLocalDate,
    created_at: rawCreatedAt || undefined,
    lote_base: loteBase,
  };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isClientTempId(id: string): boolean {
  const trimmed = String(id || '').trim();
  if (!trimmed) return true;
  return !UUID_REGEX.test(trimmed) && !/^\d+$/.test(trimmed);
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

function buildLlamadaCandidateValues(
  llamada: LlamadaSucursal
): Record<string, unknown> {
  const safeMonto = roundMoney2(llamada.monto_prestamo ?? llamada.monto ?? 0);
  const safeFechaVenc =
    llamada.fecha_vencimiento && String(llamada.fecha_vencimiento).trim()
      ? String(llamada.fecha_vencimiento).trim().slice(0, 10)
      : null;

  const safeSucursalNombre =
    (
      llamada.sucursal_nombre ||
      llamada.sucursal ||
      llamada.sucursal_id ||
      'Sucursal'
    ).trim() || 'Sucursal';
  const normalizedSucursal = normalizeSucursalNameForDb(
    llamada.sucursal || llamada.sucursal_nombre || llamada.sucursal_id
  );

  const isTemp = isClientTempId(llamada.id);
  const isRealizada = isLlamadaRealizadaRecord(llamada);
  const estadoLabel = isRealizada ? 'Realizada' : 'Pendiente';
  const todayMexico = getTodayLocalYYYYMMDD();
  const safeFechaLocal = toLocalYYYYMMDD(
    llamada.fecha || llamada.fecha_registro || todayMexico
  );
  const horaLlamada =
    llamada.hora_llamada && llamada.hora_llamada.trim()
      ? llamada.hora_llamada.trim()
      : isRealizada
        ? getMexicoNowParts().hhmm
        : null;
  const fechaLlamada = isRealizada
    ? toLocalYYYYMMDD(llamada.fecha_llamada || todayMexico)
    : llamadasSchemaCache.requireFechaLlamada
      ? safeFechaLocal
      : llamada.fecha_llamada
        ? toLocalYYYYMMDD(llamada.fecha_llamada)
        : null;
  const respuestaVal =
    llamada.respuesta || llamada.reporte_cajera || 'Sin reporte';
  const safeCajeraId = (llamada.cajera_id || '').trim() || null;

  const batchLote =
    llamada.lote_base ?? extractLlamadaBatchInfo(llamada)?.loteNum ?? 1;

  return {
    id: isTemp ? llamada.id : toDbFilterId(llamada.id),
    sucursal_id: llamada.sucursal_id || safeSucursalNombre,
    sucursal_nombre: safeSucursalNombre,
    sucursal: normalizedSucursal,
    cliente_nombre: llamada.cliente_nombre,
    cliente: llamada.cliente_nombre,
    nombre_cliente: llamada.cliente_nombre,
    contrato: llamada.contrato,
    telefono: llamada.telefono,
    monto_prestamo: safeMonto >= 0 ? safeMonto : 0,
    monto: safeMonto >= 0 ? safeMonto : 0,
    estatus_vencimiento: llamada.estatus_vencimiento,
    fecha_vencimiento: safeFechaVenc,
    reporte_cajera: respuestaVal,
    respuesta: respuestaVal,
    estatus_auditoria: llamada.estatus_auditoria || 'Sin auditar',
    observaciones_admin: llamada.observaciones_admin ?? '',
    observaciones: llamada.observaciones_admin ?? '',
    observacion: llamada.observaciones_admin ?? '',
    notas_cajera: llamada.observaciones_admin ?? '',
    cajera_nombre: (llamada.cajera_nombre ?? '').trim(),
    cajera_id: safeCajeraId,
    llamada_registrada: isRealizada,
    realizada: isRealizada,
    estatus: estadoLabel,
    estado: estadoLabel,
    estatus_llamada: estadoLabel,
    hora_llamada: horaLlamada,
    fecha_llamada: fechaLlamada,
    fecha: safeFechaLocal,
    fecha_registro: safeFechaLocal,
    lote_base: Number.isInteger(Number(batchLote)) ? Number(batchLote) : 1,
  };
}

function buildLlamadaPayload(
  llamada: LlamadaSucursal,
  options?: { forceOmitId?: boolean; forceIncludeId?: boolean }
): Record<string, unknown> {
  const isTemp = isClientTempId(llamada.id);
  const candidateValues = buildLlamadaCandidateValues(llamada);

  const { validColumns, missingColumns, omitGeneratedId, requireClientId } =
    llamadasSchemaCache;

  const shouldOmitId =
    options?.forceIncludeId
      ? false
      : options?.forceOmitId ||
        (isTemp && (omitGeneratedId || !requireClientId));

  const payload: Record<string, unknown> = {};

  if (validColumns && validColumns.size > 0) {
    for (const [col, val] of Object.entries(candidateValues)) {
      if (!validColumns.has(col) || missingColumns.has(col)) continue;
      if (col === 'id' && shouldOmitId) {
        continue;
      }
      payload[col] = val;
    }
    return payload;
  }

  // Schema not yet discovered: send canonical columns plus optional equivalents.
  // Missing optional columns are stripped automatically on retry.
  const orderedKeys = [
    'id',
    'sucursal',
    'sucursal_id',
    'sucursal_nombre',
    'cliente',
    'cliente_nombre',
    'nombre_cliente',
    'contrato',
    'telefono',
    'monto_prestamo',
    'monto',
    'estatus_vencimiento',
    'fecha_vencimiento',
    'reporte_cajera',
    'respuesta',
    'estatus_auditoria',
    'observaciones_admin',
    'observaciones',
    'observacion',
    'notas_cajera',
    'cajera_nombre',
    'cajera_id',
    'llamada_registrada',
    'realizada',
    'estatus',
    'estado',
    'estatus_llamada',
    'hora_llamada',
    'fecha_llamada',
    'fecha',
    'fecha_registro',
    'lote_base',
  ];

  for (const col of orderedKeys) {
    if (missingColumns.has(col)) continue;
    if (col === 'id' && shouldOmitId) {
      continue;
    }
    payload[col] = candidateValues[col];
  }

  return payload;
}

function buildLlamadaUpdatePayload(
  llamada: LlamadaSucursal
): Record<string, unknown> {
  const candidateValues = buildLlamadaCandidateValues(llamada);
  const { validColumns, missingColumns } = llamadasSchemaCache;

  const updateKeys = [
    'estatus',
    'estado',
    'estatus_llamada',
    'realizada',
    'llamada_registrada',
    'respuesta',
    'reporte_cajera',
    'hora_llamada',
    'fecha_llamada',
    'cajera_nombre',
    'cajera_id',
    'observaciones_admin',
    'observaciones',
    'observacion',
    'notas_cajera',
    'estatus_auditoria',
    'lote_base',
  ];

  const payload: Record<string, unknown> = {};
  const hasKnownSchema = Boolean(validColumns && validColumns.size > 0);
  for (const col of updateKeys) {
    if (missingColumns.has(col)) continue;
    if (hasKnownSchema && !validColumns!.has(col)) {
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
  const hasMontoInDb =
    dbRow.monto_prestamo !== undefined ||
    dbRow.monto !== undefined ||
    dbRow.prestamo !== undefined ||
    dbRow.importe !== undefined;
  const hasStatusInDb =
    dbRow.llamada_registrada !== undefined ||
    dbRow.realizada !== undefined ||
    dbRow.estatus !== undefined ||
    dbRow.estado !== undefined ||
    dbRow.estatus_llamada !== undefined;
  return {
    ...orig,
    id: dbRow.id !== undefined && dbRow.id !== null ? String(dbRow.id) : orig.id,
    sucursal_id:
      orig.sucursal_id ||
      (dbRow.sucursal_id !== undefined && dbRow.sucursal_id !== null
        ? normalizedDb.sucursal_id
        : orig.sucursal_id),
    sucursal_nombre:
      orig.sucursal_nombre ||
      (dbRow.sucursal_nombre !== undefined || dbRow.sucursal !== undefined
        ? normalizedDb.sucursal_nombre
        : orig.sucursal_nombre),
    sucursal:
      dbRow.sucursal !== undefined
        ? String(dbRow.sucursal)
        : orig.sucursal || orig.sucursal_nombre,
    cliente_nombre:
      dbRow.cliente_nombre !== undefined ||
      dbRow.cliente !== undefined ||
      dbRow.nombre_cliente !== undefined
        ? normalizedDb.cliente_nombre
        : orig.cliente_nombre,
    contrato:
      dbRow.contrato !== undefined ? normalizedDb.contrato : orig.contrato,
    telefono:
      dbRow.telefono !== undefined ? normalizedDb.telefono : orig.telefono,
    monto_prestamo: hasMontoInDb
      ? normalizedDb.monto_prestamo
      : orig.monto_prestamo,
    monto: hasMontoInDb ? normalizedDb.monto_prestamo : orig.monto_prestamo,
    estatus_vencimiento:
      dbRow.estatus_vencimiento !== undefined
        ? normalizedDb.estatus_vencimiento
        : orig.estatus_vencimiento,
    fecha_vencimiento:
      dbRow.fecha_vencimiento !== undefined
        ? normalizedDb.fecha_vencimiento
        : orig.fecha_vencimiento,
    reporte_cajera:
      dbRow.reporte_cajera !== undefined || dbRow.respuesta !== undefined
        ? normalizedDb.reporte_cajera
        : orig.reporte_cajera,
    respuesta:
      dbRow.respuesta !== undefined || dbRow.reporte_cajera !== undefined
        ? normalizedDb.reporte_cajera
        : orig.respuesta || orig.reporte_cajera,
    estatus_auditoria:
      dbRow.estatus_auditoria !== undefined
        ? normalizedDb.estatus_auditoria
        : orig.estatus_auditoria,
    observaciones_admin:
      dbRow.observaciones_admin !== undefined ||
      dbRow.observaciones !== undefined ||
      dbRow.observacion !== undefined ||
      dbRow.notas_cajera !== undefined
        ? normalizedDb.observaciones_admin
        : orig.observaciones_admin,
    cajera_nombre:
      dbRow.cajera_nombre !== undefined
        ? normalizedDb.cajera_nombre
        : orig.cajera_nombre,
    cajera_id:
      dbRow.cajera_id !== undefined
        ? normalizedDb.cajera_id
        : orig.cajera_id,
    llamada_registrada: hasStatusInDb
      ? normalizedDb.llamada_registrada
      : orig.llamada_registrada,
    realizada: hasStatusInDb
      ? normalizedDb.llamada_registrada
      : orig.realizada ?? orig.llamada_registrada,
    estatus: hasStatusInDb ? normalizedDb.estatus : orig.estatus,
    estado: hasStatusInDb ? normalizedDb.estado : orig.estado,
    hora_llamada:
      dbRow.hora_llamada !== undefined
        ? normalizedDb.hora_llamada
        : orig.hora_llamada,
    fecha_llamada:
      dbRow.fecha_llamada !== undefined
        ? normalizedDb.fecha_llamada
        : orig.fecha_llamada,
    fecha: dbRow.fecha !== undefined ? normalizedDb.fecha : orig.fecha,
    fecha_registro:
      dbRow.fecha_registro !== undefined
        ? normalizedDb.fecha_registro
        : orig.fecha_registro,
    created_at:
      dbRow.created_at !== undefined
        ? String(dbRow.created_at)
        : orig.created_at,
    lote_base:
      dbRow.lote_base !== undefined && dbRow.lote_base !== null
        ? normalizedDb.lote_base
        : orig.lote_base,
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
  let lastError: {
    message?: string;
    details?: string | null;
    hint?: string | null;
    code?: string;
  } | null = null;

  const allClientTemp = records.every((r) => isClientTempId(r.id));

  for (let attempt = 0; attempt < 35; attempt++) {
    const payloads = records.map((r) =>
      buildLlamadaPayload(r, allClientTemp ? { forceOmitId: !llamadasSchemaCache.requireClientId } : undefined)
    );
    const hasPayloadKeys = payloads.every((p) => Object.keys(p).length > 0);
    if (!hasPayloadKeys) {
      return {
        ok: false,
        savedPairs: [],
        schemaFailed: true,
        error: lastError
          ? formatSupabaseError(lastError)
          : `No quedaron columnas válidas para escribir en ${SUPABASE_TABLES.LLAMADAS}.`,
      };
    }

    const isSingleExistingUpdate =
      records.length === 1 && !isClientTempId(records[0].id);

    let data: unknown[] | null = null;
    let error: {
      message?: string;
      details?: string | null;
      hint?: string | null;
      code?: string;
    } | null = null;

    if (isSingleExistingUpdate) {
      const updatePayload = { ...payloads[0] };
      delete updatePayload.id;
      const updateRes = await client
        .from(SUPABASE_TABLES.LLAMADAS)
        .update(updatePayload)
        .eq('id', toDbFilterId(records[0].id))
        .select();

      if (updateRes.error) {
        error = updateRes.error;
      } else if (updateRes.data && updateRes.data.length > 0) {
        data = updateRes.data;
      } else {
        const insertRes = await client
          .from(SUPABASE_TABLES.LLAMADAS)
          .insert(payloads[0])
          .select();
        data = insertRes.data;
        error = insertRes.error;
      }
    } else if (allClientTemp) {
      // Real .insert(...).select() for CSV/Excel imports and new call entries
      const insertRes = await client
        .from(SUPABASE_TABLES.LLAMADAS)
        .insert(payloads)
        .select();
      data = insertRes.data;
      error = insertRes.error;
    } else {
      const hasIdInPayload = payloads.every(
        (p) =>
          (typeof p.id === 'string' && p.id.length > 0) ||
          typeof p.id === 'number'
      );
      const useInsert =
        llamadasSchemaCache.useInsertInsteadOfUpsert || !hasIdInPayload;

      const res = useInsert
        ? await client.from(SUPABASE_TABLES.LLAMADAS).insert(payloads).select()
        : await client
            .from(SUPABASE_TABLES.LLAMADAS)
            .upsert(payloads, { onConflict: 'id' })
            .select();
      data = res.data;
      error = res.error;
    }

    if (!error) {
      if (!data || data.length === 0) {
        return {
          ok: false,
          savedPairs: [],
          error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.LLAMADAS} (devolvió 0 filas; revisa políticas RLS).`,
        };
      }
      if (data.length > 0) {
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

    lastError = error;

    if (isRlsOrAuthError(error)) {
      return {
        ok: false,
        savedPairs: [],
        error: `Error de permisos en ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(error)}`,
      };
    }

    const missingCol = extractMissingColumnFromError(error);
    if (
      missingCol &&
      !llamadasSchemaCache.missingColumns.has(missingCol)
    ) {
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
      error.code === '23502' &&
      (msgLower.includes('"id"') || msgLower.includes('column id')) &&
      allClientTemp &&
      !llamadasSchemaCache.requireClientId
    ) {
      llamadasSchemaCache.requireClientId = true;
      llamadasSchemaCache.omitGeneratedId = false;
      continue;
    }

    if (
      error.code === '23502' &&
      msgLower.includes('fecha_llamada') &&
      !llamadasSchemaCache.requireFechaLlamada
    ) {
      llamadasSchemaCache.requireFechaLlamada = true;
      continue;
    }

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

    if (error.code === '22P02') {
      if (
        msgLower.includes('cajera_id') &&
        !llamadasSchemaCache.missingColumns.has('cajera_id')
      ) {
        llamadasSchemaCache.missingColumns.add('cajera_id');
        continue;
      }
      if (
        msgLower.includes('sucursal_id') &&
        !llamadasSchemaCache.missingColumns.has('sucursal_id')
      ) {
        llamadasSchemaCache.missingColumns.add('sucursal_id');
        continue;
      }
      if (
        (msgLower.includes('uuid') ||
          msgLower.includes('bigint') ||
          msgLower.includes('integer')) &&
        !llamadasSchemaCache.omitGeneratedId
      ) {
        llamadasSchemaCache.omitGeneratedId = true;
        llamadasSchemaCache.requireClientId = false;
        llamadasSchemaCache.useInsertInsteadOfUpsert = true;
        continue;
      }
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
    error: lastError
      ? formatSupabaseError(lastError)
      : `No se pudieron compatibilizar las columnas de ${SUPABASE_TABLES.LLAMADAS}.`,
  };
}

export async function updateLlamadaById(
  llamada: LlamadaSucursal,
  allLlamadas: LlamadaSucursal[]
): Promise<ServiceResult<LlamadaSucursal>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  if (isClientTempId(llamada.id)) {
    return {
      ok: false,
      error: `El registro "${llamada.cliente_nombre}" no tiene un ID real de Supabase (${llamada.id}). Recarga o vuelve a importar la base para guardarlo en ${SUPABASE_TABLES.LLAMADAS}.`,
    };
  }

  try {
    await discoverLlamadasSchema();
    let lastError: {
      message?: string;
      details?: string | null;
      hint?: string | null;
      code?: string;
    } | null = null;

    for (let attempt = 0; attempt < 30; attempt++) {
      const updatePayload = buildLlamadaUpdatePayload(llamada);
      if (Object.keys(updatePayload).length === 0) {
        return {
          ok: false,
          error: lastError
            ? `Error en ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(lastError)}`
            : `No quedaron columnas válidas para actualizar en ${SUPABASE_TABLES.LLAMADAS}.`,
        };
      }

      const { data, error } = await conn.client
        .from(SUPABASE_TABLES.LLAMADAS)
        .update(updatePayload)
        .eq('id', toDbFilterId(llamada.id))
        .select();

      if (!error) {
        if (!data || data.length === 0) {
          return {
            ok: false,
            error: `Supabase devolvió 0 filas actualizadas para id=${llamada.id} en ${SUPABASE_TABLES.LLAMADAS}. Verifica que el registro exista y que las políticas RLS permitan UPDATE.`,
          };
        }
        const firstRow = data[0] as Record<string, unknown>;
        llamadasSchemaCache.validColumns = new Set(Object.keys(firstRow));
        const saved = mergeDbRowWithInput(llamada, firstRow);
        const latestLocal = readLocal<LlamadaSucursal[]>(
          STORAGE_KEYS.LLAMADAS,
          allLlamadas
        );
        const nextList = latestLocal.some((l) => l.id === llamada.id)
          ? latestLocal.map((l) => (l.id === llamada.id ? saved : l))
          : [saved, ...latestLocal];
        writeLocal(STORAGE_KEYS.LLAMADAS, nextList);
        return { ok: true, data: saved };
      }

      lastError = error;

      if (isRlsOrAuthError(error)) {
        return {
          ok: false,
          error: `Error de permisos en ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(error)}`,
        };
      }

      const missingCol = extractMissingColumnFromError(error);
      if (missingCol && !llamadasSchemaCache.missingColumns.has(missingCol)) {
        llamadasSchemaCache.missingColumns.add(missingCol);
        if (llamadasSchemaCache.validColumns) {
          llamadasSchemaCache.validColumns.delete(missingCol);
        }
        continue;
      }

      const msgLower = (error.message || '').toLowerCase();
      if (error.code === '22P02') {
        if (
          msgLower.includes('cajera_id') &&
          !llamadasSchemaCache.missingColumns.has('cajera_id')
        ) {
          llamadasSchemaCache.missingColumns.add('cajera_id');
          continue;
        }
        if (
          msgLower.includes('fecha_llamada') &&
          !llamadasSchemaCache.missingColumns.has('fecha_llamada')
        ) {
          llamadasSchemaCache.missingColumns.add('fecha_llamada');
          continue;
        }
      }

      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(error)}`,
      };
    }

    return {
      ok: false,
      error: lastError
        ? `Error en ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(lastError)}`
        : `No se pudieron compatibilizar las columnas de ${SUPABASE_TABLES.LLAMADAS}.`,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al actualizar en ${SUPABASE_TABLES.LLAMADAS}`,
    };
  }
}

export async function fetchLlamadasParaSucursalHoy(
  sucursal: Sucursal | string,
  sucursales: Sucursal[],
  fechaHoy: string = getTodayLocalYYYYMMDD()
): Promise<ServiceResult<LlamadaSucursal[]>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const pageSize = 1000;
    const rawRows: Record<string, unknown>[] = [];
    const seenIds = new Set<string>();
    const appendRows = (chunk: Record<string, unknown>[]) => {
      for (const r of chunk) {
        const key = r.id !== undefined && r.id !== null ? String(r.id) : '';
        if (key && seenIds.has(key)) continue;
        if (key) seenIds.add(key);
        rawRows.push(r);
      }
    };
    let querySucceeded = false;

    const twoDaysLater = addDaysYYYYMMDD(fechaHoy, 2);

    // 1. Paginated direct query filtering by fecha = hoy OR fecha_registro in [hoy, hoy+2d)
    for (let page = 0; page < 10; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const res = await conn.client
        .from(SUPABASE_TABLES.LLAMADAS)
        .select('*')
        .or(
          `fecha.eq.${fechaHoy},and(fecha_registro.gte.${fechaHoy},fecha_registro.lt.${twoDaysLater})`
        )
        .order('id', { ascending: false })
        .range(from, to);
      if (res.error) break;
      querySucceeded = true;
      const chunk = (res.data || []) as Record<string, unknown>[];
      appendRows(chunk);
      if (chunk.length < pageSize) break;
    }

    if (!querySucceeded) {
      // 2. Fallback to single-column date filters if one column doesn't exist
      let fechaOk = false;
      for (let page = 0; page < 10; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const res = await conn.client
          .from(SUPABASE_TABLES.LLAMADAS)
          .select('*')
          .eq('fecha', fechaHoy)
          .order('id', { ascending: false })
          .range(from, to);
        if (res.error) break;
        fechaOk = true;
        const chunk = (res.data || []) as Record<string, unknown>[];
        appendRows(chunk);
        if (chunk.length < pageSize) break;
      }
      if (fechaOk) {
        querySucceeded = true;
      } else {
        for (let page = 0; page < 10; page++) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          const res = await conn.client
            .from(SUPABASE_TABLES.LLAMADAS)
            .select('*')
            .gte('fecha_registro', fechaHoy)
            .lt('fecha_registro', twoDaysLater)
            .order('id', { ascending: false })
            .range(from, to);
          if (res.error) break;
          querySucceeded = true;
          const chunk = (res.data || []) as Record<string, unknown>[];
          appendRows(chunk);
          if (chunk.length < pageSize) break;
        }
      }
    }

    // 3. Fallback full scan (paginated) if direct date filter failed or returned 0 rows
    if (!querySucceeded || rawRows.length === 0) {
      let useOrder = true;

      for (let page = 0; page < 20; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const baseQuery = conn.client.from(SUPABASE_TABLES.LLAMADAS).select('*');
        const res = useOrder
          ? await baseQuery.order('id', { ascending: false }).range(from, to)
          : await baseQuery.range(from, to);

        if (res.error) {
          if (useOrder && page === 0) {
            useOrder = false;
            const fallbackRes = await conn.client
              .from(SUPABASE_TABLES.LLAMADAS)
              .select('*')
              .range(from, to);
            if (fallbackRes.error) {
              return {
                ok: false,
                error: `Error al consultar ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(fallbackRes.error)}`,
              };
            }
            const chunk = (fallbackRes.data || []) as Record<string, unknown>[];
            appendRows(chunk);
            if (chunk.length < pageSize) break;
            continue;
          }
          return {
            ok: false,
            error: `Error al consultar ${SUPABASE_TABLES.LLAMADAS}: ${formatSupabaseError(res.error)}`,
          };
        }

        const chunk = (res.data || []) as Record<string, unknown>[];
        appendRows(chunk);
        if (chunk.length < pageSize) break;
      }
    }

    const normalizedAll = rawRows
      .map((row) => normalizeLlamadaFromDb(row, sucursales))
      .sort((a, b) =>
        (b.created_at || b.fecha_registro || '').localeCompare(
          a.created_at || a.fecha_registro || ''
        )
      );

    // Match branch ignoring case & 'Sucursal ' prefix, and filter to Mexico local date = fechaHoy (without hiding Pendiente or Realizada)
    const branchToday = normalizedAll.filter(
      (l) =>
        matchesSucursalRecord(l, sucursal) &&
        getLlamadaLocalDate(l) === fechaHoy
    );

    return {
      ok: true,
      data: branchToday,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : `Error de red al consultar ${SUPABASE_TABLES.LLAMADAS}`,
    };
  }
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
    const latestLocal = readLocal<LlamadaSucursal[]>(
      STORAGE_KEYS.LLAMADAS,
      allLlamadas
    );
    const nextList = latestLocal.some((l) => l.id === llamada.id)
      ? latestLocal.map((l) => (l.id === llamada.id ? saved : l))
      : [saved, ...latestLocal];
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

function toDbFilterId(id: string): string | number {
  const trimmed = id.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

export async function deleteLlamadaRecord(
  id: string,
  allLlamadas: LlamadaSucursal[]
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    await discoverLlamadasSchema();
    if (llamadasSchemaCache.omitGeneratedId && isClientTempId(id)) {
      writeLocal(STORAGE_KEYS.LLAMADAS, allLlamadas);
      return { ok: true };
    }

    const { error } = await conn.client
      .from(SUPABASE_TABLES.LLAMADAS)
      .delete()
      .eq('id', toDbFilterId(id));
    if (error) {
      if (error.code === '22P02' && isClientTempId(id)) {
        llamadasSchemaCache.omitGeneratedId = true;
        writeLocal(STORAGE_KEYS.LLAMADAS, allLlamadas);
        return { ok: true };
      }
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

interface ActividadesSchemaCache {
  validColumns: Set<string> | null;
  missingColumns: Set<string>;
  omitGeneratedId: boolean;
  useInsertInsteadOfUpsert: boolean;
  openApiChecked: boolean;
}

const actividadesSchemaCache: ActividadesSchemaCache = {
  validColumns: null,
  missingColumns: new Set<string>(),
  omitGeneratedId: false,
  useInsertInsteadOfUpsert: false,
  openApiChecked: false,
};

function isClientTempActividadId(id: string): boolean {
  return id.startsWith('act-');
}

function normalizeActividadFromDb(
  row: Record<string, unknown>,
  sucursales: Sucursal[] = []
): ActividadDiaria {
  const rawSucId = String(row.sucursal_id ?? '').trim();
  const rawSucNombre = String(
    row.sucursal_nombre ?? row.sucursal ?? ''
  ).trim();
  const matchedSuc =
    sucursales.find((s) => s.id === rawSucId) ||
    sucursales.find(
      (s) => s.nombre.toLowerCase() === rawSucNombre.toLowerCase()
    );

  const rawEstatus = String(row.estatus ?? 'Pendiente');
  const estatus: ActividadDiaria['estatus'] =
    rawEstatus === 'Completada' ||
    rawEstatus === 'Observada' ||
    rawEstatus === 'Pendiente'
      ? rawEstatus
      : 'Pendiente';

  const rawDias = row.dias_semana;
  const diasSemana = Array.isArray(rawDias)
    ? (rawDias.filter((d) => typeof d === 'string') as ActividadDiaria['dias_semana'])
    : undefined;

  const horaLimite =
    typeof row.hora_limite === 'string' ? row.hora_limite : undefined;
  const sinHorarioLimite =
    row.sin_horario_limite !== undefined && row.sin_horario_limite !== null
      ? Boolean(row.sin_horario_limite)
      : undefined;
  const horaCompletada =
    typeof row.hora_completada === 'string' ? row.hora_completada : null;

  const rawPunt = String(row.puntualidad ?? '');
  const puntualidad: ActividadDiaria['puntualidad'] =
    rawPunt === 'A tiempo' ||
    rawPunt === 'A destiempo' ||
    rawPunt === 'Sin horario límite' ||
    rawPunt === 'Pendiente'
      ? rawPunt
      : calcularPuntualidadEnvio(
          estatus,
          horaCompletada,
          horaLimite,
          sinHorarioLimite
        );

  const rawVal = String(row.validacion_admin ?? '');
  const validacion_admin: ActividadDiaria['validacion_admin'] =
    rawVal === 'Aprobada' || rawVal === 'Rechazada' || rawVal === 'Pendiente'
      ? rawVal
      : estatus === 'Observada'
        ? 'Rechazada'
        : 'Pendiente';

  return {
    id: String(
      row.id ?? `act-db-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    ),
    sucursal_id: rawSucId || matchedSuc?.id || '',
    sucursal_nombre: rawSucNombre || matchedSuc?.nombre || 'Sucursal',
    sucursal: rawSucNombre || matchedSuc?.nombre || 'Sucursal',
    cajera_nombre:
      typeof row.cajera_nombre === 'string'
        ? row.cajera_nombre
        : typeof row.responsable === 'string'
          ? row.responsable
          : undefined,
    cajera_id:
      typeof row.cajera_id === 'string' ? row.cajera_id : undefined,
    titulo: String(row.titulo ?? 'Actividad'),
    descripcion:
      typeof row.descripcion === 'string' ? row.descripcion : undefined,
    categoria:
      row.categoria === 'Caja' ||
      row.categoria === 'Auditoría' ||
      row.categoria === 'Expedientes' ||
      row.categoria === 'Corte'
        ? row.categoria
        : 'Caja',
    responsable: String(
      row.responsable ?? row.cajera_nombre ?? matchedSuc?.responsable_caja ?? ''
    ),
    fecha: row.fecha
      ? String(row.fecha).slice(0, 10)
      : getTodayLocalYYYYMMDD(),
    dias_semana: diasSemana,
    hora_limite: horaLimite,
    sin_horario_limite: sinHorarioLimite,
    hora_completada: horaCompletada,
    estatus,
    puntualidad,
    validacion_admin,
    evidencia_url:
      typeof row.evidencia_url === 'string' ? row.evidencia_url : null,
    observaciones:
      typeof row.observaciones === 'string' ? row.observaciones : '',
  };
}

function mergeActividadDbRowWithInput(
  orig: ActividadDiaria,
  dbRow: Record<string, unknown>
): ActividadDiaria {
  const normalizedDb = normalizeActividadFromDb(dbRow);
  return {
    ...orig,
    id:
      dbRow.id !== undefined && dbRow.id !== null
        ? String(dbRow.id)
        : orig.id,
    sucursal_id:
      dbRow.sucursal_id !== undefined && dbRow.sucursal_id !== null
        ? normalizedDb.sucursal_id
        : orig.sucursal_id,
    sucursal_nombre:
      dbRow.sucursal_nombre !== undefined || dbRow.sucursal !== undefined
        ? normalizedDb.sucursal_nombre
        : orig.sucursal_nombre,
    sucursal:
      dbRow.sucursal !== undefined || dbRow.sucursal_nombre !== undefined
        ? normalizedDb.sucursal
        : orig.sucursal || orig.sucursal_nombre,
    cajera_nombre:
      dbRow.cajera_nombre !== undefined
        ? normalizedDb.cajera_nombre
        : orig.cajera_nombre,
    cajera_id:
      dbRow.cajera_id !== undefined ? normalizedDb.cajera_id : orig.cajera_id,
    titulo: dbRow.titulo !== undefined ? normalizedDb.titulo : orig.titulo,
    descripcion:
      dbRow.descripcion !== undefined
        ? normalizedDb.descripcion
        : orig.descripcion,
    categoria:
      dbRow.categoria !== undefined ? normalizedDb.categoria : orig.categoria,
    responsable:
      dbRow.responsable !== undefined
        ? normalizedDb.responsable
        : orig.responsable,
    fecha: dbRow.fecha !== undefined ? normalizedDb.fecha : orig.fecha,
    dias_semana:
      dbRow.dias_semana !== undefined
        ? normalizedDb.dias_semana
        : orig.dias_semana,
    hora_limite:
      dbRow.hora_limite !== undefined
        ? normalizedDb.hora_limite
        : orig.hora_limite,
    sin_horario_limite:
      dbRow.sin_horario_limite !== undefined
        ? normalizedDb.sin_horario_limite
        : orig.sin_horario_limite,
    hora_completada:
      dbRow.hora_completada !== undefined
        ? normalizedDb.hora_completada
        : orig.hora_completada,
    estatus:
      dbRow.estatus !== undefined ? normalizedDb.estatus : orig.estatus,
    puntualidad:
      dbRow.puntualidad !== undefined
        ? normalizedDb.puntualidad
        : orig.puntualidad,
    validacion_admin:
      dbRow.validacion_admin !== undefined
        ? normalizedDb.validacion_admin
        : orig.validacion_admin,
    evidencia_url:
      dbRow.evidencia_url !== undefined
        ? normalizedDb.evidencia_url
        : orig.evidencia_url,
    observaciones:
      dbRow.observaciones !== undefined
        ? normalizedDb.observaciones
        : orig.observaciones,
  };
}

async function discoverActividadesSchema(): Promise<void> {
  if (
    actividadesSchemaCache.validColumns ||
    actividadesSchemaCache.openApiChecked
  ) {
    return;
  }
  actividadesSchemaCache.openApiChecked = true;
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
          properties?: Record<string, { type?: string; format?: string }>;
        }
      >;
    };
    const props = spec?.definitions?.[SUPABASE_TABLES.ACTIVIDADES]?.properties;
    if (props && Object.keys(props).length > 0) {
      actividadesSchemaCache.validColumns = new Set(Object.keys(props));
      const idProp = props.id;
      if (
        idProp &&
        (idProp.type === 'integer' ||
          idProp.type === 'number' ||
          idProp.format === 'uuid')
      ) {
        actividadesSchemaCache.omitGeneratedId = true;
      }
    }
  } catch {
    // OpenAPI introspection is optional; dynamic error-stripping handles fallback
  }
}

function buildActividadPayload(
  actividad: ActividadDiaria
): Record<string, unknown> {
  const safeSucursalNombre =
    (
      actividad.sucursal ||
      actividad.sucursal_nombre ||
      actividad.sucursal_id ||
      'Sucursal'
    ).trim() || 'Sucursal';
  const safeCajeraNombre =
    (actividad.cajera_nombre || actividad.responsable || '').trim();

  const computedPuntualidad =
    actividad.puntualidad ||
    calcularPuntualidadEnvio(
      actividad.estatus,
      actividad.hora_completada,
      actividad.hora_limite,
      actividad.sin_horario_limite
    );
  const computedValidacion =
    actividad.validacion_admin ||
    (actividad.estatus === 'Observada' ? 'Rechazada' : 'Pendiente');

  const candidateValues: Record<string, unknown> = {
    id: actividad.id,
    sucursal_id: actividad.sucursal_id || safeSucursalNombre,
    sucursal_nombre: safeSucursalNombre,
    sucursal: safeSucursalNombre,
    cajera_nombre: safeCajeraNombre,
    cajera_id: (actividad.cajera_id || '').trim(),
    titulo: actividad.titulo,
    descripcion: actividad.descripcion ?? '',
    categoria: actividad.categoria,
    responsable: actividad.responsable || safeCajeraNombre,
    fecha: actividad.fecha,
    dias_semana: actividad.dias_semana ?? [],
    hora_limite: actividad.hora_limite ?? null,
    sin_horario_limite: Boolean(actividad.sin_horario_limite),
    hora_completada: actividad.hora_completada ?? null,
    estatus: actividad.estatus,
    puntualidad: computedPuntualidad,
    validacion_admin: computedValidacion,
    evidencia_url: actividad.evidencia_url ?? null,
    observaciones: actividad.observaciones ?? '',
  };

  const { validColumns, missingColumns, omitGeneratedId } =
    actividadesSchemaCache;

  const payload: Record<string, unknown> = {};

  if (validColumns && validColumns.size > 0) {
    for (const [col, val] of Object.entries(candidateValues)) {
      if (!validColumns.has(col) || missingColumns.has(col)) continue;
      if (col === 'id' && omitGeneratedId && isClientTempActividadId(actividad.id)) {
        continue;
      }
      payload[col] = val;
    }
    return payload;
  }

  for (const [col, val] of Object.entries(candidateValues)) {
    if (missingColumns.has(col)) continue;
    if (col === 'id' && omitGeneratedId && isClientTempActividadId(actividad.id)) {
      continue;
    }
    payload[col] = val;
  }

  return payload;
}

function formatActividadesSupabaseError(err: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}): string {
  const parts: string[] = [];
  if (err.code) parts.push(`error.code: ${err.code}`);
  if (err.message) parts.push(`error.message: ${err.message}`);
  if (err.details) parts.push(`error.details: ${err.details}`);
  if (err.hint) parts.push(`error.hint: ${err.hint}`);
  return parts.length > 0
    ? `Error Supabase en ${SUPABASE_TABLES.ACTIVIDADES} — ${parts.join(' | ')}`
    : `Error desconocido de Supabase en ${SUPABASE_TABLES.ACTIVIDADES}`;
}

async function executeActividadesWriteChunk(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  records: ActividadDiaria[]
): Promise<{
  ok: boolean;
  savedRecords: ActividadDiaria[];
  error?: string;
}> {
  let lastError: {
    message?: string;
    details?: string | null;
    hint?: string | null;
    code?: string;
  } | null = null;

  for (let attempt = 0; attempt < 20; attempt++) {
    const payloads = records.map(buildActividadPayload);
    const hasPayloadKeys = payloads.every((p) => Object.keys(p).length > 0);
    if (!hasPayloadKeys) {
      return {
        ok: false,
        savedRecords: [],
        error: lastError
          ? formatActividadesSupabaseError(lastError)
          : `No quedaron columnas válidas para escribir en ${SUPABASE_TABLES.ACTIVIDADES}.`,
      };
    }

    const hasIdInPayload = payloads.every(
      (p) =>
        (typeof p.id === 'string' && p.id.length > 0) ||
        typeof p.id === 'number'
    );
    const useInsert =
      actividadesSchemaCache.useInsertInsteadOfUpsert || !hasIdInPayload;

    let data: unknown[] | null = null;
    let error: {
      message?: string;
      details?: string | null;
      hint?: string | null;
      code?: string;
    } | null = null;

    if (useInsert && records.length === 1 && hasIdInPayload) {
      const singlePayload = { ...payloads[0] };
      const recordId = singlePayload.id;
      delete singlePayload.id;

      const updateRes = await client
        .from(SUPABASE_TABLES.ACTIVIDADES)
        .update(singlePayload)
        .eq('id', toDbFilterId(String(recordId)))
        .select();

      if (updateRes.error) {
        error = updateRes.error;
      } else if (updateRes.data && updateRes.data.length > 0) {
        data = updateRes.data;
      } else {
        const insertRes = await client
          .from(SUPABASE_TABLES.ACTIVIDADES)
          .insert(payloads)
          .select();
        data = insertRes.data;
        error = insertRes.error;
      }
    } else {
      const query = useInsert
        ? client.from(SUPABASE_TABLES.ACTIVIDADES).insert(payloads).select()
        : client
            .from(SUPABASE_TABLES.ACTIVIDADES)
            .upsert(payloads, { onConflict: 'id' })
            .select();

      const res = await query;
      data = res.data;
      error = res.error;
    }

    if (!error) {
      if (!data || data.length === 0) {
        return {
          ok: false,
          savedRecords: [],
          error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.ACTIVIDADES} (data vacío; revisa políticas RLS).`,
        };
      }
      if (!actividadesSchemaCache.validColumns && data.length > 0) {
        actividadesSchemaCache.validColumns = new Set(
          Object.keys(data[0] as Record<string, unknown>)
        );
      }
      const savedRecords = (data as Record<string, unknown>[]).map((r, i) => {
        const orig = records[i] || records[0];
        return mergeActividadDbRowWithInput(orig, r);
      });
      return { ok: true, savedRecords };
    }

    lastError = error;

    if (isRlsOrAuthError(error)) {
      return {
        ok: false,
        savedRecords: [],
        error: formatActividadesSupabaseError(error),
      };
    }

    const missingCol = extractMissingColumnFromError(error);
    const colWasInPayload =
      missingCol !== null &&
      payloads.some((p) => Object.prototype.hasOwnProperty.call(p, missingCol));

    if (
      missingCol &&
      colWasInPayload &&
      !actividadesSchemaCache.missingColumns.has(missingCol)
    ) {
      actividadesSchemaCache.missingColumns.add(missingCol);
      if (actividadesSchemaCache.validColumns) {
        actividadesSchemaCache.validColumns.delete(missingCol);
      }
      if (missingCol === 'id') {
        actividadesSchemaCache.omitGeneratedId = true;
        actividadesSchemaCache.useInsertInsteadOfUpsert = true;
      }
      continue;
    }

    const msgLower = (error.message || '').toLowerCase();
    if (
      error.code === '42P10' ||
      msgLower.includes('on conflict') ||
      msgLower.includes('no unique or exclusion constraint')
    ) {
      if (!actividadesSchemaCache.useInsertInsteadOfUpsert) {
        actividadesSchemaCache.useInsertInsteadOfUpsert = true;
        continue;
      }
    }

    if (
      error.code === '22P02' &&
      (msgLower.includes('uuid') ||
        msgLower.includes('bigint') ||
        msgLower.includes('integer')) &&
      !actividadesSchemaCache.omitGeneratedId
    ) {
      actividadesSchemaCache.omitGeneratedId = true;
      actividadesSchemaCache.useInsertInsteadOfUpsert = true;
      continue;
    }

    return {
      ok: false,
      savedRecords: [],
      error: formatActividadesSupabaseError(error),
    };
  }

  return {
    ok: false,
    savedRecords: [],
    error: lastError
      ? formatActividadesSupabaseError(lastError)
      : `Error inesperado al guardar en ${SUPABASE_TABLES.ACTIVIDADES}.`,
  };
}

export async function saveActividad(
  actividad: ActividadDiaria,
  allActividades: ActividadDiaria[]
): Promise<ServiceResult<ActividadDiaria>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    await discoverActividadesSchema();
    const res = await executeActividadesWriteChunk(conn.client, [actividad]);
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.error || `Error al guardar en ${SUPABASE_TABLES.ACTIVIDADES}.`,
      };
    }
    const saved = res.savedRecords[0] ?? actividad;
    const syncedList = allActividades.map((a) =>
      a.id === actividad.id ? saved : a
    );
    writeLocal(STORAGE_KEYS.ACTIVIDADES, syncedList);
    return { ok: true, data: saved };
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
): Promise<ServiceResult<ActividadDiaria[]>> {
  if (nuevas.length === 0) return { ok: true, data: [] };
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    await discoverActividadesSchema();
    const res = await executeActividadesWriteChunk(conn.client, nuevas);
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.error || `Error al guardar en ${SUPABASE_TABLES.ACTIVIDADES}.`,
      };
    }
    const savedByOrigId = new Map<string, ActividadDiaria>();
    nuevas.forEach((orig, idx) => {
      savedByOrigId.set(orig.id, res.savedRecords[idx] ?? orig);
    });
    const syncedList = allActividades.map(
      (a) => savedByOrigId.get(a.id) ?? a
    );
    writeLocal(STORAGE_KEYS.ACTIVIDADES, syncedList);
    return { ok: true, data: res.savedRecords };
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
    await discoverActividadesSchema();
    const shouldSkipDbDelete =
      actividadesSchemaCache.omitGeneratedId &&
      isClientTempActividadId(actividad.id);

    if (!shouldSkipDbDelete) {
      const { error } = await conn.client
        .from(SUPABASE_TABLES.ACTIVIDADES)
        .delete()
        .eq('id', toDbFilterId(actividad.id));
      if (error) {
        if (error.code === '22P02' && isClientTempActividadId(actividad.id)) {
          actividadesSchemaCache.omitGeneratedId = true;
        } else {
          return {
            ok: false,
            error: `Error al eliminar en ${SUPABASE_TABLES.ACTIVIDADES}: ${formatSupabaseError(error)}`,
          };
        }
      }
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
  allActividades: ActividadDiaria[],
  taskTitle?: string
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    await discoverActividadesSchema();
    const prefix = `act-cat-${taskId}__`;
    const normalizedTitle = taskTitle?.trim().toLowerCase();

    const matching = allActividades.filter((a) => {
      if (a.id.startsWith(prefix)) return true;
      if (
        normalizedTitle &&
        !a.id.startsWith('act-cat-') &&
        a.titulo.trim().toLowerCase() === normalizedTitle
      ) {
        return true;
      }
      return false;
    });

    const getDbIdsToDelete = () =>
      matching
        .filter(
          (a) =>
            !(
              actividadesSchemaCache.omitGeneratedId &&
              isClientTempActividadId(a.id)
            )
        )
        .map((a) => toDbFilterId(a.id));

    let dbIds = getDbIdsToDelete();

    if (dbIds.length > 0) {
      const { error } = await conn.client
        .from(SUPABASE_TABLES.ACTIVIDADES)
        .delete()
        .in('id', dbIds);

      if (error) {
        if (error.code === '22P02') {
          actividadesSchemaCache.omitGeneratedId = true;
          dbIds = getDbIdsToDelete();
          if (dbIds.length > 0) {
            const retryRes = await conn.client
              .from(SUPABASE_TABLES.ACTIVIDADES)
              .delete()
              .in('id', dbIds);
            if (retryRes.error) {
              return {
                ok: false,
                error: `Error al limpiar registros de actividad en ${SUPABASE_TABLES.ACTIVIDADES}: ${formatSupabaseError(retryRes.error)}`,
              };
            }
          }
        } else {
          return {
            ok: false,
            error: `Error al limpiar registros de actividad en ${SUPABASE_TABLES.ACTIVIDADES}: ${formatSupabaseError(error)}`,
          };
        }
      }
    }

    for (const act of matching) {
      if (act.evidencia_url) {
        await deleteEvidenciaFoto(act.evidencia_url);
      }
    }

    const matchingIds = new Set(matching.map((m) => m.id));
    const remaining = allActividades.filter((a) => !matchingIds.has(a.id));
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

interface GastosSchemaCache {
  validColumns: Set<string> | null;
  missingColumns: Set<string>;
  omitGeneratedId: boolean;
  useInsertInsteadOfUpsert: boolean;
  openApiChecked: boolean;
}

const gastosSchemaCache: GastosSchemaCache = {
  validColumns: null,
  missingColumns: new Set<string>(),
  omitGeneratedId: false,
  useInsertInsteadOfUpsert: false,
  openApiChecked: false,
};

function normalizeGastoFromDb(
  row: Record<string, unknown>,
  sucursales: Sucursal[] = []
): GastoYRefrendo {
  const rawSucId = String(row.sucursal_id ?? '').trim();
  const rawSucNombre = String(
    row.sucursal_nombre ?? row.sucursal ?? ''
  ).trim();
  const matchedSuc =
    sucursales.find((s) => s.id === rawSucId) ||
    sucursales.find(
      (s) => s.nombre.toLowerCase() === rawSucNombre.toLowerCase()
    );

  const safeSucNombre = rawSucNombre || matchedSuc?.nombre || 'Sucursal';

  return {
    id: String(
      row.id ?? `gr-db-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    ),
    sucursal_id: rawSucId || matchedSuc?.id || '',
    sucursal_nombre: safeSucNombre,
    sucursal: safeSucNombre,
    cajera_nombre:
      typeof row.cajera_nombre === 'string'
        ? row.cajera_nombre
        : typeof row.responsable === 'string'
          ? row.responsable
          : undefined,
    cajera_id: typeof row.cajera_id === 'string' ? row.cajera_id : undefined,
    tipo: row.tipo === 'Refrendo' ? 'Refrendo' : 'Gasto',
    categoria: String(row.categoria ?? 'Operación de Sucursal'),
    concepto: String(row.concepto ?? ''),
    monto_real: roundMoney2(row.monto_real ?? 0),
    presupuesto_limite: roundMoney2(row.presupuesto_limite ?? 0),
    cantidad_refrendos: Number(row.cantidad_refrendos ?? 0) || 0,
    meta_refrendos: roundMoney2(row.meta_refrendos ?? 0),
    fecha: row.fecha
      ? String(row.fecha).slice(0, 10)
      : getTodayLocalYYYYMMDD(),
    responsable: String(
      row.responsable ?? row.cajera_nombre ?? matchedSuc?.responsable_caja ?? ''
    ),
    evidencia_url:
      typeof row.evidencia_url === 'string' ? row.evidencia_url : null,
    notas: typeof row.notas === 'string' ? row.notas : '',
  };
}

function mergeGastoDbRowWithInput(
  orig: GastoYRefrendo,
  dbRow: Record<string, unknown>
): GastoYRefrendo {
  const normalizedDb = normalizeGastoFromDb(dbRow);
  return {
    ...orig,
    id:
      dbRow.id !== undefined && dbRow.id !== null
        ? String(dbRow.id)
        : orig.id,
    sucursal_id:
      dbRow.sucursal_id !== undefined && dbRow.sucursal_id !== null
        ? normalizedDb.sucursal_id
        : orig.sucursal_id,
    sucursal_nombre:
      dbRow.sucursal_nombre !== undefined || dbRow.sucursal !== undefined
        ? normalizedDb.sucursal_nombre
        : orig.sucursal_nombre,
    sucursal:
      dbRow.sucursal !== undefined || dbRow.sucursal_nombre !== undefined
        ? normalizedDb.sucursal
        : orig.sucursal || orig.sucursal_nombre,
    cajera_nombre:
      dbRow.cajera_nombre !== undefined
        ? normalizedDb.cajera_nombre
        : orig.cajera_nombre,
    cajera_id:
      dbRow.cajera_id !== undefined ? normalizedDb.cajera_id : orig.cajera_id,
  };
}

async function discoverGastosSchema(): Promise<void> {
  if (gastosSchemaCache.validColumns || gastosSchemaCache.openApiChecked) {
    return;
  }
  gastosSchemaCache.openApiChecked = true;
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
          properties?: Record<string, { type?: string; format?: string }>;
        }
      >;
    };
    const props =
      spec?.definitions?.[SUPABASE_TABLES.GASTOS_REFRENDOS]?.properties;
    if (props && Object.keys(props).length > 0) {
      gastosSchemaCache.validColumns = new Set(Object.keys(props));
      const idProp = props.id;
      if (
        idProp &&
        (idProp.type === 'integer' ||
          idProp.type === 'number' ||
          idProp.format === 'uuid')
      ) {
        gastosSchemaCache.omitGeneratedId = true;
      }
    }
  } catch {
    // OpenAPI introspection is optional
  }
}

function buildGastoPayload(registro: GastoYRefrendo): Record<string, unknown> {
  const safeSucursalNombre =
    (
      registro.sucursal ||
      registro.sucursal_nombre ||
      registro.sucursal_id ||
      'Sucursal'
    ).trim() || 'Sucursal';
  const safeCajeraNombre = (
    registro.cajera_nombre ||
    registro.responsable ||
    ''
  ).trim();

  const isTempId = registro.id.startsWith('gr-');
  const candidateValues: Record<string, unknown> = {
    id: isTempId ? registro.id : toDbFilterId(registro.id),
    sucursal_id: registro.sucursal_id || safeSucursalNombre,
    sucursal_nombre: safeSucursalNombre,
    sucursal: safeSucursalNombre,
    cajera_nombre: safeCajeraNombre,
    cajera_id: (registro.cajera_id || '').trim(),
    tipo: registro.tipo,
    categoria: registro.categoria,
    concepto: registro.concepto,
    monto_real: roundMoney2(registro.monto_real),
    presupuesto_limite: roundMoney2(registro.presupuesto_limite),
    cantidad_refrendos: Number(registro.cantidad_refrendos) || 0,
    meta_refrendos: roundMoney2(registro.meta_refrendos),
    fecha: registro.fecha || getTodayLocalYYYYMMDD(),
    responsable: registro.responsable || safeCajeraNombre,
    evidencia_url: registro.evidencia_url ?? null,
    notas: registro.notas ?? '',
  };

  const { validColumns, missingColumns, omitGeneratedId } = gastosSchemaCache;
  const payload: Record<string, unknown> = {};

  if (validColumns && validColumns.size > 0) {
    for (const [col, val] of Object.entries(candidateValues)) {
      if (!validColumns.has(col) || missingColumns.has(col)) continue;
      if (col === 'id' && omitGeneratedId && isTempId) continue;
      payload[col] = val;
    }
    return payload;
  }

  for (const [col, val] of Object.entries(candidateValues)) {
    if (missingColumns.has(col)) continue;
    if (col === 'id' && omitGeneratedId && isTempId) continue;
    payload[col] = val;
  }

  return payload;
}

export async function saveGastoORefrendo(
  registro: GastoYRefrendo,
  allRegistros: GastoYRefrendo[]
): Promise<ServiceResult<GastoYRefrendo>> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    await discoverGastosSchema();
    let lastError: {
      message?: string;
      details?: string | null;
      hint?: string | null;
      code?: string;
    } | null = null;

    for (let attempt = 0; attempt < 20; attempt++) {
      const payload = buildGastoPayload(registro);
      if (Object.keys(payload).length === 0) {
        return {
          ok: false,
          error: lastError
            ? `Error Supabase en ${SUPABASE_TABLES.GASTOS_REFRENDOS} — ${formatSupabaseError(lastError)}`
            : `No quedaron columnas válidas para escribir en ${SUPABASE_TABLES.GASTOS_REFRENDOS}.`,
        };
      }

      const hasIdInPayload =
        (typeof payload.id === 'string' && payload.id.length > 0) ||
        typeof payload.id === 'number';
      const useInsert =
        gastosSchemaCache.useInsertInsteadOfUpsert || !hasIdInPayload;

      let data: unknown[] | null = null;
      let error: {
        message?: string;
        details?: string | null;
        hint?: string | null;
        code?: string;
      } | null = null;

      if (useInsert && hasIdInPayload) {
        const updatePayload = { ...payload };
        const recordId = updatePayload.id;
        delete updatePayload.id;
        const updateRes = await conn.client
          .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
          .update(updatePayload)
          .eq('id', toDbFilterId(String(recordId)))
          .select();
        if (updateRes.error) {
          error = updateRes.error;
        } else if (updateRes.data && updateRes.data.length > 0) {
          data = updateRes.data;
        } else {
          const insertRes = await conn.client
            .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
            .insert(payload)
            .select();
          data = insertRes.data;
          error = insertRes.error;
        }
      } else {
        const res = useInsert
          ? await conn.client
              .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
              .insert(payload)
              .select()
          : await conn.client
              .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
              .upsert(payload, { onConflict: 'id' })
              .select();
        data = res.data;
        error = res.error;
      }

      if (!error) {
        if (!data || data.length === 0) {
          return {
            ok: false,
            error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.GASTOS_REFRENDOS} (revisa RLS).`,
          };
        }
        if (!gastosSchemaCache.validColumns && data.length > 0) {
          gastosSchemaCache.validColumns = new Set(
            Object.keys(data[0] as Record<string, unknown>)
          );
        }
        const saved = mergeGastoDbRowWithInput(
          registro,
          data[0] as Record<string, unknown>
        );
        const syncedList = allRegistros.map((r) =>
          r.id === registro.id ? saved : r
        );
        writeLocal(STORAGE_KEYS.GASTOS_REFRENDOS, syncedList);
        return { ok: true, data: saved };
      }

      lastError = error;

      if (isRlsOrAuthError(error)) {
        return {
          ok: false,
          error: `Error Supabase en ${SUPABASE_TABLES.GASTOS_REFRENDOS} — ${formatSupabaseError(error)}`,
        };
      }

      const missingCol = extractMissingColumnFromError(error);
      if (
        missingCol &&
        Object.prototype.hasOwnProperty.call(payload, missingCol) &&
        !gastosSchemaCache.missingColumns.has(missingCol)
      ) {
        gastosSchemaCache.missingColumns.add(missingCol);
        if (gastosSchemaCache.validColumns) {
          gastosSchemaCache.validColumns.delete(missingCol);
        }
        if (missingCol === 'id') {
          gastosSchemaCache.omitGeneratedId = true;
          gastosSchemaCache.useInsertInsteadOfUpsert = true;
        }
        continue;
      }

      const msgLower = (error.message || '').toLowerCase();
      if (
        (error.code === '42P10' ||
          msgLower.includes('on conflict') ||
          msgLower.includes('no unique or exclusion constraint')) &&
        !gastosSchemaCache.useInsertInsteadOfUpsert
      ) {
        gastosSchemaCache.useInsertInsteadOfUpsert = true;
        continue;
      }

      if (
        error.code === '22P02' &&
        (msgLower.includes('uuid') ||
          msgLower.includes('bigint') ||
          msgLower.includes('integer')) &&
        !gastosSchemaCache.omitGeneratedId
      ) {
        gastosSchemaCache.omitGeneratedId = true;
        gastosSchemaCache.useInsertInsteadOfUpsert = true;
        continue;
      }

      return {
        ok: false,
        error: `Error Supabase en ${SUPABASE_TABLES.GASTOS_REFRENDOS} — ${formatSupabaseError(error)}`,
      };
    }

    return {
      ok: false,
      error: lastError
        ? `Error Supabase en ${SUPABASE_TABLES.GASTOS_REFRENDOS} — ${formatSupabaseError(lastError)}`
        : `Error inesperado al guardar en ${SUPABASE_TABLES.GASTOS_REFRENDOS}.`,
    };
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
    await discoverGastosSchema();
    const isTempId = registro.id.startsWith('gr-');
    if (!(gastosSchemaCache.omitGeneratedId && isTempId)) {
      const { error } = await conn.client
        .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
        .delete()
        .eq('id', toDbFilterId(registro.id));
      if (error) {
        if (error.code === '22P02' && isTempId) {
          gastosSchemaCache.omitGeneratedId = true;
        } else {
          return {
            ok: false,
            error: `Error al eliminar en ${SUPABASE_TABLES.GASTOS_REFRENDOS}: ${formatSupabaseError(error)}`,
          };
        }
      }
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
  const metaLlam = Number(sucursal.meta_llamadas_diarias);
  const metaAct = Number(sucursal.meta_actividades_diarias);
  const metaRef = Number(sucursal.meta_refrendos_mensual);
  const techo = Number(sucursal.techo_gasto_mensual);
  return {
    id: sucursal.id,
    nombre: sucursal.nombre.trim(),
    codigo: sucursal.codigo.trim(),
    ciudad: (sucursal.ciudad ?? '').trim(),
    responsable_caja: (sucursal.responsable_caja ?? '').trim(),
    meta_llamadas_diarias: Number.isFinite(metaLlam) ? metaLlam : 30,
    meta_actividades_diarias: Number.isFinite(metaAct) ? metaAct : 5,
    meta_refrendos_mensual: Number.isFinite(metaRef) ? roundMoney2(metaRef) : 40,
    techo_gasto_mensual: Number.isFinite(techo) ? roundMoney2(techo) : 0,
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
    const metaLlam = Number(meta.meta_llamadas_diarias);
    const metaAct = Number(meta.meta_actividades_diarias);
    const metaRef = Number(meta.meta_refrendos_mensual);
    const techo = Number(meta.techo_gasto_mensual);
    const payload = {
      id: meta.id,
      sucursal_id: meta.sucursal_id,
      meta_llamadas_diarias: Number.isFinite(metaLlam) ? metaLlam : 30,
      meta_actividades_diarias: Number.isFinite(metaAct) ? metaAct : 5,
      meta_refrendos_mensual: Number.isFinite(metaRef) ? roundMoney2(metaRef) : 40,
      techo_gasto_mensual: Number.isFinite(techo) ? roundMoney2(techo) : 0,
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

let catalogosHasPlantillasCol: boolean | null = null;
let catalogosHasFrasesCol: boolean | null = null;

export async function saveCatalogos(
  catalogos: CatalogosControlOps
): Promise<ServiceResult> {
  const conn = requireConfiguredSupabase();
  if (!conn.ok) return { ok: false, error: conn.error };

  try {
    const basePayload = {
      id: catalogos.id || 'cat-global',
      tareas_obligatorias: catalogos.tareas_obligatorias ?? [],
      opciones_llamada: catalogos.opciones_llamada ?? [],
    };
    const hasPlantillas =
      Array.isArray(catalogos.plantillas_whatsapp) &&
      catalogos.plantillas_whatsapp.length > 0;
    const hasFrases = Array.isArray(catalogos.frases_motivacionales);

    let savedMain = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const includePlantillas =
        hasPlantillas && catalogosHasPlantillasCol !== false;
      const includeFrases = hasFrases && catalogosHasFrasesCol !== false;
      const payload: Record<string, unknown> = {
        ...basePayload,
        ...(includePlantillas
          ? { plantillas_whatsapp: catalogos.plantillas_whatsapp }
          : {}),
        ...(includeFrases
          ? { frases_motivacionales: catalogos.frases_motivacionales }
          : {}),
      };

      const res = await conn.client
        .from(SUPABASE_TABLES.CATALOGOS)
        .upsert(payload, { onConflict: 'id' })
        .select();

      if (!res.error) {
        if (!res.data || res.data.length === 0) {
          return {
            ok: false,
            error: `Supabase no confirmó la escritura en ${SUPABASE_TABLES.CATALOGOS} (revisa RLS).`,
          };
        }
        if (includePlantillas) catalogosHasPlantillasCol = true;
        if (includeFrases) catalogosHasFrasesCol = true;
        savedMain = true;
        break;
      }

      const missingCol = extractMissingColumnFromError(res.error);
      if (missingCol === 'plantillas_whatsapp') {
        catalogosHasPlantillasCol = false;
        continue;
      }
      if (missingCol === 'frases_motivacionales') {
        catalogosHasFrasesCol = false;
        continue;
      }
      return {
        ok: false,
        error: `Error en ${SUPABASE_TABLES.CATALOGOS}: ${formatSupabaseError(res.error)}`,
      };
    }

    if (!savedMain) {
      return {
        ok: false,
        error: `No se pudieron compatibilizar las columnas en ${SUPABASE_TABLES.CATALOGOS}.`,
      };
    }

    if (hasPlantillas && catalogosHasPlantillasCol === false) {
      const waPayload = {
        id: 'cat-whatsapp',
        tareas_obligatorias: [],
        opciones_llamada: [JSON.stringify(catalogos.plantillas_whatsapp)],
      };
      const waRes = await conn.client
        .from(SUPABASE_TABLES.CATALOGOS)
        .upsert(waPayload, { onConflict: 'id' })
        .select();
      if (waRes.error) {
        return {
          ok: false,
          error: `Error al guardar plantillas de WhatsApp en ${SUPABASE_TABLES.CATALOGOS}: ${formatSupabaseError(waRes.error)}`,
        };
      }
    }

    if (hasFrases && catalogosHasFrasesCol === false) {
      const frasesPayload = {
        id: 'cat-frases',
        tareas_obligatorias: [],
        opciones_llamada: [JSON.stringify(catalogos.frases_motivacionales)],
      };
      const frasesRes = await conn.client
        .from(SUPABASE_TABLES.CATALOGOS)
        .upsert(frasesPayload, { onConflict: 'id' })
        .select();
      if (frasesRes.error) {
        return {
          ok: false,
          error: `Error al guardar frases motivacionales en ${SUPABASE_TABLES.CATALOGOS}: ${formatSupabaseError(frasesRes.error)}`,
        };
      }
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
    const rawExt = file.name.split('.').pop()?.toLowerCase() || '';
    const ext =
      rawExt && rawExt.length <= 5
        ? rawExt
        : file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
            ? 'webp'
            : 'jpg';
    const cleanName = `${folder}/${sucursalId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from(SUPABASE_BUCKETS.EVIDENCIAS)
      .upload(cleanName, file, {
        cacheControl: '3600',
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (!error) {
      const { data } = supabase.storage
        .from(SUPABASE_BUCKETS.EVIDENCIAS)
        .getPublicUrl(cleanName);
      if (!data?.publicUrl) {
        return {
          url: '',
          uploadedToSupabase: false,
          error: `Se subió la imagen pero no se pudo obtener la URL pública del bucket "${SUPABASE_BUCKETS.EVIDENCIAS}".`,
        };
      }
      return { url: data.publicUrl, uploadedToSupabase: true };
    }

    return {
      url: '',
      uploadedToSupabase: false,
      error: `Error al subir la foto al bucket "${SUPABASE_BUCKETS.EVIDENCIAS}": ${error.message}`,
    };
  }

  return {
    url: '',
    uploadedToSupabase: false,
    error: `Supabase no está configurado para subir fotos al bucket "${SUPABASE_BUCKETS.EVIDENCIAS}".`,
  };
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
