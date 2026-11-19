/**
 * ============================================================================
 * CONFIGURACIÓN DE SUPABASE — ControlOps
 * ============================================================================
 * 1. Lee import.meta.env.VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
 * 2. Limpia espacios, comillas accidentales, barras finales (/) y /rest/v1.
 * 3. Si falta o no es válida en el build, usa el respaldo del proyecto
 *    (https://cjfvaeiucuunzgrnnlwv.supabase.co y su clave anon).
 * ============================================================================
 */

const FALLBACK_SUPABASE_URL = 'https://cjfvaeiucuunzgrnnlwv.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'sb_publishable_rGHMn0ZBN1oVlLc_fdnwpA_3iGYa_qY';

export function normalizeSupabaseUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  if (!cleaned || cleaned === 'undefined' || cleaned === 'null') return '';

  // Quitar prefijo accidental si se pegó "VITE_SUPABASE_URL=..."
  cleaned = cleaned.replace(/^VITE_SUPABASE_URL\s*=\s*/i, '').trim();
  // Quitar comillas simples, dobles o backticks alrededor
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();
  // Quitar barras finales y /rest/v1 si vienen al final
  cleaned = cleaned
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');

  // Si pegaron solo el host sin protocolo (ej. proyecto.supabase.co)
  if (/^[a-z0-9.-]+\.supabase\.co$/i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  return cleaned;
}

export function normalizeSupabaseKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  if (!cleaned || cleaned === 'undefined' || cleaned === 'null') return '';
  cleaned = cleaned.replace(/^VITE_SUPABASE_ANON_KEY\s*=\s*/i, '').trim();
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();
  return cleaned;
}

function isValidHttpsSupabaseUrl(url: string): boolean {
  if (!url || !url.startsWith('https://') || url.includes('TU_PROYECTO')) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

function isValidSupabaseKey(key: string): boolean {
  return key.length >= 20 && !key.includes('TU_ANON_KEY');
}

const RAW_ENV_URL = import.meta.env?.VITE_SUPABASE_URL;
const RAW_ENV_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;

const CLEANED_ENV_URL = normalizeSupabaseUrl(RAW_ENV_URL);
const CLEANED_ENV_KEY = normalizeSupabaseKey(RAW_ENV_KEY);

const HAS_VALID_ENV_URL = isValidHttpsSupabaseUrl(CLEANED_ENV_URL);
const HAS_VALID_ENV_KEY = isValidSupabaseKey(CLEANED_ENV_KEY);

export const SUPABASE_URL: string = HAS_VALID_ENV_URL
  ? CLEANED_ENV_URL
  : FALLBACK_SUPABASE_URL;

export const SUPABASE_ANON_KEY: string = HAS_VALID_ENV_KEY
  ? CLEANED_ENV_KEY
  : FALLBACK_SUPABASE_ANON_KEY;

export const SUPABASE_TABLES = {
  LLAMADAS: 'llamadas_sucursal',
  ACTIVIDADES: 'actividades_diarias',
  GASTOS_REFRENDOS: 'gastos_y_refrendos',
  HORARIOS: 'horarios_sucursal',
  USUARIOS: 'usuarios_controlops',
  SUCURSALES: 'sucursales_config',
  METAS: 'metas_sucursal',
  CATALOGOS: 'catalogos_controlops',
} as const;

export const SUPABASE_BUCKETS = {
  EVIDENCIAS: 'evidencias_controlops',
} as const;

export interface SupabaseConfigStatus {
  configured: boolean;
  url: string;
  hasEnvUrl: boolean;
  hasEnvKey: boolean;
  urlValid: boolean;
  keyValid: boolean;
  errorMessage: string | null;
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const url = SUPABASE_URL.trim();
  const key = SUPABASE_ANON_KEY.trim();
  const urlValid = isValidHttpsSupabaseUrl(url);
  const keyValid = isValidSupabaseKey(key);
  const configured = urlValid && keyValid;

  const missingParts: string[] = [];
  if (!urlValid) {
    missingParts.push(
      'VITE_SUPABASE_URL (debe iniciar con https:// y sin /rest/v1)'
    );
  }
  if (!keyValid) {
    missingParts.push('VITE_SUPABASE_ANON_KEY');
  }

  return {
    configured,
    url,
    hasEnvUrl: HAS_VALID_ENV_URL,
    hasEnvKey: HAS_VALID_ENV_KEY,
    urlValid,
    keyValid,
    errorMessage:
      missingParts.length > 0
        ? `Falta configurar o es inválida la variable: ${missingParts.join(' y ')}.`
        : null,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().configured;
}
