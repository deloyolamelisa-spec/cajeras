import { getSupabaseClient } from '../lib/supabaseClient';
import {
  SUPABASE_BUCKETS,
  SUPABASE_TABLES,
  isSupabaseConfigured,
} from '../lib/supabaseConfig';
import {
  ActividadDiaria,
  CatalogosControlOps,
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
  warning?: string;
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

export async function authenticateUsuario(
  correoOrNombre: string,
  password: string
): Promise<{ user: UsuarioControlOps | null; error?: string }> {
  const input = correoOrNombre.trim().toLowerCase();
  const pass = password;

  if (!input || !pass) {
    return { user: null, error: 'Ingresa tu usuario/correo y contraseña.' };
  }

  const supabase = getSupabaseClient();
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLES.USUARIOS)
        .select('*');

      if (!error && data && data.length > 0) {
        const users = data as UsuarioControlOps[];
        writeLocal(STORAGE_KEYS.USUARIOS, users);
        const matched = users.find(
          (u) =>
            (u.correo.toLowerCase() === input ||
              u.nombre.toLowerCase() === input) &&
            u.password === pass
        );
        if (!matched) {
          return {
            user: null,
            error: 'Usuario o contraseña incorrectos en usuarios_controlops.',
          };
        }
        if (!matched.activo) {
          return {
            user: null,
            error: 'Esta cuenta se encuentra desactivada. Contacta al Creador.',
          };
        }
        return { user: matched };
      }
    } catch {
      // Fallback gracefully to local users if table isn't created yet
    }
  }

  const localUsers = readLocal<UsuarioControlOps[]>(
    STORAGE_KEYS.USUARIOS,
    INITIAL_USUARIOS
  );
  const matchedLocal = localUsers.find(
    (u) =>
      (u.correo.toLowerCase() === input || u.nombre.toLowerCase() === input) &&
      u.password === pass
  );

  if (!matchedLocal) {
    return { user: null, error: 'Usuario o contraseña incorrectos.' };
  }
  if (!matchedLocal.activo) {
    return {
      user: null,
      error: 'Esta cuenta está desactivada. Contacta al Administrador Total.',
    };
  }

  return { user: matchedLocal };
}

export async function loadAllOperationalData(): Promise<LoadedOperationalData> {
  const supabase = getSupabaseClient();

  const localFallback = (): LoadedOperationalData => {
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
    };
  };

  if (!supabase || !isSupabaseConfigured()) {
    return localFallback();
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
      supabase
        .from(SUPABASE_TABLES.LLAMADAS)
        .select('*')
        .order('fecha_registro', { ascending: false }),
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

    const sucursales =
      !sucursalesRes.error && sucursalesRes.data && sucursalesRes.data.length > 0
        ? (sucursalesRes.data as Sucursal[])
        : readLocal(STORAGE_KEYS.SUCURSALES, INITIAL_SUCURSALES);

    const metas =
      !metasRes.error && metasRes.data && metasRes.data.length > 0
        ? (metasRes.data as MetaSucursal[])
        : readLocal(STORAGE_KEYS.METAS, INITIAL_METAS_SUCURSAL);

    const usuarios =
      !usuariosRes.error && usuariosRes.data && usuariosRes.data.length > 0
        ? (usuariosRes.data as UsuarioControlOps[])
        : readLocal(STORAGE_KEYS.USUARIOS, INITIAL_USUARIOS);

    const catalogos =
      !catalogosRes.error && catalogosRes.data && catalogosRes.data.length > 0
        ? (catalogosRes.data[0] as CatalogosControlOps)
        : readLocal(STORAGE_KEYS.CATALOGOS, INITIAL_CATALOGOS);

    if (llamadasRes.error || actividadesRes.error || gastosRes.error) {
      const errorMsg =
        llamadasRes.error?.message ||
        actividadesRes.error?.message ||
        gastosRes.error?.message ||
        'Error al consultar tablas de Supabase';

      return {
        ...localFallback(),
        sucursales,
        metas,
        usuarios,
        catalogos,
        warning: `Conexión Supabase activa, pero algunas tablas aún no existen (${errorMsg}). Ejecuta el Script SQL actualizado.`,
      };
    }

    const llamadas =
      llamadasRes.data && llamadasRes.data.length > 0
        ? (llamadasRes.data as LlamadaSucursal[])
        : readLocal(STORAGE_KEYS.LLAMADAS, INITIAL_LLAMADAS);
    const actividades =
      actividadesRes.data && actividadesRes.data.length > 0
        ? (actividadesRes.data as ActividadDiaria[])
        : readLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const gastosYRefrendos =
      gastosRes.data && gastosRes.data.length > 0
        ? (gastosRes.data as GastoYRefrendo[])
        : readLocal(STORAGE_KEYS.GASTOS_REFRENDOS, INITIAL_GASTOS_REFRENDOS);
    const horarios =
      !horariosRes.error && horariosRes.data && horariosRes.data.length > 0
        ? (horariosRes.data as HorarioSucursalDia[])
        : readLocal(STORAGE_KEYS.HORARIOS, buildInitialHorarios(sucursales));

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
    };
  } catch (err) {
    return {
      ...localFallback(),
      warning:
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con Supabase.',
    };
  }
}

export async function saveLlamada(
  llamada: LlamadaSucursal,
  allLlamadas: LlamadaSucursal[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.LLAMADAS, allLlamadas);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.LLAMADAS)
    .upsert(llamada, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveActividad(
  actividad: ActividadDiaria,
  allActividades: ActividadDiaria[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.ACTIVIDADES, allActividades);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.ACTIVIDADES)
    .upsert(actividad, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveGastoORefrendo(
  registro: GastoYRefrendo,
  allRegistros: GastoYRefrendo[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.GASTOS_REFRENDOS, allRegistros);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.GASTOS_REFRENDOS)
    .upsert(registro, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveHorarioDia(
  horario: HorarioSucursalDia,
  allHorarios: HorarioSucursalDia[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.HORARIOS, allHorarios);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.HORARIOS)
    .upsert(horario, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveSucursal(
  sucursal: Sucursal,
  allSucursales: Sucursal[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.SUCURSALES, allSucursales);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.SUCURSALES)
    .upsert(sucursal, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteSucursalRecord(
  id: string,
  allSucursales: Sucursal[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.SUCURSALES, allSucursales);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.SUCURSALES)
    .delete()
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveMetaSucursal(
  meta: MetaSucursal,
  allMetas: MetaSucursal[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.METAS, allMetas);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.METAS)
    .upsert(meta, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveUsuario(
  usuario: UsuarioControlOps,
  allUsuarios: UsuarioControlOps[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.USUARIOS, allUsuarios);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.USUARIOS)
    .upsert(usuario, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteUsuarioRecord(
  id: string,
  allUsuarios: UsuarioControlOps[]
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.USUARIOS, allUsuarios);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.USUARIOS)
    .delete()
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveCatalogos(
  catalogos: CatalogosControlOps
): Promise<{ ok: boolean; error?: string }> {
  writeLocal(STORAGE_KEYS.CATALOGOS, catalogos);
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { error } = await supabase
    .from(SUPABASE_TABLES.CATALOGOS)
    .upsert(catalogos, { onConflict: 'id' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
