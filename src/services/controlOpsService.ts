import { getSupabaseClient } from '../lib/supabaseClient';
import {
  SUPABASE_BUCKETS,
  SUPABASE_TABLES,
  isSupabaseConfigured,
} from '../lib/supabaseConfig';
import {
  ActividadDiaria,
  GastoYRefrendo,
  HorarioSucursalDia,
  LlamadaSucursal,
  Sucursal,
} from '../types/controlops';
import {
  INITIAL_ACTIVIDADES,
  INITIAL_GASTOS_REFRENDOS,
  INITIAL_LLAMADAS,
  INITIAL_SUCURSALES,
  buildInitialHorarios,
} from '../data/mockData';

const STORAGE_KEYS = {
  LLAMADAS: 'controlops_llamadas_v1',
  ACTIVIDADES: 'controlops_actividades_v1',
  GASTOS_REFRENDOS: 'controlops_gastos_refrendos_v1',
  HORARIOS: 'controlops_horarios_v1',
};

export interface LoadedOperationalData {
  sucursales: Sucursal[];
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
    // Ignore storage quota errors in restricted environments
  }
}

export async function loadAllOperationalData(): Promise<LoadedOperationalData> {
  const supabase = getSupabaseClient();

  if (!supabase || !isSupabaseConfigured()) {
    return {
      sucursales: INITIAL_SUCURSALES,
      llamadas: readLocal(STORAGE_KEYS.LLAMADAS, INITIAL_LLAMADAS),
      actividades: readLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES),
      gastosYRefrendos: readLocal(
        STORAGE_KEYS.GASTOS_REFRENDOS,
        INITIAL_GASTOS_REFRENDOS
      ),
      horarios: readLocal(STORAGE_KEYS.HORARIOS, buildInitialHorarios()),
      source: 'demo',
    };
  }

  try {
    const [llamadasRes, actividadesRes, gastosRes, horariosRes] =
      await Promise.all([
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
      ]);

    if (llamadasRes.error || actividadesRes.error || gastosRes.error) {
      const errorMsg =
        llamadasRes.error?.message ||
        actividadesRes.error?.message ||
        gastosRes.error?.message ||
        'Error al consultar tablas de Supabase';

      return {
        sucursales: INITIAL_SUCURSALES,
        llamadas: readLocal(STORAGE_KEYS.LLAMADAS, INITIAL_LLAMADAS),
        actividades: readLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES),
        gastosYRefrendos: readLocal(
          STORAGE_KEYS.GASTOS_REFRENDOS,
          INITIAL_GASTOS_REFRENDOS
        ),
        horarios: readLocal(STORAGE_KEYS.HORARIOS, buildInitialHorarios()),
        source: 'demo',
        warning: `Conexión Supabase detectada, pero ocurrió un detalle al leer tablas: ${errorMsg}. Se muestran datos locales de respaldo.`,
      };
    }

    const llamadas =
      llamadasRes.data && llamadasRes.data.length > 0
        ? (llamadasRes.data as LlamadaSucursal[])
        : INITIAL_LLAMADAS;
    const actividades =
      actividadesRes.data && actividadesRes.data.length > 0
        ? (actividadesRes.data as ActividadDiaria[])
        : INITIAL_ACTIVIDADES;
    const gastosYRefrendos =
      gastosRes.data && gastosRes.data.length > 0
        ? (gastosRes.data as GastoYRefrendo[])
        : INITIAL_GASTOS_REFRENDOS;
    const horarios =
      !horariosRes.error && horariosRes.data && horariosRes.data.length > 0
        ? (horariosRes.data as HorarioSucursalDia[])
        : readLocal(STORAGE_KEYS.HORARIOS, buildInitialHorarios());

    return {
      sucursales: INITIAL_SUCURSALES,
      llamadas,
      actividades,
      gastosYRefrendos,
      horarios,
      source: 'supabase',
    };
  } catch (err) {
    return {
      sucursales: INITIAL_SUCURSALES,
      llamadas: readLocal(STORAGE_KEYS.LLAMADAS, INITIAL_LLAMADAS),
      actividades: readLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES),
      gastosYRefrendos: readLocal(
        STORAGE_KEYS.GASTOS_REFRENDOS,
        INITIAL_GASTOS_REFRENDOS
      ),
      horarios: readLocal(STORAGE_KEYS.HORARIOS, buildInitialHorarios()),
      source: 'demo',
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

    // Fallback to DataURL if bucket doesn't exist or policies block upload
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
  const horarios = buildInitialHorarios();
  writeLocal(STORAGE_KEYS.LLAMADAS, INITIAL_LLAMADAS);
  writeLocal(STORAGE_KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
  writeLocal(STORAGE_KEYS.GASTOS_REFRENDOS, INITIAL_GASTOS_REFRENDOS);
  writeLocal(STORAGE_KEYS.HORARIOS, horarios);
  return {
    sucursales: INITIAL_SUCURSALES,
    llamadas: INITIAL_LLAMADAS,
    actividades: INITIAL_ACTIVIDADES,
    gastosYRefrendos: INITIAL_GASTOS_REFRENDOS,
    horarios,
    source: 'demo',
  };
}
