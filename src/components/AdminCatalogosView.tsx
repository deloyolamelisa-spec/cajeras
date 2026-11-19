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
} from 'lucide-react';
import {
  CatalogosControlOps,
  MetaSucursal,
  RolUsuario,
  Sucursal,
  TareaCatalogo,
  UsuarioControlOps,
} from '../types/controlops';
import { formatMXN } from '../utils/calculations';

interface AdminCatalogosViewProps {
  sucursales: Sucursal[];
  metas: MetaSucursal[];
  catalogos: CatalogosControlOps;
  usuarios: UsuarioControlOps[];
  currentUserId: string;
  supabaseConnected: boolean;
  onOpenSupabaseModal: () => void;
  onSaveSucursal: (suc: Sucursal) => Promise<void>;
  onDeleteSucursal: (id: string) => Promise<void>;
  onSaveMeta: (meta: MetaSucursal) => Promise<void>;
  onSaveCatalogos: (catalogos: CatalogosControlOps) => Promise<void>;
  onSaveUsuario: (usr: UsuarioControlOps) => Promise<void>;
  onDeleteUsuario: (id: string) => Promise<void>;
}

type AdminTab = 'sucursales' | 'metas' | 'catalogos' | 'usuarios';

export const AdminCatalogosView: React.FC<AdminCatalogosViewProps> = ({
  sucursales,
  metas,
  catalogos,
  usuarios,
  currentUserId,
  supabaseConnected,
  onOpenSupabaseModal,
  onSaveSucursal,
  onDeleteSucursal,
  onSaveMeta,
  onSaveCatalogos,
  onSaveUsuario,
  onDeleteUsuario,
}) => {
  const [tab, setTab] = useState<AdminTab>('sucursales');
  const [feedback, setFeedback] = useState<string | null>(null);

  const notify = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2400);
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
    await onSaveSucursal(created);
    await onSaveMeta({
      id: `meta-${id}`,
      sucursal_id: id,
      meta_llamadas_diarias: 30,
      meta_actividades_diarias: 5,
      meta_refrendos_mensual: 40,
      techo_gasto_mensual: 4500,
    });
    setNewBranch({ nombre: '', codigo: '', ciudad: '', responsable_caja: '' });
    notify(`Sucursal "${created.nombre}" agregada en sucursales_config.`);
  };

  const handleSaveBranchRow = async (suc: Sucursal) => {
    const merged = branchDrafts[suc.id] || suc;
    await onSaveSucursal(merged);
    notify(`Cambios guardados para ${merged.nombre}.`);
  };

  const handleToggleBranchActive = async (suc: Sucursal) => {
    const base = branchDrafts[suc.id] || suc;
    const updated = { ...base, activa: !base.activa };
    setBranchDrafts((prev) => ({ ...prev, [suc.id]: updated }));
    await onSaveSucursal(updated);
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
    await onSaveMeta(m);
    await onSaveSucursal({
      ...suc,
      meta_llamadas_diarias: m.meta_llamadas_diarias,
      meta_actividades_diarias: m.meta_actividades_diarias,
      meta_refrendos_mensual: m.meta_refrendos_mensual,
      techo_gasto_mensual: m.techo_gasto_mensual,
    });
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
    await onSaveCatalogos(nextCatalogos);
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
    await onSaveCatalogos(nextCatalogos);
    notify('Catálogo de actividades actualizado.');
  };

  const handleDeleteTask = async (taskId: string) => {
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      tareas_obligatorias: catalogos.tareas_obligatorias.filter(
        (t) => t.id !== taskId
      ),
    };
    await onSaveCatalogos(nextCatalogos);
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
    await onSaveCatalogos(nextCatalogos);
    setNewCallOption('');
    notify(`Opción "${trimmed}" agregada al selector de llamadas.`);
  };

  const handleDeleteCallOption = async (opt: string) => {
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      opciones_llamada: catalogos.opciones_llamada.filter((o) => o !== opt),
    };
    await onSaveCatalogos(nextCatalogos);
    notify(`Opción "${opt}" eliminada.`);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.nombre.trim() || !newUser.correo.trim() || !newUser.password)
      return;
    const created: UsuarioControlOps = {
      id: `usr-${Date.now()}`,
      nombre: newUser.nombre.trim(),
      correo: newUser.correo.trim().toLowerCase(),
      password: newUser.password,
      rol: newUser.rol,
      sucursal_id: newUser.rol === 'cajera' ? newUser.sucursal_id : 'todas',
      activo: true,
    };
    await onSaveUsuario(created);
    setNewUser({
      nombre: '',
      correo: '',
      password: '',
      rol: 'cajera',
      sucursal_id: sucursales[0]?.id || 'suc-centro',
    });
    notify(`Usuario ${created.nombre} creado en usuarios_controlops.`);
  };

  const handleSaveUserRow = async (usr: UsuarioControlOps) => {
    const merged = userDrafts[usr.id] || usr;
    const normalized: UsuarioControlOps = {
      ...merged,
      nombre: merged.nombre.trim(),
      correo: merged.correo.trim().toLowerCase(),
      sucursal_id:
        merged.rol === 'cajera'
          ? merged.sucursal_id === 'todas'
            ? sucursales[0]?.id || 'suc-centro'
            : merged.sucursal_id
          : 'todas',
    };
    await onSaveUsuario(normalized);
    notify(`Usuario ${normalized.nombre} guardado en usuarios_controlops.`);
  };

  return (
    <div className="space-y-6">
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
                            onClick={() => onDeleteSucursal(suc.id)}
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
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear usuario
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
                            onClick={() => {
                              const nextUsr = {
                                ...draft,
                                activo: !draft.activo,
                              };
                              setUserDrafts((p) => ({
                                ...p,
                                [usr.id]: nextUsr,
                              }));
                              onSaveUsuario(nextUsr);
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
                              onClick={() => onDeleteUsuario(usr.id)}
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
    </div>
  );
};
