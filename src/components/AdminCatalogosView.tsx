import React, { useState } from 'react';
import {
  Building2,
  Target,
  ListChecks,
  Users,
  Plus,
  Trash2,
  Save,
  Check,
  Power,
  KeyRound,
  Database,
  Pencil,
  Clock,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  ActividadDiaria,
  CatalogosControlOps,
  DiaSemana,
  MetaSucursal,
  RolUsuario,
  Sucursal,
  TareaCatalogo,
  UsuarioControlOps,
} from '../types/controlops';
import {
  ServiceResult,
} from '../services/controlOpsService';
import { getSupabaseConfigStatus } from '../lib/supabaseConfig';
import { formatMXN, isFixedBaseTask } from '../utils/calculations';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface AdminCatalogosViewProps {
  sucursales: Sucursal[];
  metas: MetaSucursal[];
  catalogos: CatalogosControlOps;
  usuarios: UsuarioControlOps[];
  actividades: ActividadDiaria[];
  currentUserId: string;
  supabaseConnected: boolean;
  remoteSucursalesCount?: number;
  onSyncBaseSucursales?: () => Promise<ServiceResult>;
  onOpenSupabaseModal: () => void;
  onSaveSucursal: (suc: Sucursal, isNew?: boolean) => Promise<ServiceResult>;
  onDeleteSucursal: (id: string) => Promise<ServiceResult>;
  onSaveMeta: (meta: MetaSucursal) => Promise<ServiceResult>;
  onSaveCatalogos: (catalogos: CatalogosControlOps) => Promise<ServiceResult>;
  onSaveCatalogTask: (
    tarea: TareaCatalogo,
    isNew?: boolean
  ) => Promise<ServiceResult>;
  onDeleteCatalogTask: (taskId: string) => Promise<ServiceResult>;
  onSaveUsuario: (
    usr: UsuarioControlOps,
    isNew?: boolean
  ) => Promise<ServiceResult>;
  onDeleteUsuario: (id: string) => Promise<ServiceResult>;
  onCreateActividadesBatch: (
    nuevas: ActividadDiaria[]
  ) => Promise<ServiceResult>;
  onUpdateActividad: (updated: ActividadDiaria) => Promise<ServiceResult>;
  onDeleteActividad: (actividad: ActividadDiaria) => Promise<ServiceResult>;
}

const ALL_DIAS: DiaSemana[] = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
];

const DIA_SHORT: Record<DiaSemana, string> = {
  lunes: 'Lun',
  martes: 'Mar',
  miercoles: 'Mié',
  jueves: 'Jue',
  viernes: 'Vie',
  sabado: 'Sáb',
  domingo: 'Dom',
};

type AdminTab = 'sucursales' | 'metas' | 'catalogos' | 'usuarios';

export const AdminCatalogosView: React.FC<AdminCatalogosViewProps> = ({
  sucursales,
  metas,
  catalogos,
  usuarios,
  actividades,
  currentUserId,
  supabaseConnected,
  remoteSucursalesCount,
  onSyncBaseSucursales,
  onOpenSupabaseModal,
  onSaveSucursal,
  onDeleteSucursal,
  onSaveMeta,
  onSaveCatalogos,
  onSaveCatalogTask,
  onDeleteCatalogTask,
  onSaveUsuario,
  onDeleteUsuario,
  onCreateActividadesBatch: _onCreateActividadesBatch,
  onUpdateActividad,
  onDeleteActividad,
}) => {
  const [tab, setTab] = useState<AdminTab>('sucursales');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const configStatus = getSupabaseConfigStatus();

  const notify = (msg: string) => {
    setErrorAlert(null);
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2600);
  };

  const fail = (errMsg?: string) => {
    setFeedback(null);
    setErrorAlert(
      errMsg || 'Error al guardar cambios en Supabase. Verifica la tabla.'
    );
  };

  // --- Sucursales State ---
  const [newBranch, setNewBranch] = useState({
    nombre: '',
    codigo: '',
    ciudad: '',
    responsable_caja: '',
  });
  const [branchDrafts, setBranchDrafts] = useState<Record<string, Sucursal>>(
    {}
  );

  // --- Metas State ---
  const [metaDrafts, setMetaDrafts] = useState<Record<string, MetaSucursal>>(
    {}
  );

  // --- Catalogos State ---
  const [newCallOption, setNewCallOption] = useState('');

  // --- Actividades Base del Catálogo (catalogos_controlops) ---
  const [editingTask, setEditingTask] = useState<TareaCatalogo | null>(null);
  const [taskForm, setTaskForm] = useState({
    sucursal_id: 'todas',
    titulo: '',
    descripcion: '',
    categoria: 'Caja' as TareaCatalogo['categoria'],
    dias_semana: [...ALL_DIAS] as DiaSemana[],
    hora_limite: '09:30',
    sin_horario_limite: false,
  });
  const [savingTask, setSavingTask] = useState(false);
  const [deleteTaskTarget, setDeleteTaskTarget] =
    useState<TareaCatalogo | null>(null);

  // --- Registros de cumplimiento (actividades_diarias) ---
  const [actBranchFilter, setActBranchFilter] = useState<string>('todas');
  const [deleteActTarget, setDeleteActTarget] =
    useState<ActividadDiaria | null>(null);
  const [deletingAct, setDeletingAct] = useState(false);

  // --- Usuarios State ---
  const [newUser, setNewUser] = useState({
    nombre: '',
    correo: '',
    password: '',
    rol: 'cajera' as RolUsuario,
    sucursal_id: sucursales[0]?.id || 'suc-centro',
  });
  const [userDrafts, setUserDrafts] = useState<
    Record<string, UsuarioControlOps>
  >({});

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranch.nombre.trim()) return;
    setSavingBranch(true);
    setErrorAlert(null);
    try {
      const id = `suc-${Date.now()}`;
      const created: Sucursal = {
        id,
        nombre: newBranch.nombre.trim(),
        codigo:
          newBranch.codigo.trim() ||
          `SUC-${String(sucursales.length + 1).padStart(2, '0')}`,
        ciudad: newBranch.ciudad.trim() || 'CDMX',
        responsable_caja: newBranch.responsable_caja.trim() || 'Por asignar',
        meta_llamadas_diarias: 30,
        meta_actividades_diarias: 5,
        meta_refrendos_mensual: 40,
        techo_gasto_mensual: 4500,
        activa: true,
      };
      const resSuc = await onSaveSucursal(created, true);
      if (!resSuc.ok) {
        fail(resSuc.error);
        return;
      }
      const resMeta = await onSaveMeta({
        id: `meta-${id}`,
        sucursal_id: id,
        meta_llamadas_diarias: 30,
        meta_actividades_diarias: 5,
        meta_refrendos_mensual: 40,
        techo_gasto_mensual: 4500,
      });
      if (!resMeta.ok) {
        fail(
          `Sucursal creada en sucursales_config, pero falló metas_sucursal: ${resMeta.error}`
        );
        return;
      }
      setNewBranch({ nombre: '', codigo: '', ciudad: '', responsable_caja: '' });
      notify(`Sucursal "${created.nombre}" guardada en sucursales_config de Supabase.`);
    } catch (err) {
      fail(
        err instanceof Error
          ? err.message
          : 'Error inesperado al crear sucursal en Supabase.'
      );
    } finally {
      setSavingBranch(false);
    }
  };

  const handleSaveBranchRow = async (suc: Sucursal) => {
    setErrorAlert(null);
    try {
      const merged = branchDrafts[suc.id] || suc;
      const res = await onSaveSucursal(merged, false);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      notify(`Cambios guardados para ${merged.nombre} en sucursales_config.`);
    } catch (err) {
      fail(
        err instanceof Error
          ? err.message
          : 'Error inesperado al guardar sucursal.'
      );
    }
  };

  const handleToggleBranchActive = async (suc: Sucursal) => {
    setErrorAlert(null);
    try {
      const base = branchDrafts[suc.id] || suc;
      const updated = { ...base, activa: !base.activa };
      const res = await onSaveSucursal(updated, false);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      setBranchDrafts((prev) => ({ ...prev, [suc.id]: updated }));
      notify(
        `${updated.nombre} ${updated.activa ? 'activada' : 'desactivada'} en Supabase.`
      );
    } catch (err) {
      fail(
        err instanceof Error
          ? err.message
          : 'Error inesperado al cambiar estado de sucursal.'
      );
    }
  };

  const getEffectiveMeta = (suc: Sucursal): MetaSucursal => {
    if (metaDrafts[suc.id]) return metaDrafts[suc.id];
    const found = metas.find((m) => m.sucursal_id === suc.id);
    if (found) return found;
    return {
      id: `meta-${suc.id}`,
      sucursal_id: suc.id,
      meta_llamadas_diarias: suc.meta_llamadas_diarias,
      meta_actividades_diarias: suc.meta_actividades_diarias,
      meta_refrendos_mensual: suc.meta_refrendos_mensual,
      techo_gasto_mensual: suc.techo_gasto_mensual,
    };
  };

  const handleSaveMetaRow = async (suc: Sucursal) => {
    const m = getEffectiveMeta(suc);
    const resMeta = await onSaveMeta(m);
    if (!resMeta.ok) {
      fail(resMeta.error);
      return;
    }
    const resSuc = await onSaveSucursal({
      ...suc,
      meta_llamadas_diarias: m.meta_llamadas_diarias,
      meta_actividades_diarias: m.meta_actividades_diarias,
      meta_refrendos_mensual: m.meta_refrendos_mensual,
      techo_gasto_mensual: m.techo_gasto_mensual,
    });
    if (!resSuc.ok) {
      fail(resSuc.error);
      return;
    }
    notify(`Metas y techo máximo actualizados para ${suc.nombre}.`);
  };

  const toggleTaskDia = (dia: DiaSemana) => {
    setTaskForm((prev) => {
      const exists = prev.dias_semana.includes(dia);
      return {
        ...prev,
        dias_semana: exists
          ? prev.dias_semana.filter((d) => d !== dia)
          : [...prev.dias_semana, dia],
      };
    });
  };

  const resetTaskForm = () => {
    setEditingTask(null);
    setTaskForm({
      sucursal_id: 'todas',
      titulo: '',
      descripcion: '',
      categoria: 'Caja',
      dias_semana: [...ALL_DIAS],
      hora_limite: '09:30',
      sin_horario_limite: false,
    });
  };

  const handleSaveCatalogTaskForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.titulo.trim()) return;
    setSavingTask(true);
    setErrorAlert(null);
    try {
      const dias =
        taskForm.dias_semana.length > 0 ? taskForm.dias_semana : [...ALL_DIAS];
      const horaLim = taskForm.sin_horario_limite
        ? null
        : taskForm.hora_limite || '09:30';

      if (editingTask) {
        const updated: TareaCatalogo = {
          ...editingTask,
          titulo: taskForm.titulo.trim(),
          descripcion: taskForm.descripcion.trim(),
          categoria: taskForm.categoria,
          sucursal_id: taskForm.sucursal_id,
          dias_semana: dias,
          hora_limite: horaLim,
          sin_horario_limite: taskForm.sin_horario_limite,
        };
        const res = await onSaveCatalogTask(updated, false);
        if (!res.ok) {
          fail(res.error);
          return;
        }
        notify(`Actividad "${updated.titulo}" actualizada en catalogos_controlops.`);
      } else {
        const created: TareaCatalogo = {
          id: `tar-${Date.now()}`,
          titulo: taskForm.titulo.trim(),
          descripcion: taskForm.descripcion.trim(),
          categoria: taskForm.categoria,
          sucursal_id: taskForm.sucursal_id,
          dias_semana: dias,
          hora_limite: horaLim,
          sin_horario_limite: taskForm.sin_horario_limite,
          activa: true,
        };
        const res = await onSaveCatalogTask(created, true);
        if (!res.ok) {
          fail(res.error);
          return;
        }
        notify(
          `Actividad "${created.titulo}" creada en catalogos_controlops y visible al instante para cajeras.`
        );
      }
      resetTaskForm();
    } finally {
      setSavingTask(false);
    }
  };

  const handleToggleTask = async (task: TareaCatalogo) => {
    const res = await onSaveCatalogTask({ ...task, activa: !task.activa }, false);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    notify(
      `Actividad "${task.titulo}" ${!task.activa ? 'activada' : 'pausada'} en Supabase.`
    );
  };

  const handleAddCallOption = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCallOption.trim();
    if (!trimmed || catalogos.opciones_llamada.includes(trimmed)) return;
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      opciones_llamada: [...catalogos.opciones_llamada, trimmed],
    };
    const res = await onSaveCatalogos(nextCatalogos);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    setNewCallOption('');
    notify(`Opción "${trimmed}" agregada al selector de llamadas.`);
  };

  const handleDeleteCallOption = async (opt: string) => {
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      opciones_llamada: catalogos.opciones_llamada.filter((o) => o !== opt),
    };
    const res = await onSaveCatalogos(nextCatalogos);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    notify(`Opción "${opt}" eliminada.`);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.nombre.trim() || !newUser.correo.trim() || !newUser.password.trim())
      return;
    setSavingUser(true);
    setErrorAlert(null);
    try {
      const created: UsuarioControlOps = {
        id: `usr-${Date.now()}`,
        nombre: newUser.nombre.trim(),
        correo: newUser.correo.trim().toLowerCase(),
        password: newUser.password.trim(),
        rol: newUser.rol,
        sucursal_id: newUser.rol === 'cajera' ? newUser.sucursal_id : 'todas',
        activo: true,
      };
      const res = await onSaveUsuario(created, true);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      setNewUser({
        nombre: '',
        correo: '',
        password: '',
        rol: 'cajera',
        sucursal_id: sucursales[0]?.id || 'suc-centro',
      });
      notify(`Usuario ${created.nombre} guardado en usuarios_controlops.`);
    } finally {
      setSavingUser(false);
    }
  };

  const handleSaveUserRow = async (usr: UsuarioControlOps) => {
    const merged = userDrafts[usr.id] || usr;
    setErrorAlert(null);
    const normalized: UsuarioControlOps = {
      ...merged,
      nombre: merged.nombre.trim(),
      correo: merged.correo.trim().toLowerCase(),
      password: merged.password.trim(),
      sucursal_id:
        merged.rol === 'cajera'
          ? merged.sucursal_id === 'todas'
            ? sucursales[0]?.id || 'suc-centro'
            : merged.sucursal_id
          : 'todas',
    };
    const res = await onSaveUsuario(normalized, false);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    setUserDrafts((prev) => {
      const copy = { ...prev };
      delete copy[usr.id];
      return copy;
    });
    notify(`Usuario ${normalized.nombre} actualizado en usuarios_controlops.`);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Error Banner (Missing Env Vars / Invalid URL) */}
      {!configStatus.configured && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] px-4 py-3.5 flex items-start gap-3 text-xs text-[#BE123C]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#E11D48]" />
          <div>
            <p className="font-bold">
              Configuración de Supabase incompleta en Vercel / entorno
            </p>
            <p className="mt-0.5">{configStatus.errorMessage}</p>
          </div>
        </div>
      )}

      {/* Error Alert Banner */}
      {errorAlert && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] px-4 py-3.5 flex items-start justify-between gap-3 text-xs text-[#BE123C]"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#E11D48]" />
            <div>
              <p className="font-bold">
                Error al guardar en Supabase (no se guardó en localStorage)
              </p>
              <p className="mt-0.5 font-mono-num break-all">{errorAlert}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorAlert(null)}
            className="font-semibold underline shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Sub-navigation & Feedback */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-[#EAE3F5] rounded-xl w-fit">
          {(
            [
              {
                id: 'sucursales',
                label: `Sucursales (${sucursales.length})`,
                icon: Building2,
              },
              { id: 'metas', label: 'Metas y Techos', icon: Target },
              {
                id: 'catalogos',
                label: 'Catálogo Actividades y Opciones',
                icon: ListChecks,
              },
              {
                id: 'usuarios',
                label: `Usuarios (${usuarios.length})`,
                icon: Users,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-[#F3ECFC] text-[#5B21B6]'
                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 text-[#DB2777]" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {feedback && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-3.5 py-2 rounded-xl">
              <Check className="h-3.5 w-3.5" />
              {feedback}
            </span>
          )}

          <button
            type="button"
            onClick={onOpenSupabaseModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#FAF7FE] text-[#5B21B6] border border-[#E6DDF5] transition-colors whitespace-nowrap"
          >
            <Database
              className={`h-3.5 w-3.5 ${
                supabaseConnected ? 'text-[#15803D]' : 'text-[#DB2777]'
              }`}
            />
            Conexión Supabase y Diagnóstico
          </button>
        </div>
      </div>

      {/* TAB 1: SUCURSALES */}
      {tab === 'sucursales' && (
        <div className="space-y-5">
          {supabaseConnected && remoteSucursalesCount === 0 && (
            <div className="rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#92400E]">
              <div>
                <p className="font-bold">
                  La tabla sucursales_config en Supabase tiene 0 registros guardados todavía
                </p>
                <p className="mt-0.5">
                  Las sucursales que ves abajo son la plantilla base local. Puedes agregar una sucursal nueva abajo o subir estas {sucursales.length} sucursales base a Supabase ahora.
                </p>
              </div>
              {onSyncBaseSucursales && (
                <button
                  type="button"
                  disabled={savingBranch}
                  onClick={async () => {
                    setSavingBranch(true);
                    try {
                      const res = await onSyncBaseSucursales();
                      if (!res.ok) {
                        fail(res.error);
                        return;
                      }
                      notify(
                        `Se guardaron ${sucursales.length} sucursales en sucursales_config de Supabase.`
                      );
                    } finally {
                      setSavingBranch(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {savingBranch
                    ? 'Sincronizando...'
                    : `Subir ${sucursales.length} sucursales a Supabase`}
                </button>
              )}
            </div>
          )}

          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
            <h2 className="font-display text-sm font-bold text-[#1F172B] mb-3">
              Agregar nueva sucursal
            </h2>
            <form
              onSubmit={handleAddBranch}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
            >
              <input
                type="text"
                required
                value={newBranch.nombre}
                onChange={(e) =>
                  setNewBranch({ ...newBranch, nombre: e.target.value })
                }
                placeholder="Nombre (ej. Sucursal Lindavista)"
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              />
              <input
                type="text"
                value={newBranch.codigo}
                onChange={(e) =>
                  setNewBranch({ ...newBranch, codigo: e.target.value })
                }
                placeholder="Código (ej. SUC-18)"
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num"
              />
              <input
                type="text"
                value={newBranch.ciudad}
                onChange={(e) =>
                  setNewBranch({ ...newBranch, ciudad: e.target.value })
                }
                placeholder="Ciudad / Zona"
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              />
              <input
                type="text"
                value={newBranch.responsable_caja}
                onChange={(e) =>
                  setNewBranch({
                    ...newBranch,
                    responsable_caja: e.target.value,
                  })
                }
                placeholder="Responsable de caja"
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              />
              <button
                type="submit"
                disabled={savingBranch}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {savingBranch ? 'Guardando...' : 'Agregar sucursal'}
              </button>
            </form>
          </section>

          <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F1ECF9] flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-[#1F172B]">
                  Catálogo de sucursales ({sucursales.length})
                </h3>
                <p className="text-xs text-[#7A6B93]">
                  Activa, desactiva o edita los nombres y responsables guardados
                  en sucursales_config.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#6D28D9]">
                {sucursales.filter((s) => s.activa).length} activas
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#F1ECF9] bg-[#FAF8FC] text-[12px] font-semibold text-[#6E5F87]">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Nombre sucursal</th>
                    <th className="py-3 px-4">Ciudad / Zona</th>
                    <th className="py-3 px-4">Responsable caja</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EEF9] text-xs">
                  {sucursales.map((suc) => {
                    const draft = branchDrafts[suc.id] || suc;
                    return (
                      <tr key={suc.id} className="hover:bg-[#FCFAFE]">
                        <td className="py-2.5 px-4">
                          <input
                            type="text"
                            value={draft.codigo}
                            onChange={(e) =>
                              setBranchDrafts((p) => ({
                                ...p,
                                [suc.id]: { ...draft, codigo: e.target.value },
                              }))
                            }
                            className="w-20 px-2 py-1.5 rounded-lg border border-[#E6DDF5] font-mono-num text-xs bg-white"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="text"
                            value={draft.nombre}
                            onChange={(e) =>
                              setBranchDrafts((p) => ({
                                ...p,
                                [suc.id]: { ...draft, nombre: e.target.value },
                              }))
                            }
                            className="w-44 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] font-semibold text-xs bg-white"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="text"
                            value={draft.ciudad}
                            onChange={(e) =>
                              setBranchDrafts((p) => ({
                                ...p,
                                [suc.id]: { ...draft, ciudad: e.target.value },
                              }))
                            }
                            className="w-44 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-xs bg-white"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="text"
                            value={draft.responsable_caja}
                            onChange={(e) =>
                              setBranchDrafts((p) => ({
                                ...p,
                                [suc.id]: {
                                  ...draft,
                                  responsable_caja: e.target.value,
                                },
                              }))
                            }
                            className="w-40 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-xs bg-white"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleBranchActive(suc)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                              draft.activa
                                ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                                : 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
                            }`}
                          >
                            <Power className="h-3 w-3" />
                            {draft.activa ? 'Activa' : 'Inactiva'}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleSaveBranchRow(suc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F3ECFC] hover:bg-[#E7DAFA] text-[#5B21B6] font-semibold"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await onDeleteSucursal(suc.id);
                              if (!res.ok) {
                                fail(res.error);
                                return;
                              }
                              notify(`Sucursal "${suc.nombre}" eliminada.`);
                            }}
                            className="inline-flex items-center p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                            title="Eliminar sucursal"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: METAS Y TECHOS */}
      {tab === 'metas' && (
        <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F1ECF9]">
            <h2 className="font-display text-sm font-bold text-[#1F172B]">
              Metas diarias y techos máximos de gasto por sucursal
            </h2>
            <p className="text-xs text-[#7A6B93] mt-0.5">
              Cualquier ajuste en el techo máximo de gasto ($) se refleja de
              inmediato en las alertas y gráficas de sobrecosto (tabla
              metas_sucursal).
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F1ECF9] bg-[#FAF8FC] text-[12px] font-semibold text-[#6E5F87]">
                  <th className="py-3 px-4">Sucursal</th>
                  <th className="py-3 px-4 text-right">Meta llamadas/día</th>
                  <th className="py-3 px-4 text-right">Meta actividades/día</th>
                  <th className="py-3 px-4 text-right">Meta refrendos/mes</th>
                  <th className="py-3 px-4 text-right">
                    Techo máximo de gasto ($)
                  </th>
                  <th className="py-3 px-4 text-right">Guardar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3EEF9] text-xs">
                {sucursales.map((suc) => {
                  const m = getEffectiveMeta(suc);
                  return (
                    <tr key={suc.id} className="hover:bg-[#FCFAFE]">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-[#1F172B]">
                          {suc.nombre}
                        </div>
                        <div className="text-[11px] text-[#8B7CA5]">
                          {suc.codigo} · Techo actual:{' '}
                          {formatMXN(m.techo_gasto_mensual)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <input
                          type="number"
                          min="1"
                          value={m.meta_llamadas_diarias}
                          onChange={(e) =>
                            setMetaDrafts((p) => ({
                              ...p,
                              [suc.id]: {
                                ...m,
                                meta_llamadas_diarias: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-right font-mono-num bg-white"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <input
                          type="number"
                          min="1"
                          value={m.meta_actividades_diarias}
                          onChange={(e) =>
                            setMetaDrafts((p) => ({
                              ...p,
                              [suc.id]: {
                                ...m,
                                meta_actividades_diarias:
                                  Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-right font-mono-num bg-white"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <input
                          type="number"
                          min="1"
                          value={m.meta_refrendos_mensual}
                          onChange={(e) =>
                            setMetaDrafts((p) => ({
                              ...p,
                              [suc.id]: {
                                ...m,
                                meta_refrendos_mensual:
                                  Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-right font-mono-num bg-white"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={m.techo_gasto_mensual}
                          onChange={(e) =>
                            setMetaDrafts((p) => ({
                              ...p,
                              [suc.id]: {
                                ...m,
                                techo_gasto_mensual:
                                  Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-28 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-right font-mono-num font-semibold text-[#5B21B6] bg-white"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveMetaRow(suc)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: CATÁLOGO DE ACTIVIDADES Y OPCIONES DE LLAMADA */}
      {tab === 'catalogos' && (
        <div className="space-y-6">
          {/* Master Daily Activities Catalog (catalogos_controlops) */}
          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-[#1F172B]">
                  Actividades base diarias ({catalogos.tareas_obligatorias.length}) — catalogos_controlops
                </h2>
                <p className="text-xs text-[#7A6B93]">
                  Crea, edita (nombre, descripción, hora límite, sucursal o días) o elimina definitivamente cualquier actividad. Los cambios se reflejan al instante en las cajeras.
                </p>
              </div>
              {editingTask && (
                <button
                  type="button"
                  onClick={resetTaskForm}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FAF8FC] text-[#6E5F87] border border-[#EAE3F5]"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar edición
                </button>
              )}
            </div>

            <form
              onSubmit={handleSaveCatalogTaskForm}
              className="rounded-xl border border-[#EAE3F5] bg-[#FAF8FC] p-4 space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={taskForm.titulo}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, titulo: e.target.value })
                  }
                  placeholder="Título de actividad *"
                  className="md:col-span-2 px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs"
                />
                <select
                  value={taskForm.sucursal_id}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, sucursal_id: e.target.value })
                  }
                  className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs"
                >
                  <option value="todas">
                    Todas las sucursales ({sucursales.filter((s) => s.activa).length})
                  </option>
                  {sucursales
                    .filter((s) => s.activa)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                </select>
                <select
                  value={taskForm.categoria}
                  onChange={(e) =>
                    setTaskForm({
                      ...taskForm,
                      categoria: e.target.value as TareaCatalogo['categoria'],
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs"
                >
                  <option value="Caja">Caja</option>
                  <option value="Corte">Corte</option>
                  <option value="Expedientes">Expedientes</option>
                  <option value="Auditoría">Auditoría</option>
                </select>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                <input
                  type="text"
                  value={taskForm.descripcion}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, descripcion: e.target.value })
                  }
                  placeholder="Descripción o evidencia requerida para la cajera..."
                  className="lg:col-span-5 px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs"
                />

                <div className="lg:col-span-4 flex flex-wrap gap-1">
                  {ALL_DIAS.map((d) => {
                    const active = taskForm.dias_semana.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleTaskDia(d)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                          active
                            ? 'bg-[#F3ECFC] border-[#C4B5FD] text-[#5B21B6]'
                            : 'bg-white border-[#EAE3F5] text-[#8B7CA5]'
                        }`}
                      >
                        {DIA_SHORT[d]}
                      </button>
                    );
                  })}
                </div>

                <div className="lg:col-span-3 flex items-center gap-2">
                  <input
                    type="time"
                    disabled={taskForm.sin_horario_limite}
                    value={taskForm.hora_limite}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, hora_limite: e.target.value })
                    }
                    className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-white text-xs font-mono-num disabled:opacity-50"
                  />
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5B21B6] whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taskForm.sin_horario_limite}
                      onChange={(e) =>
                        setTaskForm({
                          ...taskForm,
                          sin_horario_limite: e.target.checked,
                        })
                      }
                    />
                    Sin límite
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingTask}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
                >
                  {editingTask ? (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      {savingTask ? 'Guardando...' : 'Guardar cambios'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      {savingTask ? 'Agregando...' : 'Agregar nueva actividad'}
                    </>
                  )}
                </button>
              </div>
            </form>

            {catalogos.tareas_obligatorias.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E6DDF5] p-6 text-center text-xs text-[#7A6B93]">
                No hay actividades en el catálogo. Usa el formulario de arriba para agregar actividades diarias.
              </div>
            ) : (
              <div className="divide-y divide-[#F1ECF9] border border-[#EAE3F5] rounded-xl overflow-hidden">
                {catalogos.tareas_obligatorias.map((t) => {
                  const isBase = isFixedBaseTask(t);
                  const branchLabel =
                    !t.sucursal_id || t.sucursal_id === 'todas'
                      ? 'Todas las sucursales'
                      : sucursales.find((s) => s.id === t.sucursal_id)?.nombre ||
                        t.sucursal_id;
                  const diasLabel =
                    !t.dias_semana || t.dias_semana.length === 7
                      ? 'Todos los días'
                      : t.dias_semana.map((d) => DIA_SHORT[d]).join(', ');

                  return (
                    <div
                      key={t.id}
                      className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white hover:bg-[#FCFAFE]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={`text-xs font-bold ${
                              t.activa
                                ? 'text-[#1F172B]'
                                : 'text-[#9D8FB5] line-through'
                            }`}
                          >
                            {t.titulo}
                          </p>
                          {isBase && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#F3ECFC] text-[#5B21B6]">
                              Fija diaria
                            </span>
                          )}
                        </div>
                        {t.descripcion && (
                          <p className="text-[11px] text-[#55476E] mt-0.5">
                            {t.descripcion}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7A6B93] mt-1">
                          <span>{branchLabel}</span>
                          <span>·</span>
                          <span>{t.categoria}</span>
                          <span>·</span>
                          <span>{diasLabel}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1.5 bg-[#FAF8FC] border border-[#EAE3F5] rounded-lg px-2 py-1">
                          <Clock className="h-3 w-3 text-[#6D28D9]" />
                          <input
                            type="time"
                            aria-label={`Hora límite de ${t.titulo}`}
                            disabled={Boolean(t.sin_horario_limite)}
                            value={t.hora_limite || '09:30'}
                            onChange={async (e) => {
                              const res = await onSaveCatalogTask(
                                {
                                  ...t,
                                  hora_limite: e.target.value,
                                  sin_horario_limite: false,
                                },
                                false
                              );
                              if (!res.ok) {
                                fail(res.error);
                                return;
                              }
                              notify(
                                `Horario de "${t.titulo}" actualizado a ${e.target.value}.`
                              );
                            }}
                            className="text-[11px] font-mono-num bg-transparent focus:outline-none disabled:opacity-45"
                          />
                          <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#5B21B6] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(t.sin_horario_limite)}
                              onChange={async (e) => {
                                const sinLim = e.target.checked;
                                const res = await onSaveCatalogTask(
                                  {
                                    ...t,
                                    sin_horario_limite: sinLim,
                                    hora_limite: sinLim
                                      ? null
                                      : t.hora_limite || '09:30',
                                  },
                                  false
                                );
                                if (!res.ok) {
                                  fail(res.error);
                                  return;
                                }
                                notify(
                                  sinLim
                                    ? `"${t.titulo}" sin horario límite.`
                                    : `Horario límite reactivado en "${t.titulo}".`
                                );
                              }}
                            />
                            Sin límite
                          </label>
                        </div>

                        {!isBase ? (
                          <button
                            type="button"
                            onClick={() => handleToggleTask(t)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${
                              t.activa
                                ? 'bg-[#F0FDF4] text-[#15803D]'
                                : 'bg-[#FAF8FC] text-[#8B7CA5]'
                            }`}
                          >
                            {t.activa ? 'Activa' : 'Pausada'}
                          </button>
                        ) : (
                          <span className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#F0FDF4] text-[#15803D]">
                            Siempre activa
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setEditingTask(t);
                            setTaskForm({
                              sucursal_id: t.sucursal_id || 'todas',
                              titulo: t.titulo,
                              descripcion: t.descripcion || '',
                              categoria: t.categoria,
                              dias_semana:
                                t.dias_semana && t.dias_semana.length > 0
                                  ? t.dias_semana
                                  : [...ALL_DIAS],
                              hora_limite: t.hora_limite || '09:30',
                              sin_horario_limite: Boolean(t.sin_horario_limite),
                            });
                          }}
                          title="Editar actividad"
                          className="p-1.5 rounded-lg text-[#5B21B6] hover:bg-[#F3ECFC]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        {!isBase && (
                          <button
                            type="button"
                            onClick={() => setDeleteTaskTarget(t)}
                            title="Eliminar actividad definitivamente"
                            className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submitted daily records in actividades_diarias */}
          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-[#1F172B]">
                  Registros diarios guardados (actividades_diarias)
                </h2>
                <p className="text-xs text-[#7A6B93]">
                  Cumplimientos y evidencias subidas por las sucursales ({actividades.length}).
                </p>
              </div>
              <select
                aria-label="Filtrar registros diarios por sucursal"
                value={actBranchFilter}
                onChange={(e) => setActBranchFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              >
                <option value="todas">Todas las sucursales</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-[#F1ECF9] border border-[#EAE3F5] rounded-xl">
              {actividades.filter(
                (a) =>
                  actBranchFilter === 'todas' || a.sucursal_id === actBranchFilter
              ).length === 0 ? (
                <div className="p-6 text-center text-xs text-[#7A6B93]">
                  No hay registros guardados en actividades_diarias todavía.
                </div>
              ) : (
                actividades
                  .filter(
                    (a) =>
                      actBranchFilter === 'todas' ||
                      a.sucursal_id === actBranchFilter
                  )
                  .map((act) => (
                    <div
                      key={act.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-[#FCFAFE]"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1F172B] truncate">
                          {act.titulo}
                        </p>
                        <p className="text-[11px] text-[#7A6B93]">
                          {act.sucursal_nombre} · {act.fecha} · {act.estatus}
                          {act.hora_completada ? ` (${act.hora_completada})` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleteActTarget(act)}
                        title="Eliminar registro de cumplimiento"
                        className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2] shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
              )}
            </div>
          </section>

          {/* Call Report Options */}
          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 space-y-4">
            <div>
              <h2 className="font-display text-sm font-bold text-[#1F172B]">
                Opciones de respuesta en módulo de Llamadas
              </h2>
              <p className="text-xs text-[#7A6B93]">
                Estas opciones alimentan el selector desplegable de reporte de
                cajera.
              </p>
            </div>

            <form onSubmit={handleAddCallOption} className="flex gap-2">
              <input
                type="text"
                required
                value={newCallOption}
                onChange={(e) => setNewCallOption(e.target.value)}
                placeholder="Ej. Buzón de voz, Reagendó cita..."
                className="flex-1 px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#DB2777] hover:bg-[#BE185D] text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </button>
            </form>

            <div className="divide-y divide-[#F1ECF9] border border-[#EAE3F5] rounded-xl overflow-hidden">
              {catalogos.opciones_llamada.map((opt) => (
                <div
                  key={opt}
                  className="px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-[#FCFAFE]"
                >
                  <span className="text-xs font-semibold text-[#1F172B]">
                    {opt}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCallOption(opt)}
                    className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                    title="Eliminar opción"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
          </div>
        </div>
      )}

      {/* TAB 4: GESTIÓN DE USUARIOS */}
      {tab === 'usuarios' && (
        <div className="space-y-5">
          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
            <h2 className="font-display text-sm font-bold text-[#1F172B] mb-3">
              Crear nueva cuenta de acceso (usuarios_controlops)
            </h2>
            <form
              onSubmit={handleAddUser}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
            >
              <input
                type="text"
                required
                value={newUser.nombre}
                onChange={(e) =>
                  setNewUser({ ...newUser, nombre: e.target.value })
                }
                placeholder="Nombre completo"
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              />
              <input
                type="email"
                required
                value={newUser.correo}
                onChange={(e) =>
                  setNewUser({ ...newUser, correo: e.target.value })
                }
                placeholder="correo@controlops.mx"
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              />
              <input
                type="text"
                required
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                placeholder="Contraseña inicial"
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num"
              />
              <select
                value={newUser.rol}
                onChange={(e) =>
                  setNewUser({ ...newUser, rol: e.target.value as RolUsuario })
                }
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold"
              >
                <option value="cajera">Cajera</option>
                <option value="supervisor">Supervisor</option>
                <option value="creador">Creador (Admin Total)</option>
              </select>
              <select
                disabled={newUser.rol !== 'cajera'}
                value={
                  newUser.rol === 'cajera' ? newUser.sucursal_id : 'todas'
                }
                onChange={(e) =>
                  setNewUser({ ...newUser, sucursal_id: e.target.value })
                }
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs disabled:opacity-50"
              >
                {newUser.rol !== 'cajera' && (
                  <option value="todas">Todas las sucursales</option>
                )}
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={savingUser}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {savingUser ? 'Guardando...' : 'Crear usuario'}
              </button>
            </form>
          </section>

          <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F1ECF9]">
              <h3 className="font-display text-sm font-bold text-[#1F172B]">
                Cuentas registradas ({usuarios.length})
              </h3>
              <p className="text-xs text-[#7A6B93]">
                Cambia roles, contraseñas o reasigna sucursales en tiempo real.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#F1ECF9] bg-[#FAF8FC] text-[12px] font-semibold text-[#6E5F87]">
                    <th className="py-3 px-4">Nombre y Correo</th>
                    <th className="py-3 px-4">Rol</th>
                    <th className="py-3 px-4">Sucursal asignada</th>
                    <th className="py-3 px-4">Contraseña</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EEF9] text-xs">
                  {usuarios.map((usr) => {
                    const draft = userDrafts[usr.id] || usr;
                    const isSelf = usr.id === currentUserId;
                    return (
                      <tr key={usr.id} className="hover:bg-[#FCFAFE]">
                        <td className="py-3 px-4 space-y-1.5">
                          <input
                            type="text"
                            aria-label="Nombre de usuario"
                            value={draft.nombre}
                            onChange={(e) =>
                              setUserDrafts((p) => ({
                                ...p,
                                [usr.id]: { ...draft, nombre: e.target.value },
                              }))
                            }
                            className="w-48 px-2.5 py-1 rounded-lg border border-[#E6DDF5] font-semibold text-xs bg-white block"
                          />
                          <input
                            type="email"
                            aria-label="Correo de usuario"
                            value={draft.correo}
                            onChange={(e) =>
                              setUserDrafts((p) => ({
                                ...p,
                                [usr.id]: { ...draft, correo: e.target.value },
                              }))
                            }
                            className="w-48 px-2.5 py-1 rounded-lg border border-[#E6DDF5] text-[11px] text-[#55476E] bg-[#FAF8FC] block"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={draft.rol}
                            onChange={(e) =>
                              setUserDrafts((p) => ({
                                ...p,
                                [usr.id]: {
                                  ...draft,
                                  rol: e.target.value as RolUsuario,
                                },
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] bg-white text-xs font-semibold"
                          >
                            <option value="cajera">Cajera</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="creador">Creador</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            disabled={draft.rol !== 'cajera'}
                            value={
                              draft.rol === 'cajera'
                                ? draft.sucursal_id
                                : 'todas'
                            }
                            onChange={(e) =>
                              setUserDrafts((p) => ({
                                ...p,
                                [usr.id]: {
                                  ...draft,
                                  sucursal_id: e.target.value,
                                },
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] bg-white text-xs disabled:opacity-60"
                          >
                            {draft.rol !== 'cajera' && (
                              <option value="todas">Todas las sucursales</option>
                            )}
                            {sucursales.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <div className="relative inline-flex items-center">
                            <KeyRound className="h-3 w-3 text-[#8B7CA5] mr-1.5" />
                            <input
                              type="text"
                              value={draft.password}
                              onChange={(e) =>
                                setUserDrafts((p) => ({
                                  ...p,
                                  [usr.id]: {
                                    ...draft,
                                    password: e.target.value,
                                  },
                                }))
                              }
                              className="w-28 px-2 py-1 rounded-lg border border-[#E6DDF5] font-mono-num text-xs bg-white"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={async () => {
                              const nextUsr = {
                                ...draft,
                                activo: !draft.activo,
                              };
                              const res = await onSaveUsuario(nextUsr, false);
                              if (!res.ok) {
                                fail(res.error);
                                return;
                              }
                              setUserDrafts((p) => {
                                const copy = { ...p };
                                delete copy[usr.id];
                                return copy;
                              });
                              notify(
                                `Cuenta de ${nextUsr.nombre} ${nextUsr.activo ? 'activada' : 'desactivada'} en Supabase.`
                              );
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-50 ${
                              draft.activo
                                ? 'bg-[#F0FDF4] text-[#15803D]'
                                : 'bg-[#FFF1F2] text-[#BE123C]'
                            }`}
                          >
                            {draft.activo ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleSaveUserRow(usr)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F3ECFC] hover:bg-[#E7DAFA] text-[#5B21B6] font-semibold"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Guardar
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await onDeleteUsuario(usr.id);
                                if (!res.ok) {
                                  fail(res.error);
                                  return;
                                }
                                notify(`Usuario ${usr.nombre} eliminado de Supabase.`);
                              }}
                              className="inline-flex items-center p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      <ConfirmDeleteModal
        open={Boolean(deleteTaskTarget)}
        title="¿Seguro que deseas eliminar esta actividad definitivamente?"
        detail={
          deleteTaskTarget
            ? `Se eliminará "${deleteTaskTarget.titulo}" de catalogos_controlops y sus registros asociados en actividades_diarias. No volverá a aparecer automáticamente.`
            : undefined
        }
        loading={deletingAct}
        onCancel={() => setDeleteTaskTarget(null)}
        onConfirm={async () => {
          if (!deleteTaskTarget) return;
          setDeletingAct(true);
          try {
            const res = await onDeleteCatalogTask(deleteTaskTarget.id);
            if (!res.ok) {
              fail(res.error);
              setDeleteTaskTarget(null);
              return;
            }
            notify(
              `Actividad "${deleteTaskTarget.titulo}" eliminada definitivamente de Supabase.`
            );
            setDeleteTaskTarget(null);
          } finally {
            setDeletingAct(false);
          }
        }}
      />

      <ConfirmDeleteModal
        open={Boolean(deleteActTarget)}
        title="¿Seguro que deseas eliminar este registro?"
        detail={
          deleteActTarget
            ? `Se eliminará el registro "${deleteActTarget.titulo}" (${deleteActTarget.sucursal_nombre}) de actividades_diarias y su evidencia adjunta si existe.`
            : undefined
        }
        loading={deletingAct}
        onCancel={() => setDeleteActTarget(null)}
        onConfirm={async () => {
          if (!deleteActTarget) return;
          setDeletingAct(true);
          try {
            const res = await onDeleteActividad(deleteActTarget);
            if (!res.ok) {
              fail(res.error);
              setDeleteActTarget(null);
              return;
            }
            notify(`Registro "${deleteActTarget.titulo}" eliminado.`);
            setDeleteActTarget(null);
          } finally {
            setDeletingAct(false);
          }
        }}
      />
    </div>
  );
};
