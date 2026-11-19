/**
 * ============================================================================
 * CONFIGURACIÓN DE SUPABASE — ControlOps
 * ============================================================================
 * Pega aquí directamente tu SUPABASE_URL y tu SUPABASE_ANON_KEY obtenidos desde
 * Project Settings > API en tu panel de Supabase.
 *
 * Mientras estos valores permanezcan vacíos, ControlOps funcionará con datos
 * de ejemplo realistas guardados localmente para que puedas probar toda la app.
 * ============================================================================
 */

export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://cjfvaeiucuunzgrnnlwv.supabase.co';

export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_rGHMn0ZBN1oVlLc_fdnwpA_3iGYa_qY';

export const SUPABASE_TABLES = {
  LLAMADAS: 'llamadas_sucursal',
  ACTIVIDADES: 'actividades_diarias',
  GASTOS_REFRENDOS: 'gastos_y_refrendos',
  HORARIOS: 'horarios_sucursal',
} as const;

export const SUPABASE_BUCKETS = {
  EVIDENCIAS: 'evidencias_controlops',
} as const;

export function isSupabaseConfigured(): boolean {
  const url = SUPABASE_URL.trim();
  const key = SUPABASE_ANON_KEY.trim();
  return (
    url.length > 0 &&
    key.length > 0 &&
    url.startsWith('https://') &&
    !url.includes('TU_PROYECTO') &&
    !key.includes('TU_ANON_KEY')
  );
}
