import React, { useMemo, useState } from 'react';
import { Clock, Check, Calendar } from 'lucide-react';
import { DiaSemana, HorarioSucursalDia, Sucursal } from '../types/controlops';
import { DIAS_SEMANA } from '../data/mockData';

interface HorariosViewProps {
  sucursales: Sucursal[];
  horarios: HorarioSucursalDia[];
  selectedSucursalId: string;
  canEdit: boolean;
  onUpdateHorario: (horario: HorarioSucursalDia) => Promise<void>;
  onApplyWeekdays: (
    sucursalId: string,
    horaActividad: string,
    horaCorte: string,
    sinLimite: boolean
  ) => Promise<void>;
}

export const HorariosView: React.FC<HorariosViewProps> = ({
  sucursales,
  horarios,
  selectedSucursalId,
  canEdit,
  onUpdateHorario,
  onApplyWeekdays,
}) => {
  const [sucursalId, setSucursalId] = useState<string>(
    selectedSucursalId !== 'todas'
      ? selectedSucursalId
      : sucursales[0]?.id || 'suc-centro'
  );
  const [dia, setDia] = useState<DiaSemana>('lunes');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

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
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 2200);
  };

  const handleToggleSinLimite = async () => {
    const updated: HorarioSucursalDia = {
      ...currentHorario,
      sin_horario_limite: !currentHorario.sin_horario_limite,
    };
    await onUpdateHorario(updated);
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
    await onUpdateHorario({
      ...currentHorario,
      [field]: value,
    });
    notifySaved('Horario actualizado.');
  };

  const activeBranchObj = sucursales.find((s) => s.id === activeSucursalId);

  return (
    <div className="space-y-6">
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
                      await onApplyWeekdays(
                        activeSucursalId,
                        currentHorario.hora_limite_actividad,
                        currentHorario.hora_limite_corte,
                        currentHorario.sin_horario_limite
                      );
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
    </div>
  );
};
