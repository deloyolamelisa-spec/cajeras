import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { RankingView } from './components/RankingView';
import { LlamadasView } from './components/LlamadasView';
import { ActividadesView } from './components/ActividadesView';
import { GastosRefrendosView } from './components/GastosRefrendosView';
import { HorariosView } from './components/HorariosView';
import { SupabaseSetupModal } from './components/SupabaseSetupModal';
import {
  ActividadDiaria,
  DiaSemana,
  GastoYRefrendo,
  HorarioSucursalDia,
  LlamadaSucursal,
  SectionId,
  Sucursal,
} from './types/controlops';
import {
  loadAllOperationalData,
  resetDemoLocalData,
  saveActividad,
  saveGastoORefrendo,
  saveHorarioDia,
  saveLlamada,
} from './services/controlOpsService';
import {
  computeBranchSummaries,
  getTodayDiaSemana,
} from './utils/calculations';
import { isSupabaseConfigured } from './lib/supabaseConfig';

const SECTION_TITLES: Record<SectionId, { title: string; subtitle: string }> = {
  ranking: {
    title: 'Ranking General por Sucursal',
    subtitle: 'Comparativa integral de actividades, gastos, refrendos y llamadas',
  },
  llamadas: {
    title: 'Módulo de Llamadas y Auditoría',
    subtitle: 'Seguimiento diario de marcación, reportes de caja y validación',
  },
  actividades: {
    title: 'Actividades Diarias y Evidencias',
    subtitle: 'Cumplimiento operativo, horarios límite y respaldo fotográfico',
  },
  gastos: {
    title: 'Gastos (Techo Máximo) y Refrendos',
    subtitle: 'Control de sobrecostos presupuestales y metas de renovación',
  },
  horarios: {
    title: 'Configuración de Horarios',
    subtitle: 'Límites de vencimiento por día y sucursal',
  },
};

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('ranking');
  const [selectedSucursalId, setSelectedSucursalId] = useState<string>('todas');
  const [diaActivo, setDiaActivo] = useState<DiaSemana>(getTodayDiaSemana());

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [llamadas, setLlamadas] = useState<LlamadaSucursal[]>([]);
  const [actividades, setActividades] = useState<ActividadDiaria[]>([]);
  const [gastosYRefrendos, setGastosYRefrendos] = useState<GastoYRefrendo[]>([]);
  const [horarios, setHorarios] = useState<HorarioSucursalDia[]>([]);

  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'supabase' | 'demo'>('demo');
  const [supabaseWarning, setSupabaseWarning] = useState<string | undefined>();
  const [syncError, setSyncError] = useState<string | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supabaseModalOpen, setSupabaseModalOpen] = useState(false);
  const [quickModal, setQuickModal] = useState<
    'llamada' | 'evidencia' | 'gasto' | null
  >(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const loaded = await loadAllOperationalData();
    setSucursales(loaded.sucursales);
    setLlamadas(loaded.llamadas);
    setActividades(loaded.actividades);
    setGastosYRefrendos(loaded.gastosYRefrendos);
    setHorarios(loaded.horarios);
    setDataSource(loaded.source);
    setSupabaseWarning(loaded.warning);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const branchSummaries = useMemo(
    () =>
      computeBranchSummaries(
        sucursales,
        llamadas,
        actividades,
        gastosYRefrendos,
        horarios,
        diaActivo
      ),
    [sucursales, llamadas, actividades, gastosYRefrendos, horarios, diaActivo]
  );

  const branchAlerts = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of branchSummaries) {
      map[s.sucursal.id] = s.excedioPresupuesto || s.llamadasFalsas > 0;
    }
    return map;
  }, [branchSummaries]);

  const handleUpdateLlamada = async (updated: LlamadaSucursal) => {
    const next = llamadas.map((l) => (l.id === updated.id ? updated : l));
    setLlamadas(next);
    const res = await saveLlamada(updated, next);
    if (!res.ok && res.error) {
      setSyncError(`Supabase (${res.error})`);
    }
  };

  const handleCreateLlamada = async (nueva: LlamadaSucursal) => {
    const next = [nueva, ...llamadas];
    setLlamadas(next);
    const res = await saveLlamada(nueva, next);
    if (!res.ok && res.error) {
      setSyncError(`Supabase (${res.error})`);
    }
  };

  const handleUpdateActividad = async (updated: ActividadDiaria) => {
    const next = actividades.map((a) => (a.id === updated.id ? updated : a));
    setActividades(next);
    const res = await saveActividad(updated, next);
    if (!res.ok && res.error) {
      setSyncError(`Supabase (${res.error})`);
    }
  };

  const handleCreateActividad = async (nueva: ActividadDiaria) => {
    const next = [nueva, ...actividades];
    setActividades(next);
    const res = await saveActividad(nueva, next);
    if (!res.ok && res.error) {
      setSyncError(`Supabase (${res.error})`);
    }
  };

  const handleCreateGastoORefrendo = async (nuevo: GastoYRefrendo) => {
    const next = [nuevo, ...gastosYRefrendos];
    setGastosYRefrendos(next);
    const res = await saveGastoORefrendo(nuevo, next);
    if (!res.ok && res.error) {
      setSyncError(`Supabase (${res.error})`);
    }
  };

  const handleUpdateHorario = async (updated: HorarioSucursalDia) => {
    const exists = horarios.some(
      (h) => h.sucursal_id === updated.sucursal_id && h.dia === updated.dia
    );
    const next = exists
      ? horarios.map((h) =>
          h.sucursal_id === updated.sucursal_id && h.dia === updated.dia
            ? updated
            : h
        )
      : [...horarios, updated];

    setHorarios(next);
    const res = await saveHorarioDia(updated, next);
    if (!res.ok && res.error) {
      setSyncError(`Supabase (${res.error})`);
    }
  };

  const handleApplyWeekdays = async (
    sucursalId: string,
    horaActividad: string,
    horaCorte: string,
    sinLimite: boolean
  ) => {
    const weekdays: DiaSemana[] = [
      'lunes',
      'martes',
      'miercoles',
      'jueves',
      'viernes',
    ];
    let next = [...horarios];
    for (const d of weekdays) {
      const target: HorarioSucursalDia = {
        id: `hor-${sucursalId}-${d}`,
        sucursal_id: sucursalId,
        dia: d,
        hora_limite_actividad: horaActividad,
        hora_limite_corte: horaCorte,
        sin_horario_limite: sinLimite,
      };
      const idx = next.findIndex(
        (h) => h.sucursal_id === sucursalId && h.dia === d
      );
      if (idx >= 0) {
        next[idx] = target;
      } else {
        next.push(target);
      }
      await saveHorarioDia(target, next);
    }
    setHorarios(next);
  };

  const handleQuickAction = (action: 'llamada' | 'evidencia' | 'gasto') => {
    if (action === 'llamada') {
      setActiveSection('llamadas');
      setQuickModal('llamada');
    } else if (action === 'evidencia') {
      setActiveSection('actividades');
      setQuickModal('evidencia');
    } else {
      setActiveSection('gastos');
      setQuickModal('gasto');
    }
  };

  const handleResetDemo = () => {
    const reset = resetDemoLocalData();
    setSucursales(reset.sucursales);
    setLlamadas(reset.llamadas);
    setActividades(reset.actividades);
    setGastosYRefrendos(reset.gastosYRefrendos);
    setHorarios(reset.horarios);
    setSyncError(null);
  };

  const activeHeader = SECTION_TITLES[activeSection];
  const selectedBranchName =
    selectedSucursalId === 'todas'
      ? 'Todas las sucursales'
      : sucursales.find((s) => s.id === selectedSucursalId)?.nombre ||
        'Sucursal';

  return (
    <div className="min-h-screen flex bg-[#F8F6FB] text-[#1F172B]">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        sucursales={sucursales}
        selectedSucursalId={selectedSucursalId}
        onSelectSucursal={setSelectedSucursalId}
        onQuickAction={handleQuickAction}
        supabaseConnected={dataSource === 'supabase' && isSupabaseConfigured()}
        onOpenSupabaseModal={() => setSupabaseModalOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        branchAlerts={branchAlerts}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (3-zone contract) */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-[#EAE3F5] px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-[#EAE3F5] text-[#55476E] hover:bg-[#FAF7FE]"
                aria-label="Abrir menú"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-[#7A6B93]">
                  <span>ControlOps</span>
                  <span aria-hidden="true">/</span>
                  <span className="font-medium text-[#DB2777] truncate">
                    {selectedBranchName}
                  </span>
                </div>
                <h1 className="font-display text-lg sm:text-xl font-bold text-[#1F172B] truncate">
                  {activeHeader.title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <select
                aria-label="Sucursal activa"
                value={selectedSucursalId}
                onChange={(e) => setSelectedSucursalId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#4C1D95] focus:outline-none focus:border-[#7C3AED]"
              >
                <option value="todas">Todas las sucursales</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={fetchData}
                title="Actualizar datos"
                className="p-2 rounded-xl border border-[#E6DDF5] bg-white hover:bg-[#FAF7FE] text-[#6D28D9] transition-colors"
                aria-label="Recargar datos"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto space-y-5">
            {syncError && (
              <div className="rounded-xl px-4 py-3 bg-[#FFF1F2] border border-[#FECDD3] text-xs text-[#BE123C] flex items-center justify-between">
                <span>
                  Error al sincronizar con {syncError}. Verifica tus políticas
                  RLS o estructura de tabla.
                </span>
                <button
                  type="button"
                  onClick={() => setSyncError(null)}
                  className="font-semibold underline ml-3"
                >
                  Cerrar
                </button>
              </div>
            )}

            {loading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-24 rounded-2xl bg-white border border-[#EAE3F5] animate-pulse"
                    />
                  ))}
                </div>
                <div className="h-72 rounded-2xl bg-white border border-[#EAE3F5] animate-pulse" />
              </div>
            ) : (
              <>
                {activeSection === 'ranking' && (
                  <RankingView
                    summaries={branchSummaries}
                    selectedSucursalId={selectedSucursalId}
                    onSelectSucursal={setSelectedSucursalId}
                    onNavigateSection={setActiveSection}
                  />
                )}

                {activeSection === 'llamadas' && (
                  <LlamadasView
                    llamadas={llamadas}
                    sucursales={sucursales}
                    selectedSucursalId={selectedSucursalId}
                    onUpdateLlamada={handleUpdateLlamada}
                    onCreateLlamada={handleCreateLlamada}
                    openCreateModalExternal={quickModal === 'llamada'}
                    onCloseCreateModalExternal={() => setQuickModal(null)}
                  />
                )}

                {activeSection === 'actividades' && (
                  <ActividadesView
                    actividades={actividades}
                    sucursales={sucursales}
                    horarios={horarios}
                    selectedSucursalId={selectedSucursalId}
                    diaActivo={diaActivo}
                    onChangeDiaActivo={setDiaActivo}
                    onUpdateActividad={handleUpdateActividad}
                    onCreateActividad={handleCreateActividad}
                    onGoToHorarios={() => setActiveSection('horarios')}
                    openCreateModalExternal={quickModal === 'evidencia'}
                    onCloseCreateModalExternal={() => setQuickModal(null)}
                  />
                )}

                {activeSection === 'gastos' && (
                  <GastosRefrendosView
                    registros={gastosYRefrendos}
                    summaries={branchSummaries}
                    sucursales={sucursales}
                    selectedSucursalId={selectedSucursalId}
                    onCreateRegistro={handleCreateGastoORefrendo}
                    openCreateModalExternal={quickModal === 'gasto'}
                    onCloseCreateModalExternal={() => setQuickModal(null)}
                  />
                )}

                {activeSection === 'horarios' && (
                  <HorariosView
                    sucursales={sucursales}
                    horarios={horarios}
                    selectedSucursalId={selectedSucursalId}
                    onUpdateHorario={handleUpdateHorario}
                    onApplyWeekdays={handleApplyWeekdays}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <SupabaseSetupModal
        open={supabaseModalOpen}
        onClose={() => setSupabaseModalOpen(false)}
        isConnected={dataSource === 'supabase' && isSupabaseConfigured()}
        warningMessage={supabaseWarning}
        onResetDemoData={handleResetDemo}
      />
    </div>
  );
}
