import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Database,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  SUPABASE_BUCKETS,
  SUPABASE_TABLES,
  getSupabaseConfigStatus,
} from '../lib/supabaseConfig';
import {
  TableDiagnosticResult,
  runSupabaseDiagnostics,
} from '../services/controlOpsService';

interface SupabaseSetupModalProps {
  open: boolean;
  onClose: () => void;
  isConnected: boolean;
  warningMessage?: string;
  onResetDemoData: () => void;
}

const SQL_SCHEMA = `-- Ejecuta este SQL en el SQL Editor de tu proyecto Supabase
-- 1. Tabla de usuarios y roles (Cajera, Supervisor, Creador)
create table if not exists public.${SUPABASE_TABLES.USUARIOS} (
  id text primary key,
  nombre text not null,
  correo text unique not null,
  password text not null,
  rol text not null check (rol in ('cajera', 'supervisor', 'creador')),
  sucursal_id text not null default 'todas',
  sucursales_asignadas jsonb default '[]'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Tabla de sucursales configuradas (17 sucursales)
create table if not exists public.${SUPABASE_TABLES.SUCURSALES} (
  id text primary key,
  nombre text not null,
  codigo text not null,
  ciudad text not null default '',
  responsable_caja text not null default '',
  meta_llamadas_diarias integer not null default 30,
  meta_actividades_diarias integer not null default 5,
  meta_refrendos_mensual integer not null default 40,
  techo_gasto_mensual numeric not null default 4500,
  activa boolean not null default true
);

-- 3. Tabla de metas y techos máximos de gasto por sucursal
create table if not exists public.${SUPABASE_TABLES.METAS} (
  id text primary key,
  sucursal_id text not null,
  meta_llamadas_diarias integer not null default 30,
  meta_actividades_diarias integer not null default 5,
  meta_refrendos_mensual integer not null default 40,
  techo_gasto_mensual numeric not null default 4500
);

-- 4. Catálogo global de tareas obligatorias y opciones de llamada
create table if not exists public.${SUPABASE_TABLES.CATALOGOS} (
  id text primary key,
  tareas_obligatorias jsonb not null default '[]'::jsonb,
  opciones_llamada jsonb not null default '[]'::jsonb
);

-- 5. Tabla de llamadas por sucursal
create table if not exists public.${SUPABASE_TABLES.LLAMADAS} (
  id text primary key,
  sucursal_id text not null,
  sucursal_nombre text not null,
  cliente_nombre text not null,
  contrato text not null,
  telefono text not null,
  monto_prestamo numeric not null default 0,
  estatus_vencimiento text not null default 'Al corriente',
  fecha_vencimiento text,
  reporte_cajera text not null default 'Sin reporte',
  estatus_auditoria text not null default 'Sin auditar',
  observaciones_admin text not null default '',
  cajera_nombre text not null default '',
  llamada_registrada boolean not null default true,
  fecha_registro timestamptz not null default now()
);

-- 6. Tabla de actividades diarias
create table if not exists public.${SUPABASE_TABLES.ACTIVIDADES} (
  id text primary key,
  sucursal_id text not null,
  sucursal_nombre text not null,
  titulo text not null,
  descripcion text default '',
  categoria text not null default 'Caja',
  responsable text not null default '',
  fecha text not null,
  dias_semana jsonb default '[]'::jsonb,
  hora_limite text,
  sin_horario_limite boolean default false,
  hora_completada text,
  estatus text not null default 'Pendiente',
  evidencia_url text,
  observaciones text not null default ''
);

-- 7. Tabla de gastos y refrendos
create table if not exists public.${SUPABASE_TABLES.GASTOS_REFRENDOS} (
  id text primary key,
  sucursal_id text not null,
  sucursal_nombre text not null,
  tipo text not null check (tipo in ('Gasto', 'Refrendo')),
  categoria text not null default '',
  concepto text not null,
  monto_real numeric not null default 0,
  presupuesto_limite numeric not null default 0,
  cantidad_refrendos integer not null default 0,
  meta_refrendos integer not null default 0,
  fecha text not null,
  responsable text not null default '',
  evidencia_url text,
  notas text not null default ''
);

-- 8. Tabla de configuración de horarios por día y sucursal
create table if not exists public.${SUPABASE_TABLES.HORARIOS} (
  id text primary key,
  sucursal_id text not null,
  dia text not null,
  hora_limite_actividad text not null default '09:00',
  hora_limite_corte text not null default '18:30',
  sin_horario_limite boolean not null default false
);

-- Desactivar bloqueo RLS para lectura/escritura directa desde el panel
alter table public.${SUPABASE_TABLES.USUARIOS} disable row level security;
alter table public.${SUPABASE_TABLES.SUCURSALES} disable row level security;
alter table public.${SUPABASE_TABLES.METAS} disable row level security;
alter table public.${SUPABASE_TABLES.CATALOGOS} disable row level security;
alter table public.${SUPABASE_TABLES.LLAMADAS} disable row level security;
alter table public.${SUPABASE_TABLES.ACTIVIDADES} disable row level security;
alter table public.${SUPABASE_TABLES.GASTOS_REFRENDOS} disable row level security;
alter table public.${SUPABASE_TABLES.HORARIOS} disable row level security;

-- Usuario inicial de Creador (Administrador Total), Supervisor y Cajera
insert into public.${SUPABASE_TABLES.USUARIOS} (id, nombre, correo, password, rol, sucursal_id, activo)
values
  ('usr-creador-01', 'Melisa Bautista (Creador)', 'admin@controlops.mx', 'Control2026!', 'creador', 'todas', true),
  ('usr-sup-01', 'Carlos Mejía (Supervisor)', 'supervisor@controlops.mx', 'Super2026!', 'supervisor', 'todas', true),
  ('usr-caj-centro', 'Valeria Mendoza', 'valeria@controlops.mx', 'Caja2026!', 'cajera', 'suc-centro', true)
on conflict (id) do nothing;

-- 9. Bucket de almacenamiento para fotografías de evidencia
insert into storage.buckets (id, name, public)
values ('${SUPABASE_BUCKETS.EVIDENCIAS}', '${SUPABASE_BUCKETS.EVIDENCIAS}', true)
on conflict (id) do nothing;

drop policy if exists "Permitir lectura publica evidencias" on storage.objects;
create policy "Permitir lectura publica evidencias"
on storage.objects for select
using ( bucket_id = '${SUPABASE_BUCKETS.EVIDENCIAS}' );

drop policy if exists "Permitir subida evidencias" on storage.objects;
create policy "Permitir subida evidencias"
on storage.objects for insert
with check ( bucket_id = '${SUPABASE_BUCKETS.EVIDENCIAS}' );

drop policy if exists "Permitir borrar evidencias" on storage.objects;
create policy "Permitir borrar evidencias"
on storage.objects for delete
using ( bucket_id = '${SUPABASE_BUCKETS.EVIDENCIAS}' );`;

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({
  open,
  onClose,
  isConnected,
  warningMessage,
  onResetDemoData,
}) => {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagTables, setDiagTables] = useState<TableDiagnosticResult[]>([]);
  const configStatus = getSupabaseConfigStatus();

  const handleRunDiagnostics = useCallback(async () => {
    setTesting(true);
    try {
      const res = await runSupabaseDiagnostics();
      setDiagTables(res.tables);
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      handleRunDiagnostics();
    }
  }, [open, handleRunDiagnostics]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SQL_SCHEMA);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const hasTableErrors = diagTables.some((t) => !t.ok);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/40 backdrop-blur-[2px]">
      <div className="w-full max-w-3xl rounded-2xl bg-white border border-[#E6DDF5] shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1ECF9]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#F3ECFC] text-[#6D28D9] flex items-center justify-center">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-[#1F172B]">
                Conexión y Diagnóstico de Supabase
              </h2>
              <p className="text-xs text-[#6E5F87]">
                Estado de variables de entorno, lectura/escritura en vivo y script SQL
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6E5F87] hover:bg-[#F5F0FC]"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Env Vars & Client Status */}
          <div
            className={`rounded-xl p-4 border text-sm space-y-2 ${
              !configStatus.configured
                ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
                : isConnected && !hasTableErrors
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                  : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">
                {!configStatus.configured
                  ? 'Error de configuración en variables de entorno'
                  : isConnected
                    ? `Conectado a Supabase (${configStatus.url})`
                    : 'No se pudo completar la carga inicial desde Supabase'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
              <div className="rounded-lg bg-white/70 px-3 py-2 border border-black/5">
                <span className="font-semibold block">VITE_SUPABASE_URL</span>
                <span className="font-mono-num break-all">
                  {configStatus.url || 'No definida'}
                </span>
                <span className="block text-[11px] opacity-80 mt-0.5">
                  Origen:{' '}
                  {configStatus.hasEnvUrl
                    ? 'Variable de entorno (Vercel / .env)'
                    : 'Configuración base del proyecto'}
                </span>
              </div>
              <div className="rounded-lg bg-white/70 px-3 py-2 border border-black/5">
                <span className="font-semibold block">
                  VITE_SUPABASE_ANON_KEY
                </span>
                <span className="font-mono-num">
                  {configStatus.keyValid
                    ? 'Configurada y válida'
                    : 'Faltante o inválida'}
                </span>
                <span className="block text-[11px] opacity-80 mt-0.5">
                  Origen:{' '}
                  {configStatus.hasEnvKey
                    ? 'Variable de entorno (Vercel / .env)'
                    : 'Configuración base del proyecto'}
                </span>
              </div>
            </div>

            {configStatus.errorMessage && (
              <p className="text-xs font-semibold pt-1">
                {configStatus.errorMessage}
              </p>
            )}
            {warningMessage && (
              <p className="text-xs font-medium pt-1">
                Aviso de sincronización: {warningMessage}
              </p>
            )}
          </div>

          {/* Live per-table diagnostics */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#1F172B]">
                Diagnóstico en vivo de tablas en Supabase
              </h3>
              <button
                type="button"
                disabled={testing}
                onClick={handleRunDiagnostics}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F3ECFC] hover:bg-[#E9DDFB] text-[#5B21B6] transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`}
                />
                {testing ? 'Probando...' : 'Probar conexión en vivo'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {diagTables.map((t) => (
                <div
                  key={t.table}
                  className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-start justify-between gap-2 ${
                    t.ok
                      ? 'bg-[#FAF8FC] border-[#EAE3F5]'
                      : 'bg-[#FFF1F2] border-[#FECDD3]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-mono-num font-semibold text-[#1F172B] truncate">
                      {t.table}
                    </p>
                    {t.ok ? (
                      <p className="text-[11px] text-[#6E5F87]">
                        {t.rowCount} registro(s) en Supabase
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#BE123C] break-words mt-0.5">
                        {t.error}
                      </p>
                    )}
                  </div>
                  {t.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-[#15803D] shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-[#E11D48] shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#1F172B]">
                Script SQL de tablas y bucket ({SUPABASE_BUCKETS.EVIDENCIAS})
              </h3>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F3ECFC] hover:bg-[#E9DDFB] text-[#5B21B6] transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    SQL copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar SQL
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-[#1F172B] text-[#EDE9FE] text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed">
              {SQL_SCHEMA}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[#F1ECF9] bg-[#FAF8FC]">
          <button
            type="button"
            onClick={() => {
              onResetDemoData();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#6E5F87] hover:bg-white border border-[#E6DDF5] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar datos de ejemplo
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
