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
import { ServiceResult } from '../services/controlOpsService';
import { formatMXN } from '../utils/calculations';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface AdminCatalogosViewProps {
  sucursales: Sucursal[];
  metas: MetaSucursal[];
  catalogos: CatalogosControlOps;
  usuarios: UsuarioControlOps[];
  actividades: ActividadDiaria[];
  currentUserId: string;
  supabaseConnected: boolean;
  onOpenSupabaseModal: () => void;
  onSaveSucursal: (suc: Sucursal) => Promise<ServiceResult>;
  onDeleteSucursal: (id: string) => Promise<ServiceResult>;
  onSaveMeta: (meta: MetaSucursal) => Promise<ServiceResult>;
  onSaveCatalogos: (catalogos: CatalogosControlOps) => Promise<ServiceResult>;
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
  onOpenSupabaseModal,
  onSaveSucursal,
  onDeleteSucursal,
  onSaveMeta,
  onSaveCatalogos,
  onSaveUsuario,
  onDeleteUsuario,
  onCreateActividadesBatch,
  onUpdateActividad,
  onDeleteActividad,
}) => {
  const [tab, setTab] = useState<AdminTab>('sucursales');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

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
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCat, setNewTaskCat] =
    useState<TareaCatalogo['categoria']>('Caja');
  const [newCallOption, setNewCallOption] = useState('');

  // --- Actividades Asignadas State ---
  const [actBranchFilter, setActBranchFilter] = useState<string>('todas');
  const [editingAct, setEditingAct] = useState<ActividadDiaria | null>(null);
  const [actForm, setActForm] = useState({
    sucursal_id: 'todas',
    titulo: '',
    descripcion: '',
    categoria: 'Caja' as ActividadDiaria['categoria'],
    dias_semana: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as DiaSemana[],
    hora_limite: '09:30',
    sin_horario_limite: false,
  });
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
    setErrorAlert(null);
    const id = `suc-${Date.now()}`;
    const created: Sucursal = {
      id,
      nombre: newBranch.nombre.trim(),
      codigo:
        newBranch.codigo.trim() || `SUC-${String(sucursales.length + 1).padStart(2, '0')}`,
      ciudad: newBranch.ciudad.trim() || 'CDMX',
      responsable_caja: newBranch.responsable_caja.trim() || 'Por asignar',
      meta_llamadas_diarias: 30,
      meta_actividades_diarias: 5,
      meta_refrendos_mensual: 40,
      techo_gasto_mensual: 4500,
      activa: true,
    };
    const resSuc = await onSaveSucursal(created);
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
      fail(resMeta.error);
      return;
    }
    setNewBranch({ nombre: '', codigo: '', ciudad: '', responsable_caja: '' });
    notify(`Sucursal "${created.nombre}" agregada en sucursales_config.`);
  };

  const handleSaveBranchRow = async (suc: Sucursal) => {
    const merged = branchDrafts[suc.id] || suc;
    const res = await onSaveSucursal(merged);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    notify(`Cambios guardados para ${merged.nombre}.`);
  };

  const handleToggleBranchActive = async (suc: Sucursal) => {
    const base = branchDrafts[suc.id] || suc;
    const updated = { ...base, activa: !base.activa };
    const res = await onSaveSucursal(updated);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    setBranchDrafts((prev) => ({ ...prev, [suc.id]: updated }));
    notify(
      `${updated.nombre} ${updated.activa ? 'activada' : 'desactivada'}.`
    );
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

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      tareas_obligatorias: [
        ...catalogos.tareas_obligatorias,
        {
          id: `tar-${Date.now()}`,
          titulo: newTaskTitle.trim(),
          categoria: newTaskCat,
          activa: true,
        },
      ],
    };
    const res = await onSaveCatalogos(nextCatalogos);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    setNewTaskTitle('');
    notify('Tarea agregada al catálogo operativo.');
  };

  const handleToggleTask = async (taskId: string) => {
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      tareas_obligatorias: catalogos.tareas_obligatorias.map((t) =>
        t.id === taskId ? { ...t, activa: !t.activa } : t
      ),
    };
    const res = await onSaveCatalogos(nextCatalogos);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    notify('Catálogo de actividades actualizado.');
  };

  const handleDeleteTask = async (taskId: string) => {
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      tareas_obligatorias: catalogos.tareas_obligatorias.filter(
        (t) => t.id !== taskId
      ),
    };
    const res = await onSaveCatalogos(nextCatalogos);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    notify('Tarea eliminada del catálogo.');
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

  const toggleActDia = (dia: DiaSemana) => {
    setActForm((prev) => {
      const exists = prev.dias_semana.includes(dia);
      return {
        ...prev,
        dias_semana: exists
          ? prev.dias_semana.filter((d) => d !== dia)
          : [...prev.dias_semana, dia],
      };
    });
  };

  const handleSaveAssignedActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actForm.titulo.trim()) return;
    const dias =
      actForm.dias_semana.length > 0 ? actForm.dias_semana : [...ALL_DIAS];

    if (editingAct) {
      const targetSuc =
        sucursales.find((s) => s.id === actForm.sucursal_id) || sucursales[0];
      const res = await onUpdateActividad({
        ...editingAct,
        sucursal_id: targetSuc.id,
        sucursal_nombre: targetSuc.nombre,
        responsable: targetSuc.responsable_caja,
        titulo: actForm.titulo.trim(),
        descripcion: actForm.descripcion.trim(),
        categoria: actForm.categoria,
        dias_semana: dias,
        hora_limite: actForm.sin_horario_limite
          ? null
          : actForm.hora_limite || '09:30',
        sin_horario_limite: actForm.sin_horario_limite,
      });
      if (!res.ok) {
        fail(res.error);
        return;
      }
      notify(`Actividad "${actForm.titulo.trim()}" actualizada.`);
      setEditingAct(null);
    } else {
      const targets =
        actForm.sucursal_id === 'todas'
          ? sucursales.filter((s) => s.activa)
          : sucursales.filter((s) => s.id === actForm.sucursal_id);
      const today = new Date().toISOString().slice(0, 10);
      const batch: ActividadDiaria[] = targets.map((suc, idx) => ({
        id: `act-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        sucursal_id: suc.id,
        sucursal_nombre: suc.nombre,
        titulo: actForm.titulo.trim(),
        descripcion: actForm.descripcion.trim(),
        categoria: actForm.categoria,
        responsable: suc.responsable_caja,
        fecha: today,
        hora_completada: null,
        estatus: 'Pendiente',
        evidencia_url: null,
        observaciones: '',
        dias_semana: dias,
        hora_limite: actForm.sin_horario_limite
          ? null
          : actForm.hora_limite || '09:30',
        sin_horario_limite: actForm.sin_horario_limite,
      }));
      const res = await onCreateActividadesBatch(batch);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      notify(
        `Actividad asignada a ${batch.length} sucursal(es) en actividades_diarias.`
      );
    }

    setActForm({
      sucursal_id: 'todas',
      titulo: '',
      descripcion: '',
      categoria: 'Caja',
      dias_semana: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'],
      hora_limite: '09:30',
      sin_horario_limite: false,
    });
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
            Conexión Supabase y Script SQL
          </button>
        </div>
      </div>

      {/* TAB 1: SUCURSALES */}
      {tab === 'sucursales' && (
        <div className="space-y-5">
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
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar sucursal
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
          {/* Assigned Activities Management (actividades_diarias) */}
          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-bold text-[#1F172B]">
                  Asignar, editar o eliminar actividades en sucursales (actividades_diarias)
                </h2>
                <p className="text-xs text-[#7A6B93]">
                  Las actividades creadas aquí aparecen automáticamente en la lista diaria de las cajeras asignadas.
                </p>
              </div>
              {editingAct && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAct(null);
                    setActForm({
                      sucursal_id: 'todas',
                      titulo: '',
                      descripcion: '',
                      categoria: 'Caja',
                      dias_semana: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'],
                      hora_limite: '09:30',
                      sin_horario_limite: false,
                    });
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FAF8FC] text-[#6E5F87] border border-[#EAE3F5]"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar edición
                </button>
              )}
            </div>

            <form
              onSubmit={handleSaveAssignedActivity}
              className="rounded-xl border border-[#EAE3F5] bg-[#FAF8FC] p-4 space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={actForm.titulo}
                  onChange={(e) =>
                    setActForm({ ...actForm, titulo: e.target.value })
                  }
                  placeholder="Título de actividad *"
                  className="md:col-span-2 px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs"
                />
                <select
                  value={actForm.sucursal_id}
                  onChange={(e) =>
                    setActForm({ ...actForm, sucursal_id: e.target.value })
                  }
                  className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs"
                >
                  {!editingAct && (
                    <option value="todas">
                      Todas las sucursales activas ({sucursales.filter((s) => s.activa).length})
                    </option>
                  )}
                  {sucursales
                    .filter((s) => s.activa)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                </select>
                <select
                  value={actForm.categoria}
                  onChange={(e) =>
                    setActForm({
                      ...actForm,
                      categoria: e.target.value as ActividadDiaria['categoria'],
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
                  value={actForm.descripcion}
                  onChange={(e) =>
                    setActForm({ ...actForm, descripcion: e.target.value })
                  }
                  placeholder="Descripción o instrucciones para la cajera..."
                  className="lg:col-span-5 px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs"
                />

                <div className="lg:col-span-4 flex flex-wrap gap-1">
                  {ALL_DIAS.map((d) => {
                    const active = actForm.dias_semana.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleActDia(d)}
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
                    disabled={actForm.sin_horario_limite}
                    value={actForm.hora_limite}
                    onChange={(e) =>
                      setActForm({ ...actForm, hora_limite: e.target.value })
                    }
                    className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-white text-xs font-mono-num disabled:opacity-50"
                  />
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5B21B6] whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={actForm.sin_horario_limite}
                      onChange={(e) =>
                        setActForm({
                          ...actForm,
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                >
                  {editingAct ? (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      Guardar cambios en actividad
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Crear y asignar actividad
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#55476E]">
                Actividades asignadas ({actividades.filter((a) => actBranchFilter === 'todas' || a.sucursal_id === actBranchFilter).length})
              </span>
              <select
                aria-label="Filtrar actividades asignadas por sucursal"
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
              {actividades
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
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7A6B93] mt-0.5">
                        <span>{act.sucursal_nombre}</span>
                        <span>·</span>
                        <span>{act.categoria}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {act.sin_horario_limite
                            ? 'Sin horario límite'
                            : act.hora_limite
                              ? `Límite ${act.hora_limite}`
                              : 'Horario sucursal'}
                        </span>
                        {act.dias_semana && act.dias_semana.length > 0 && (
                          <span>
                            ({act.dias_semana.map((d) => DIA_SHORT[d]).join(', ')})
                          </span>
                        )}
                      </div>
                      {act.descripcion && (
                        <p className="text-[11px] text-[#55476E] truncate mt-0.5">
                          {act.descripcion}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5 bg-[#FAF8FC] border border-[#EAE3F5] rounded-lg px-2 py-1">
                        <input
                          type="time"
                          aria-label={`Hora límite de ${act.titulo}`}
                          disabled={Boolean(act.sin_horario_limite)}
                          value={act.hora_limite || '09:30'}
                          onChange={async (e) => {
                            const res = await onUpdateActividad({
                              ...act,
                              hora_limite: e.target.value,
                              sin_horario_limite: false,
                            });
                            if (!res.ok) {
                              fail(res.error);
                              return;
                            }
                            notify(`Horario de "${act.titulo}" actualizado a ${e.target.value}.`);
                          }}
                          className="text-[11px] font-mono-num bg-transparent focus:outline-none disabled:opacity-45"
                        />
                        <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#5B21B6] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(act.sin_horario_limite)}
                            onChange={async (e) => {
                              const sinLim = e.target.checked;
                              const res = await onUpdateActividad({
                                ...act,
                                sin_horario_limite: sinLim,
                                hora_limite: sinLim ? null : act.hora_limite || '09:30',
                              });
                              if (!res.ok) {
                                fail(res.error);
                                return;
                              }
                              notify(
                                sinLim
                                  ? `"${act.titulo}" marcada sin horario límite.`
                                  : `Horario límite reactivado en "${act.titulo}".`
                              );
                            }}
                          />
                          Sin límite
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAct(act);
                          setActForm({
                            sucursal_id: act.sucursal_id,
                            titulo: act.titulo,
                            descripcion: act.descripcion || '',
                            categoria: act.categoria,
                            dias_semana:
                              act.dias_semana && act.dias_semana.length > 0
                                ? act.dias_semana
                                : [...ALL_DIAS],
                            hora_limite: act.hora_limite || '09:30',
                            sin_horario_limite: Boolean(act.sin_horario_limite),
                          });
                        }}
                        title="Editar actividad"
                        className="p-1.5 rounded-lg text-[#5B21B6] hover:bg-[#F3ECFC]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteActTarget(act)}
                        title="Eliminar actividad"
                        className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Mandatory Tasks */}
          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 space-y-4">
            <div>
              <h2 className="font-display text-sm font-bold text-[#1F172B]">
                Tareas diarias obligatorias de cajeras
              </h2>
              <p className="text-xs text-[#7A6B93]">
                Define las actividades base disponibles al programar o registrar
                operación diaria.
              </p>
            </div>

            <form onSubmit={handleAddTask} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Nueva tarea obligatoria..."
                className="flex-1 px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              />
              <select
                value={newTaskCat}
                onChange={(e) =>
                  setNewTaskCat(e.target.value as TareaCatalogo['categoria'])
                }
                className="px-2.5 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
              >
                <option value="Caja">Caja</option>
                <option value="Corte">Corte</option>
                <option value="Expedientes">Expedientes</option>
                <option value="Auditoría">Auditoría</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </button>
            </form>

            <div className="divide-y divide-[#F1ECF9] border border-[#EAE3F5] rounded-xl overflow-hidden">
              {catalogos.tareas_obligatorias.map((t) => (
                <div
                  key={t.id}
                  className="px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-[#FCFAFE]"
                >
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-semibold ${
                        t.activa ? 'text-[#1F172B]' : 'text-[#9D8FB5] line-through'
                      }`}
                    >
                      {t.titulo}
                    </p>
                    <p className="text-[11px] text-[#7A6B93]">{t.categoria}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleTask(t.id)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${
                        t.activa
                          ? 'bg-[#F0FDF4] text-[#15803D]'
                          : 'bg-[#FAF8FC] text-[#8B7CA5]'
                      }`}
                    >
                      {t.activa ? 'Activa' : 'Pausada'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(t.id)}
                      className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
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
        open={Boolean(deleteActTarget)}
        title="¿Seguro que deseas eliminar este registro?"
        detail={
          deleteActTarget
            ? `Se eliminará la actividad "${deleteActTarget.titulo}" (${deleteActTarget.sucursal_nombre}) de actividades_diarias y su evidencia adjunta si existe.`
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
            notify(`Actividad "${deleteActTarget.titulo}" eliminada.`);
            setDeleteActTarget(null);
          } finally {
            setDeletingAct(false);
          }
        }}
      />
    </div>
  );
};
