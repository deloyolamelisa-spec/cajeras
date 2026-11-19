import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { RankingView } from './components/RankingView';
import { LlamadasView } from './components/LlamadasView';
import { ActividadesView } from './components/ActividadesView';
import { GastosRefrendosView } from './components/GastosRefrendosView';
import { HorariosView } from './components/HorariosView';
import { AdminCatalogosView } from './components/AdminCatalogosView';
import { SupabaseSetupModal } from './components/SupabaseSetupModal';
import {
  ActividadDiaria,
  CatalogosControlOps,
  DiaSemana,
  GastoYRefrendo,
  HorarioSucursalDia,
  LlamadaSucursal,
  MetaSucursal,
  SectionId,
  Sucursal,
  UsuarioControlOps,
} from './types/controlops';
import {
  authenticateUsuario,
  deleteSucursalRecord,
  deleteUsuarioRecord,
  getSavedSessionUser,
  loadAllOperationalData,
  resetDemoLocalData,
  saveActividad,
  saveCatalogos,
  saveGastoORefrendo,
  saveHorarioDia,
  saveLlamada,
  saveMetaSucursal,
  saveSessionUser,
  saveSucursal,
  saveUsuario,
} from './services/controlOpsService';
import {
  computeBranchSummaries,
  getTodayDiaSemana,
} from './utils/calculations';
import { isSupabaseConfigured } from './lib/supabaseConfig';
import { INITIAL_CATALOGOS } from './data/mockData';

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
  admin: {
    title: 'Administración y Catálogos',
    subtitle: 'Control total de sucursales, metas, catálogos y usuarios',
  },
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<UsuarioControlOps | null>(() =>
    getSavedSessionUser()
  );
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    const saved = getSavedSessionUser();
    return saved?.rol === 'cajera' ? 'llamadas' : 'ranking';
  });
  const [selectedSucursalId, setSelectedSucursalId] = useState<string>(() => {
    const saved = getSavedSessionUser();
    return saved?.rol === 'cajera' ? saved.sucursal_id : 'todas';
  });
  const [diaActivo, setDiaActivo] = useState<DiaSemana>(getTodayDiaSemana());

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [metas, setMetas] = useState<MetaSucursal[]>([]);
  const [catalogos, setCatalogos] =
    useState<CatalogosControlOps>(INITIAL_CATALOGOS);
  const [usuarios, setUsuarios] = useState<UsuarioControlOps[]>([]);
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
    setMetas(loaded.metas);
    setCatalogos(loaded.catalogos);
    setUsuarios(loaded.usuarios);
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

  const handleLogin = async (
    correo: string,
    password: string
  ): Promise<string | null> => {
    const res = await authenticateUsuario(correo, password);
    if (!res.user) {
      return res.error || 'No se pudo iniciar sesión.';
    }
    setCurrentUser(res.user);
    saveSessionUser(res.user);
    if (res.user.rol === 'cajera') {
      setSelectedSucursalId(res.user.sucursal_id);
      setActiveSection('llamadas');
    } else {
      setSelectedSucursalId('todas');
      setActiveSection('ranking');
    }
    await fetchData();
    return null;
  };

  const handleLogout = () => {
    setCurrentUser(null);
    saveSessionUser(null);
    setSelectedSucursalId('todas');
    setActiveSection('ranking');
  };

  // Enforce strict role boundaries whenever user or section changes
  const effectiveSucursalId =
    currentUser?.rol === 'cajera'
      ? currentUser.sucursal_id
      : selectedSucursalId;

  const branchSummaries = useMemo(
    () =>
      computeBranchSummaries(
        sucursales,
        llamadas,
        actividades,
        gastosYRefrendos,
        horarios,
        diaActivo,
        metas
      ),
    [
      sucursales,
      llamadas,
      actividades,
      gastosYRefrendos,
      horarios,
      diaActivo,
      metas,
    ]
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
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleCreateLlamada = async (nueva: LlamadaSucursal) => {
    const next = [nueva, ...llamadas];
    setLlamadas(next);
    const res = await saveLlamada(nueva, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleUpdateActividad = async (updated: ActividadDiaria) => {
    const next = actividades.map((a) => (a.id === updated.id ? updated : a));
    setActividades(next);
    const res = await saveActividad(updated, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleCreateActividad = async (nueva: ActividadDiaria) => {
    const next = [nueva, ...actividades];
    setActividades(next);
    const res = await saveActividad(nueva, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleCreateGastoORefrendo = async (nuevo: GastoYRefrendo) => {
    const next = [nuevo, ...gastosYRefrendos];
    setGastosYRefrendos(next);
    const res = await saveGastoORefrendo(nuevo, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
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
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
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
    const next = [...horarios];
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
      if (idx >= 0) next[idx] = target;
      else next.push(target);
      await saveHorarioDia(target, next);
    }
    setHorarios(next);
  };

  // --- Admin Total (Creador) Handlers ---
  const handleSaveSucursal = async (suc: Sucursal) => {
    const exists = sucursales.some((s) => s.id === suc.id);
    const next = exists
      ? sucursales.map((s) => (s.id === suc.id ? suc : s))
      : [...sucursales, suc];
    setSucursales(next);
    const res = await saveSucursal(suc, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleDeleteSucursal = async (id: string) => {
    const next = sucursales.filter((s) => s.id !== id);
    setSucursales(next);
    const res = await deleteSucursalRecord(id, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleSaveMeta = async (meta: MetaSucursal) => {
    const exists = metas.some((m) => m.sucursal_id === meta.sucursal_id);
    const next = exists
      ? metas.map((m) => (m.sucursal_id === meta.sucursal_id ? meta : m))
      : [...metas, meta];
    setMetas(next);
    const res = await saveMetaSucursal(meta, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleSaveCatalogos = async (nextCatalogos: CatalogosControlOps) => {
    setCatalogos(nextCatalogos);
    const res = await saveCatalogos(nextCatalogos);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleSaveUsuario = async (usr: UsuarioControlOps) => {
    const exists = usuarios.some((u) => u.id === usr.id);
    const next = exists
      ? usuarios.map((u) => (u.id === usr.id ? usr : u))
      : [...usuarios, usr];
    setUsuarios(next);
    const res = await saveUsuario(usr, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleDeleteUsuario = async (id: string) => {
    const next = usuarios.filter((u) => u.id !== id);
    setUsuarios(next);
    const res = await deleteUsuarioRecord(id, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
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
    setMetas(reset.metas);
    setCatalogos(reset.catalogos);
    setUsuarios(reset.usuarios);
    setLlamadas(reset.llamadas);
    setActividades(reset.actividades);
    setGastosYRefrendos(reset.gastosYRefrendos);
    setHorarios(reset.horarios);
    setSyncError(null);
  };

  if (!currentUser) {
    return (
      <>
        <LoginScreen
          onLogin={handleLogin}
          onOpenSupabaseModal={() => setSupabaseModalOpen(true)}
        />
        <SupabaseSetupModal
          open={supabaseModalOpen}
          onClose={() => setSupabaseModalOpen(false)}
          isConnected={
            dataSource === 'supabase' && isSupabaseConfigured()
          }
          warningMessage={supabaseWarning}
          onResetDemoData={handleResetDemo}
        />
      </>
    );
  }

  // Guard protected routes
  const safeSection: SectionId =
    activeSection === 'admin' && currentUser.rol !== 'creador'
      ? 'ranking'
      : activeSection === 'ranking' && currentUser.rol === 'cajera'
        ? 'llamadas'
        : activeSection;

  const activeHeader = SECTION_TITLES[safeSection];
  const selectedBranchName =
    effectiveSucursalId === 'todas'
      ? 'Todas las sucursales'
      : sucursales.find((s) => s.id === effectiveSucursalId)?.nombre ||
        'Sucursal';

  return (
    <div className="min-h-screen flex bg-[#F8F6FB] text-[#1F172B]">
      <Sidebar
        activeSection={safeSection}
        onSelectSection={setActiveSection}
        sucursales={sucursales}
        selectedSucursalId={effectiveSucursalId}
        onSelectSucursal={(id) => {
          if (currentUser.rol !== 'cajera') {
            setSelectedSucursalId(id);
          }
        }}
        onQuickAction={handleQuickAction}
        supabaseConnected={dataSource === 'supabase' && isSupabaseConfigured()}
        onOpenSupabaseModal={() => setSupabaseModalOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        branchAlerts={branchAlerts}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
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
              {currentUser.rol !== 'cajera' ? (
                <select
                  aria-label="Sucursal activa"
                  value={effectiveSucursalId}
                  onChange={(e) => setSelectedSucursalId(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#4C1D95] focus:outline-none focus:border-[#7C3AED]"
                >
                  <option value="todas">Todas las sucursales</option>
                  {sucursales
                    .filter((s) => s.activa)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                </select>
              ) : (
                <span className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#5B21B6]">
                  {selectedBranchName}
                </span>
              )}

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
                  Error al sincronizar con {syncError}. Verifica que las tablas
                  estén creadas en Supabase sin bloqueo RLS.
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
                {safeSection === 'ranking' &&
                  currentUser.rol !== 'cajera' && (
                    <RankingView
                      summaries={branchSummaries}
                      selectedSucursalId={effectiveSucursalId}
                      onSelectSucursal={setSelectedSucursalId}
                      onNavigateSection={setActiveSection}
                    />
                  )}

                {safeSection === 'llamadas' && (
                  <LlamadasView
                    llamadas={llamadas}
                    sucursales={sucursales}
                    selectedSucursalId={effectiveSucursalId}
                    userRole={currentUser.rol}
                    opcionesReporte={catalogos.opciones_llamada}
                    onUpdateLlamada={handleUpdateLlamada}
                    onCreateLlamada={handleCreateLlamada}
                    openCreateModalExternal={quickModal === 'llamada'}
                    onCloseCreateModalExternal={() => setQuickModal(null)}
                  />
                )}

                {safeSection === 'actividades' && (
                  <ActividadesView
                    actividades={actividades}
                    sucursales={sucursales}
                    horarios={horarios}
                    selectedSucursalId={effectiveSucursalId}
                    diaActivo={diaActivo}
                    userRole={currentUser.rol}
                    tareasCatalogo={catalogos.tareas_obligatorias}
                    onChangeDiaActivo={setDiaActivo}
                    onUpdateActividad={handleUpdateActividad}
                    onCreateActividad={handleCreateActividad}
                    onGoToHorarios={() => setActiveSection('horarios')}
                    openCreateModalExternal={quickModal === 'evidencia'}
                    onCloseCreateModalExternal={() => setQuickModal(null)}
                  />
                )}

                {safeSection === 'gastos' && (
                  <GastosRefrendosView
                    registros={gastosYRefrendos}
                    summaries={branchSummaries}
                    sucursales={sucursales}
                    selectedSucursalId={effectiveSucursalId}
                    userRole={currentUser.rol}
                    onCreateRegistro={handleCreateGastoORefrendo}
                    openCreateModalExternal={quickModal === 'gasto'}
                    onCloseCreateModalExternal={() => setQuickModal(null)}
                  />
                )}

                {safeSection === 'horarios' && (
                  <HorariosView
                    sucursales={sucursales}
                    horarios={horarios}
                    selectedSucursalId={effectiveSucursalId}
                    canEdit={currentUser.rol === 'creador'}
                    onUpdateHorario={handleUpdateHorario}
                    onApplyWeekdays={handleApplyWeekdays}
                  />
                )}

                {safeSection === 'admin' && currentUser.rol === 'creador' && (
                  <AdminCatalogosView
                    sucursales={sucursales}
                    metas={metas}
                    catalogos={catalogos}
                    usuarios={usuarios}
                    currentUserId={currentUser.id}
                    onSaveSucursal={handleSaveSucursal}
                    onDeleteSucursal={handleDeleteSucursal}
                    onSaveMeta={handleSaveMeta}
                    onSaveCatalogos={handleSaveCatalogos}
                    onSaveUsuario={handleSaveUsuario}
                    onDeleteUsuario={handleDeleteUsuario}
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
