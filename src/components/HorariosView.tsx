import React, { useMemo, useState } from 'react';
import {
  Clock,
  Check,
  Calendar,
  AlertTriangle,
  Building2,
  UserCheck,
  Globe,
  RotateCcw,
} from 'lucide-react';
import {
  DiaSemana,
  HorarioPersonalizado,
  HorarioSucursalDia,
  Sucursal,
  TareaCatalogo,
  UsuarioControlOps,
} from '../types/controlops';
import { ServiceResult } from '../services/controlOpsService';
import { DIAS_SEMANA } from '../data/mockData';
import {
  ensureBaseDailyCatalogTasks,
  formatHora12h,
  isFixedBaseTask,
  resolveTareaHorarioForContext,
} from '../utils/calculations';

interface HorariosViewProps {
  sucursales: Sucursal[];
  horarios: HorarioSucursalDia[];
  selectedSucursalId: string;
  canEdit: boolean;
  onUpdateHorario: (horario: HorarioSucursalDia) => Promise<ServiceResult>;
  onApplyWeekdays: (
    sucursalId: string,
    horaActividad: string,
    horaCorte: string,
    sinLimite: boolean
  ) => Promise<ServiceResult>;
  tareasCatalogo?: TareaCatalogo[];
  usuarios?: UsuarioControlOps[];
  onSaveCatalogTask?: (
    tarea: TareaCatalogo,
    isNew: boolean
  ) => Promise<ServiceResult>;
}

type HorarioScopeMode = 'global' | 'sucursal' | 'cajera';

export const HorariosView: React.FC<HorariosViewProps> = ({
  sucursales,
  horarios,
  selectedSucursalId,
  canEdit,
  onUpdateHorario,
  onApplyWeekdays,
  tareasCatalogo = [],
  usuarios = [],
  onSaveCatalogTask,
}) => {
  const [sucursalId, setSucursalId] = useState<string>(
    selectedSucursalId !== 'todas'
      ? selectedSucursalId
      : sucursales[0]?.id || 'suc-centro'
  );
  const [dia, setDia] = useState<DiaSemana>('lunes');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [scopeMode, setScopeMode] = useState<HorarioScopeMode>('global');
  const [selectedCajeraKey, setSelectedCajeraKey] = useState<string>('');
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const guaranteedTasks = useMemo(
    () => ensureBaseDailyCatalogTasks(tareasCatalogo),
    [tareasCatalogo]
  );

  const cajeraList = useMemo(() => {
    const map = new Map<
      string,
      { id: string; nombre: string; sucursalId: string; sucursalNombre: string }
    >();
    usuarios
      .filter((u) => u.rol === 'cajera' && u.activo)
      .forEach((u) => {
        const suc = sucursales.find((s) => s.id === u.sucursal_id);
        map.set(u.id, {
          id: u.id,
          nombre: u.nombre,
          sucursalId: u.sucursal_id || '',
          sucursalNombre: suc?.nombre || 'Sucursal asignada',
        });
      });
    sucursales
      .filter((s) => s.activa && s.responsable_caja)
      .forEach((s) => {
        const already = Array.from(map.values()).some(
          (c) =>
            c.nombre.trim().toLowerCase() ===
            s.responsable_caja.trim().toLowerCase()
        );
        if (!already) {
          const key = s.responsable_caja.trim().toLowerCase();
          map.set(key, {
            id: key,
            nombre: s.responsable_caja,
            sucursalId: s.id,
            sucursalNombre: s.nombre,
          });
        }
      });
    return Array.from(map.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre)
    );
  }, [usuarios, sucursales]);

  const effectiveCajera = useMemo(() => {
    if (cajeraList.length === 0) return null;
    return (
      cajeraList.find((c) => c.id === selectedCajeraKey) || cajeraList[0]
    );
  }, [cajeraList, selectedCajeraKey]);

  const activeSucursalId =
    selectedSucursalId !== 'todas' ? selectedSucursalId : sucursalId;

  const currentHorario = useMemo(() => {
    return (
      horarios.find(
        (h) => h.sucursal_id === activeSucursalId && h.dia === dia
      ) || {
        id: `hor-${activeSucursalId}-${dia}`,
        sucursal_id: activeSucursalId,
        dia,
        hora_limite_actividad: '09:00',
        hora_limite_corte: '18:30',
        sin_horario_limite: false,
      }
    );
  }, [horarios, activeSucursalId, dia]);

  const branchWeekHorarios = useMemo(() => {
    return DIAS_SEMANA.map((d) => {
      const found = horarios.find(
        (h) => h.sucursal_id === activeSucursalId && h.dia === d.key
      );
      return {
        diaInfo: d,
        horario: found || {
          id: `hor-${activeSucursalId}-${d.key}`,
          sucursal_id: activeSucursalId,
          dia: d.key,
          hora_limite_actividad: '09:00',
          hora_limite_corte: '18:30',
          sin_horario_limite: false,
        },
      };
    });
  }, [horarios, activeSucursalId]);

  const notifySaved = (msg: string) => {
    setErrorAlert(null);
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 2200);
  };

  const handleToggleSinLimite = async () => {
    const updated: HorarioSucursalDia = {
      ...currentHorario,
      sin_horario_limite: !currentHorario.sin_horario_limite,
    };
    const res = await onUpdateHorario(updated);
    if (!res.ok) {
      setErrorAlert(res.error || 'No se pudo guardar en horarios_sucursal.');
      return;
    }
    notifySaved(
      updated.sin_horario_limite
        ? 'Interruptor "Sin horario límite" activado.'
        : 'Horario límite reactivado para este día.'
    );
  };

  const handleTimeChange = async (
    field: 'hora_limite_actividad' | 'hora_limite_corte',
    value: string
  ) => {
    const res = await onUpdateHorario({
      ...currentHorario,
      [field]: value,
    });
    if (!res.ok) {
      setErrorAlert(res.error || 'No se pudo guardar en horarios_sucursal.');
      return;
    }
    notifySaved('Horario actualizado en Supabase.');
  };

  const activeBranchObj = sucursales.find((s) => s.id === activeSucursalId);

  return (
    <div className="space-y-6">
      {errorAlert && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] px-4 py-3 text-xs text-[#BE123C] flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#E11D48]" />
            <span>
              <strong>Error en horarios_sucursal:</strong> {errorAlert}
            </span>
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

      {/* Configuration Panel */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#F1ECF9] pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#1F172B]">
              Configuración de horarios por día y sucursal
            </h2>
            <p className="text-xs text-[#7A6B93] mt-0.5">
              {canEdit
                ? 'Define los horarios límite de vencimiento de actividades o activa "Sin horario límite" para evitar vencimientos por hora.'
                : 'Vista de consulta: solo el Administrador Total (Creador) puede modificar horarios globales.'}
            </p>
          </div>
          {savedFeedback && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-1.5 rounded-xl">
              <Check className="h-3.5 w-3.5" />
              {savedFeedback}
            </span>
          )}
        </div>

        {/* Selectors: Branch & Day */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-[#55476E] mb-2">
              1. Seleccionar sucursal
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {(selectedSucursalId !== 'todas' && !canEdit
                ? sucursales.filter((s) => s.id === selectedSucursalId)
                : sucursales.filter((s) => s.activa)
              ).map((suc) => {
                const isSelected = activeSucursalId === suc.id;
                return (
                  <button
                    key={suc.id}
                    type="button"
                    onClick={() => setSucursalId(suc.id)}
                    className={`px-3.5 py-2.5 rounded-xl text-left border transition-colors ${
                      isSelected
                        ? 'bg-[#F3ECFC] border-[#8B5CF6] text-[#4C1D95]'
                        : 'bg-[#FAF8FC] border-[#EAE3F5] text-[#55476E] hover:bg-white'
                    }`}
                  >
                    <div className="text-xs font-bold">{suc.nombre}</div>
                    <div className="text-[11px] opacity-80">
                      {suc.responsable_caja}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#55476E] mb-2">
              2. Seleccionar día de la semana
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {DIAS_SEMANA.map((d) => {
                const isSelected = dia === d.key;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDia(d.key)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition-colors text-center ${
                      isSelected
                        ? 'bg-[#FDF2F8] border-[#EC4899] text-[#9D174D]'
                        : 'bg-[#FAF8FC] border-[#EAE3F5] text-[#55476E] hover:bg-white'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>

            {/* Active Day Controls */}
            <div className="mt-5 rounded-xl bg-[#FAF8FC] border border-[#EAE3F5] p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-[#1F172B]">
                    Sin horario límite
                  </p>
                  <p className="text-xs text-[#7A6B93]">
                    Si está activo, el día{' '}
                    <span className="font-semibold text-[#5B21B6]">
                      {DIAS_SEMANA.find((x) => x.key === dia)?.label}
                    </span>{' '}
                    en {activeBranchObj?.nombre} no marcará vencimientos por
                    hora.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  disabled={!canEdit}
                  aria-checked={currentHorario.sin_horario_limite}
                  onClick={handleToggleSinLimite}
                  className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    canEdit ? 'cursor-pointer' : ''
                  } ${
                    currentHorario.sin_horario_limite
                      ? 'bg-[#DB2777]'
                      : 'bg-[#DDD4EE]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ${
                      currentHorario.sin_horario_limite
                        ? 'translate-x-5'
                        : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#EAE3F5] transition-opacity ${
                  currentHorario.sin_horario_limite ? 'opacity-45' : ''
                }`}
              >
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Hora límite apertura / actividades
                  </label>
                  <input
                    type="time"
                    disabled={!canEdit || currentHorario.sin_horario_limite}
                    value={currentHorario.hora_limite_actividad}
                    onChange={(e) =>
                      handleTimeChange('hora_limite_actividad', e.target.value)
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-sm font-mono-num text-[#1F172B] disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Hora límite de corte de caja
                  </label>
                  <input
                    type="time"
                    disabled={!canEdit || currentHorario.sin_horario_limite}
                    value={currentHorario.hora_limite_corte}
                    onChange={(e) =>
                      handleTimeChange('hora_limite_corte', e.target.value)
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-sm font-mono-num text-[#1F172B] disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {canEdit && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await onApplyWeekdays(
                        activeSucursalId,
                        currentHorario.hora_limite_actividad,
                        currentHorario.hora_limite_corte,
                        currentHorario.sin_horario_limite
                      );
                      if (!res.ok) {
                        setErrorAlert(
                          res.error || 'No se pudo guardar en horarios_sucursal.'
                        );
                        return;
                      }
                      notifySaved(
                        `Configuración aplicada de Lunes a Viernes para ${activeBranchObj?.nombre}.`
                      );
                    }}
                    className="text-xs font-semibold text-[#6D28D9] hover:text-[#DB2777] transition-colors"
                  >
                    Aplicar este mismo horario de Lunes a Viernes
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Weekly Summary Matrix */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F1ECF9] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#7C3AED]" />
            <h3 className="font-display text-sm font-bold text-[#1F172B]">
              Resumen semanal — {activeBranchObj?.nombre}
            </h3>
          </div>
          <span className="text-xs text-[#7A6B93]">
            Haz clic en cualquier día para editarlo
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-[#F1ECF9]">
          {branchWeekHorarios.map(({ diaInfo, horario }) => {
            const isSelected = dia === diaInfo.key;
            return (
              <button
                key={diaInfo.key}
                type="button"
                onClick={() => setDia(diaInfo.key)}
                className={`p-4 text-left transition-colors space-y-2 ${
                  isSelected ? 'bg-[#FAF5FF]' : 'hover:bg-[#FCFAFE]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1F172B]">
                    {diaInfo.label}
                  </span>
                  <Clock
                    className={`h-3.5 w-3.5 ${
                      horario.sin_horario_limite
                        ? 'text-[#DB2777]'
                        : 'text-[#8B7CA5]'
                    }`}
                  />
                </div>

                {horario.sin_horario_limite ? (
                  <p className="text-xs font-semibold text-[#BE185D]">
                    Sin horario límite
                  </p>
                ) : (
                  <div className="space-y-1 font-mono-num text-xs text-[#55476E]">
                    <div>Act: {horario.hora_limite_actividad}</div>
                    <div>Corte: {horario.hora_limite_corte}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Per-Activity, Per-Branch & Per-Cajera Customizable Deadlines */}
      {onSaveCatalogTask && (
        <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 md:p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#F1ECF9] pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#1F172B]">
                Horarios límite por actividad, sucursal y cajera
              </h2>
              <p className="text-xs text-[#7A6B93] mt-0.5">
                {canEdit
                  ? 'Personaliza el horario límite de cada una de las 9 actividades diarias (o actividades extra) de forma global, por sucursal o por cajera sin afectar el listado diario.'
                  : 'Consulta de horarios límite asignados por actividad.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F0FC] rounded-xl">
              <button
                type="button"
                onClick={() => setScopeMode('global')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  scopeMode === 'global'
                    ? 'bg-white text-[#5B21B6] shadow-xs'
                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                Global (base)
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('sucursal')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  scopeMode === 'sucursal'
                    ? 'bg-white text-[#5B21B6] shadow-xs'
                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                Por sucursal
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('cajera')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  scopeMode === 'cajera'
                    ? 'bg-white text-[#5B21B6] shadow-xs'
                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Por cajera
              </button>
            </div>
          </div>

          {scopeMode === 'sucursal' && (
            <div className="flex flex-wrap items-center gap-3 bg-[#FAF8FC] border border-[#EAE3F5] rounded-xl px-4 py-3">
              <span className="text-xs font-semibold text-[#55476E]">
                Sucursal seleccionada:
              </span>
              <span className="text-xs font-bold text-[#5B21B6]">
                {activeBranchObj?.nombre || activeSucursalId}
              </span>
              <span className="text-[11px] text-[#7A6B93]">
                (Cambia la sucursal arriba o en el filtro global para editar otra)
              </span>
            </div>
          )}

          {scopeMode === 'cajera' && (
            <div className="flex flex-wrap items-center gap-3 bg-[#FAF8FC] border border-[#EAE3F5] rounded-xl px-4 py-3">
              <label
                htmlFor="horario-cajera-select"
                className="text-xs font-semibold text-[#55476E]"
              >
                Cajera a personalizar:
              </label>
              <select
                id="horario-cajera-select"
                value={effectiveCajera?.id || ''}
                onChange={(e) => setSelectedCajeraKey(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[#E6DDF5] bg-white text-xs font-semibold text-[#5B21B6] focus:outline-none focus:border-[#7C3AED]"
              >
                {cajeraList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {c.sucursalNombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="divide-y divide-[#F1ECF9] border border-[#EAE3F5] rounded-xl overflow-hidden">
            {guaranteedTasks.map((task) => {
              const isBase = isFixedBaseTask(task);
              const hasBranchOverride = Boolean(
                task.horarios_por_sucursal?.[activeSucursalId]
              );
              const hasCajeraOverride = Boolean(
                effectiveCajera &&
                  (task.horarios_por_cajera?.[effectiveCajera.id] ||
                    task.horarios_por_cajera?.[
                      effectiveCajera.nombre.trim().toLowerCase()
                    ])
              );

              const effective =
                scopeMode === 'global'
                  ? {
                      sin_horario_limite: Boolean(task.sin_horario_limite),
                      hora_limite: task.sin_horario_limite
                        ? null
                        : task.hora_limite || '09:30',
                    }
                  : scopeMode === 'sucursal'
                    ? resolveTareaHorarioForContext(task, activeSucursalId)
                    : resolveTareaHorarioForContext(
                        task,
                        effectiveCajera?.sucursalId || activeSucursalId,
                        effectiveCajera || undefined
                      );

              const isCustomized =
                scopeMode === 'sucursal'
                  ? hasBranchOverride
                  : scopeMode === 'cajera'
                    ? hasCajeraOverride
                    : false;

              const handleSaveOverride = async (
                nextHorario: HorarioPersonalizado | null
              ) => {
                if (!canEdit || !onSaveCatalogTask) return;
                setSavingTaskId(task.id);
                let nextTask: TareaCatalogo = { ...task };

                if (scopeMode === 'global') {
                  if (nextHorario) {
                    nextTask = {
                      ...task,
                      hora_limite: nextHorario.sin_horario_limite
                        ? null
                        : nextHorario.hora_limite || '09:30',
                      sin_horario_limite: Boolean(
                        nextHorario.sin_horario_limite
                      ),
                    };
                  }
                } else if (scopeMode === 'sucursal') {
                  const prevMap = { ...(task.horarios_por_sucursal || {}) };
                  if (nextHorario === null) {
                    delete prevMap[activeSucursalId];
                  } else {
                    prevMap[activeSucursalId] = nextHorario;
                  }
                  nextTask = { ...task, horarios_por_sucursal: prevMap };
                } else if (scopeMode === 'cajera' && effectiveCajera) {
                  const prevMap = { ...(task.horarios_por_cajera || {}) };
                  const normName = effectiveCajera.nombre.trim().toLowerCase();
                  if (nextHorario === null) {
                    delete prevMap[effectiveCajera.id];
                    delete prevMap[normName];
                  } else {
                    prevMap[effectiveCajera.id] = nextHorario;
                  }
                  nextTask = { ...task, horarios_por_cajera: prevMap };
                }

                const res = await onSaveCatalogTask(nextTask, false);
                setSavingTaskId(null);
                if (!res.ok) {
                  setErrorAlert(
                    res.error || 'No se pudo guardar el horario personalizado.'
                  );
                  return;
                }
                notifySaved(
                  nextHorario === null
                    ? `Horario de "${task.titulo}" restablecido al valor heredado.`
                    : `Horario de "${task.titulo}" actualizado.`
                );
              };

              return (
                <div
                  key={task.id}
                  className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white hover:bg-[#FCFAFE]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#1F172B]">
                        {task.titulo}
                      </span>
                      {isBase && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#F3ECFC] text-[#5B21B6]">
                          Fija diaria
                        </span>
                      )}
                      {isCustomized && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#FDF2F8] text-[#BE185D]">
                          Horario personalizado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#7A6B93] mt-0.5">
                      {task.descripcion || task.categoria} · Activo:{' '}
                      <span className="font-semibold text-[#55476E]">
                        {effective.sin_horario_limite
                          ? 'Sin horario límite'
                          : effective.hora_limite
                            ? formatHora12h(effective.hora_limite)
                            : '09:30 a.m.'}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 bg-[#FAF8FC] border border-[#EAE3F5] rounded-xl px-2.5 py-1.5">
                      <Clock className="h-3.5 w-3.5 text-[#6D28D9]" />
                      <input
                        type="time"
                        aria-label={`Horario ${scopeMode} de ${task.titulo}`}
                        disabled={
                          !canEdit ||
                          savingTaskId === task.id ||
                          Boolean(effective.sin_horario_limite)
                        }
                        value={effective.hora_limite || '09:30'}
                        onChange={(e) =>
                          void handleSaveOverride({
                            hora_limite: e.target.value,
                            sin_horario_limite: false,
                          })
                        }
                        className="text-xs font-mono-num bg-transparent focus:outline-none disabled:opacity-45"
                      />
                    </div>

                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5B21B6] cursor-pointer px-2 py-1">
                      <input
                        type="checkbox"
                        disabled={!canEdit || savingTaskId === task.id}
                        checked={Boolean(effective.sin_horario_limite)}
                        onChange={(e) => {
                          const sinLim = e.target.checked;
                          void handleSaveOverride({
                            sin_horario_limite: sinLim,
                            hora_limite: sinLim
                              ? null
                              : effective.hora_limite || task.hora_limite || '09:30',
                          });
                        }}
                      />
                      Sin límite
                    </label>

                    {canEdit && scopeMode !== 'global' && isCustomized && (
                      <button
                        type="button"
                        disabled={savingTaskId === task.id}
                        onClick={() => void handleSaveOverride(null)}
                        title="Restablecer al horario heredado"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-[#6E5F87] hover:text-[#1F172B] bg-[#FAF8FC] border border-[#EAE3F5]"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Heredar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
