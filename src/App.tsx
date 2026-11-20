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
import { CajeraMiDiaView } from './components/CajeraMiDiaView';
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
  TareaCatalogo,
  UsuarioControlOps,
} from './types/controlops';
import {
  ServiceResult,
  authenticateUsuario,
  createSucursal,
  createUsuario,
  deleteActividadRecord,
  deleteActividadesByCatalogTaskId,
  deleteEvidenciaFoto,
  deleteGastoORefrendoRecord,
  deleteLlamadaRecord,
  deleteSucursalRecord,
  deleteUsuarioRecord,
  getSavedSessionUser,
  loadAllOperationalData,
  resetDemoLocalData,
  saveActividad,
  saveActividadesBatch,
  saveCatalogos,
  saveGastoORefrendo,
  saveHorarioDia,
  saveHorariosBatch,
  saveLlamada,
  saveLlamadasBatch,
  saveMetaSucursal,
  saveSessionUser,
  saveSucursal,
  saveSucursalesBatch,
  updateUsuario,
} from './services/controlOpsService';
import {
  computeBranchSummaries,
  ensureBaseDailyCatalogTasks,
  getTodayDiaSemana,
  getTodayLocalYYYYMMDD,
  isFixedBaseTask,
} from './utils/calculations';
import { isSupabaseConfigured } from './lib/supabaseConfig';
import { INITIAL_CATALOGOS } from './data/mockData';

const SECTION_TITLES: Record<SectionId, { title: string; subtitle: string }> = {
  mi_dia: {
    title: 'Mi día',
    subtitle: 'Resumen de avance mensual, tareas de hoy y desglose diario',
  },
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
  refrendos: {
    title: 'Refrendos',
    subtitle: 'Seguimiento de renovaciones y meta mensual de la sucursal',
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
    return saved?.rol === 'cajera' ? 'mi_dia' : 'ranking';
  });
  const [selectedSucursalId, setSelectedSucursalId] = useState<string>(() => {
    const saved = getSavedSessionUser();
    return saved?.rol === 'cajera' ? saved.sucursal_id : 'todas';
  });
  const [todayKey, setTodayKey] = useState<string>(() =>
    getTodayLocalYYYYMMDD()
  );
  const [diaActivo, setDiaActivo] = useState<DiaSemana>(() =>
    getTodayDiaSemana()
  );

  useEffect(() => {
    const checkDateRollover = () => {
      const latest = getTodayLocalYYYYMMDD();
      setTodayKey((prev) => {
        if (prev !== latest) {
          setDiaActivo(getTodayDiaSemana());
          return latest;
        }
        return prev;
      });
    };
    const interval = window.setInterval(checkDateRollover, 30000);
    window.addEventListener('focus', checkDateRollover);
    document.addEventListener('visibilitychange', checkDateRollover);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', checkDateRollover);
      document.removeEventListener('visibilitychange', checkDateRollover);
    };
  }, []);

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
  const [remoteCounts, setRemoteCounts] = useState<Record<string, number>>({});
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
    setRemoteCounts(loaded.remoteCounts || {});
    setSupabaseWarning(loaded.warning);
    if (loaded.warning) {
      setSyncError(loaded.warning);
    }
    const savedUser = getSavedSessionUser();
    if (savedUser && loaded.source === 'supabase' && loaded.usuarios.length > 0) {
      const freshUser = loaded.usuarios.find((u) => u.id === savedUser.id);
      if (freshUser) {
        if (!freshUser.activo) {
          setCurrentUser(null);
          saveSessionUser(null);
        } else {
          setCurrentUser(freshUser);
          saveSessionUser(freshUser);
          if (freshUser.rol === 'cajera') {
            setSelectedSucursalId(freshUser.sucursal_id);
          }
        }
      }
    }
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
      setActiveSection('mi_dia');
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

  const resolvedCajeraSucursal = useMemo(() => {
    if (currentUser?.rol !== 'cajera') return undefined;
    const target = (currentUser.sucursal_id || '').trim().toLowerCase();
    return (
      sucursales.find((s) => s.id.toLowerCase() === target) ||
      sucursales.find((s) => s.nombre.trim().toLowerCase() === target) ||
      sucursales.find((s) => s.codigo.trim().toLowerCase() === target) ||
      sucursales[0]
    );
  }, [currentUser, sucursales]);

  // Enforce strict role boundaries whenever user or section changes
  const effectiveSucursalId =
    currentUser?.rol === 'cajera'
      ? resolvedCajeraSucursal?.id || currentUser.sucursal_id
      : selectedSucursalId;

  const resolveSucursalForRecord = useCallback(
    (sucId?: string, sucName?: string): Sucursal | undefined => {
      if (currentUser?.rol === 'cajera' && resolvedCajeraSucursal) {
        return resolvedCajeraSucursal;
      }
      const idNorm = (sucId || '').trim().toLowerCase();
      const nameNorm = (sucName || '').trim().toLowerCase();
      return (
        sucursales.find((s) => s.id.toLowerCase() === idNorm) ||
        sucursales.find((s) => s.nombre.trim().toLowerCase() === nameNorm) ||
        sucursales.find((s) => s.nombre.trim().toLowerCase() === idNorm) ||
        sucursales[0]
      );
    },
    [currentUser, resolvedCajeraSucursal, sucursales]
  );

  const enrichActividadWithAuth = useCallback(
    (act: ActividadDiaria): ActividadDiaria => {
      const suc = resolveSucursalForRecord(
        act.sucursal_id,
        act.sucursal || act.sucursal_nombre
      );
      const safeSucNombre =
        (
          suc?.nombre ||
          act.sucursal ||
          act.sucursal_nombre ||
          act.sucursal_id ||
          'Sucursal'
        ).trim() || 'Sucursal';
      const isCaj = currentUser?.rol === 'cajera';
      return {
        ...act,
        sucursal_id: suc?.id || act.sucursal_id || safeSucNombre,
        sucursal_nombre: safeSucNombre,
        sucursal: safeSucNombre,
        cajera_id: isCaj
          ? currentUser.id
          : act.cajera_id || currentUser?.id || '',
        cajera_nombre: isCaj
          ? currentUser.nombre
          : act.cajera_nombre ||
            act.responsable ||
            currentUser?.nombre ||
            suc?.responsable_caja ||
            '',
        responsable: isCaj
          ? currentUser.nombre
          : act.responsable ||
            act.cajera_nombre ||
            currentUser?.nombre ||
            suc?.responsable_caja ||
            '',
      };
    },
    [currentUser, resolveSucursalForRecord]
  );

  const enrichLlamadaWithAuth = useCallback(
    (ll: LlamadaSucursal): LlamadaSucursal => {
      const suc = resolveSucursalForRecord(
        ll.sucursal_id,
        ll.sucursal || ll.sucursal_nombre
      );
      const safeSucNombre =
        (
          suc?.nombre ||
          ll.sucursal ||
          ll.sucursal_nombre ||
          ll.sucursal_id ||
          'Sucursal'
        ).trim() || 'Sucursal';
      const isCaj = currentUser?.rol === 'cajera';
      return {
        ...ll,
        sucursal_id: suc?.id || ll.sucursal_id || safeSucNombre,
        sucursal_nombre: safeSucNombre,
        sucursal: safeSucNombre,
        cajera_id: isCaj
          ? currentUser.id
          : ll.cajera_id || currentUser?.id || '',
        cajera_nombre: isCaj
          ? currentUser.nombre
          : ll.cajera_nombre ||
            currentUser?.nombre ||
            suc?.responsable_caja ||
            '',
      };
    },
    [currentUser, resolveSucursalForRecord]
  );

  const enrichGastoWithAuth = useCallback(
    (reg: GastoYRefrendo): GastoYRefrendo => {
      const suc = resolveSucursalForRecord(
        reg.sucursal_id,
        reg.sucursal || reg.sucursal_nombre
      );
      const safeSucNombre =
        (
          suc?.nombre ||
          reg.sucursal ||
          reg.sucursal_nombre ||
          reg.sucursal_id ||
          'Sucursal'
        ).trim() || 'Sucursal';
      const isCaj = currentUser?.rol === 'cajera';
      return {
        ...reg,
        sucursal_id: suc?.id || reg.sucursal_id || safeSucNombre,
        sucursal_nombre: safeSucNombre,
        sucursal: safeSucNombre,
        cajera_id: isCaj
          ? currentUser.id
          : reg.cajera_id || currentUser?.id || '',
        cajera_nombre: isCaj
          ? currentUser.nombre
          : reg.cajera_nombre ||
            reg.responsable ||
            currentUser?.nombre ||
            suc?.responsable_caja ||
            '',
        responsable: isCaj
          ? currentUser.nombre
          : reg.responsable ||
            reg.cajera_nombre ||
            currentUser?.nombre ||
            suc?.responsable_caja ||
            '',
      };
    },
    [currentUser, resolveSucursalForRecord]
  );

  const guaranteedTareasCatalogo = useMemo(
    () => ensureBaseDailyCatalogTasks(catalogos.tareas_obligatorias),
    [catalogos.tareas_obligatorias]
  );

  const guaranteedCatalogos = useMemo<CatalogosControlOps>(
    () => ({
      ...catalogos,
      tareas_obligatorias: guaranteedTareasCatalogo,
    }),
    [catalogos, guaranteedTareasCatalogo]
  );

  const branchSummaries = useMemo(
    () =>
      computeBranchSummaries(
        sucursales,
        llamadas,
        actividades,
        gastosYRefrendos,
        horarios,
        diaActivo,
        metas,
        guaranteedTareasCatalogo
      ),
    [
      sucursales,
      llamadas,
      actividades,
      gastosYRefrendos,
      horarios,
      diaActivo,
      todayKey,
      metas,
      guaranteedTareasCatalogo,
    ]
  );

  const branchAlerts = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of branchSummaries) {
      map[s.sucursal.id] = s.excedioPresupuesto || s.llamadasFalsas > 0;
    }
    return map;
  }, [branchSummaries]);

  const handleUpdateLlamada = async (
    updated: LlamadaSucursal
  ): Promise<ServiceResult> => {
    const enriched = enrichLlamadaWithAuth(updated);
    const next = llamadas.map((l) => (l.id === enriched.id ? enriched : l));
    setLlamadas(next);
    const res = await saveLlamada(enriched, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
    return res;
  };

  const handleCreateLlamada = async (nueva: LlamadaSucursal) => {
    const enriched = enrichLlamadaWithAuth(nueva);
    const next = [enriched, ...llamadas];
    setLlamadas(next);
    const res = await saveLlamada(enriched, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleImportLlamadas = async (
    nuevas: LlamadaSucursal[]
  ): Promise<ServiceResult> => {
    if (nuevas.length === 0) return { ok: true, insertedCount: 0 };
    const enrichedList = nuevas.map(enrichLlamadaWithAuth);
    const provisional = [...enrichedList, ...llamadas];
    const res = await saveLlamadasBatch(enrichedList, provisional);
    if (!res.ok) {
      if (res.error) setSyncError(`Supabase (${res.error})`);
      return res;
    }
    const savedRows = Array.isArray(res.data) ? res.data : enrichedList;
    setLlamadas((prev) => [...savedRows, ...prev]);
    return res;
  };

  const handleDeleteLlamada = async (id: string) => {
    const next = llamadas.filter((l) => l.id !== id);
    setLlamadas(next);
    const res = await deleteLlamadaRecord(id, next);
    if (!res.ok && res.error) setSyncError(`Supabase (${res.error})`);
  };

  const handleUpdateActividad = async (
    updated: ActividadDiaria
  ): Promise<ServiceResult> => {
    const enriched = enrichActividadWithAuth(updated);
    const exists = actividades.some((a) => a.id === enriched.id);
    const provisional = exists
      ? actividades.map((a) => (a.id === enriched.id ? enriched : a))
      : [enriched, ...actividades];
    const res = await saveActividad(enriched, provisional);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    const saved = (res.data as ActividadDiaria | undefined) ?? enriched;
    const synced = exists
      ? actividades.map((a) => (a.id === enriched.id ? saved : a))
      : [saved, ...actividades];
    setActividades(synced);
    setSyncError(null);
    return res;
  };

  const handleCreateActividad = async (
    nueva: ActividadDiaria
  ): Promise<ServiceResult> => {
    const enriched = enrichActividadWithAuth(nueva);
    const provisional = [enriched, ...actividades];
    const res = await saveActividad(enriched, provisional);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    const saved = (res.data as ActividadDiaria | undefined) ?? enriched;
    setActividades((prev) => [saved, ...prev]);
    setSyncError(null);
    return res;
  };

  const handleCreateActividadesBatch = async (
    nuevas: ActividadDiaria[]
  ): Promise<ServiceResult> => {
    if (nuevas.length === 0) return { ok: true };
    const enrichedList = nuevas.map(enrichActividadWithAuth);
    const provisional = [...enrichedList, ...actividades];
    const res = await saveActividadesBatch(enrichedList, provisional);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    const savedRows = Array.isArray(res.data)
      ? (res.data as ActividadDiaria[])
      : enrichedList;
    setActividades((prev) => [...savedRows, ...prev]);
    setSyncError(null);
    return res;
  };

  const handleDeleteActividad = async (
    actividad: ActividadDiaria
  ): Promise<ServiceResult> => {
    const next = actividades.filter((a) => a.id !== actividad.id);
    const res = await deleteActividadRecord(actividad, next);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    setActividades(next);
    return res;
  };

  const handleDeleteEvidenciaActividad = async (actividad: ActividadDiaria) => {
    if (actividad.evidencia_url) {
      const storageRes = await deleteEvidenciaFoto(actividad.evidencia_url);
      if (!storageRes.ok && storageRes.error) {
        setSyncError(`Storage (${storageRes.error})`);
      }
    }
    const updated: ActividadDiaria = {
      ...actividad,
      evidencia_url: null,
    };
    await handleUpdateActividad(updated);
  };

  const handleResetActividadPendiente = async (actividad: ActividadDiaria) => {
    if (actividad.evidencia_url) {
      const storageRes = await deleteEvidenciaFoto(actividad.evidencia_url);
      if (!storageRes.ok && storageRes.error) {
        setSyncError(`Storage (${storageRes.error})`);
      }
    }
    const updated: ActividadDiaria = {
      ...actividad,
      estatus: 'Pendiente',
      hora_completada: null,
      evidencia_url: null,
    };
    await handleUpdateActividad(updated);
  };

  const handleCreateGastoORefrendo = async (
    nuevo: GastoYRefrendo
  ): Promise<ServiceResult> => {
    const enriched = enrichGastoWithAuth(nuevo);
    const provisional = [enriched, ...gastosYRefrendos];
    const res = await saveGastoORefrendo(enriched, provisional);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    const saved = (res.data as GastoYRefrendo | undefined) ?? enriched;
    setGastosYRefrendos((prev) => [saved, ...prev]);
    setSyncError(null);
    return res;
  };

  const handleUpdateGastoORefrendo = async (
    updated: GastoYRefrendo
  ): Promise<ServiceResult> => {
    const enriched = enrichGastoWithAuth(updated);
    const exists = gastosYRefrendos.some((r) => r.id === enriched.id);
    const provisional = exists
      ? gastosYRefrendos.map((r) => (r.id === enriched.id ? enriched : r))
      : [enriched, ...gastosYRefrendos];
    const res = await saveGastoORefrendo(enriched, provisional);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    const saved = (res.data as GastoYRefrendo | undefined) ?? enriched;
    setGastosYRefrendos((prev) =>
      exists
        ? prev.map((r) => (r.id === enriched.id ? saved : r))
        : [saved, ...prev]
    );
    setSyncError(null);
    return res;
  };

  const handleDeleteGastoORefrendo = async (registro: GastoYRefrendo) => {
    const next = gastosYRefrendos.filter((r) => r.id !== registro.id);
    const res = await deleteGastoORefrendoRecord(registro, next);
    if (!res.ok && res.error) {
      setSyncError(res.error);
      return;
    }
    setGastosYRefrendos(next);
  };

  const handleDeleteEvidenciaRegistro = async (registro: GastoYRefrendo) => {
    if (registro.evidencia_url) {
      const storageRes = await deleteEvidenciaFoto(registro.evidencia_url);
      if (!storageRes.ok && storageRes.error) {
        setSyncError(`Storage (${storageRes.error})`);
      }
    }
    const updated: GastoYRefrendo = {
      ...registro,
      evidencia_url: null,
    };
    const next = gastosYRefrendos.map((r) =>
      r.id === updated.id ? updated : r
    );
    const res = await saveGastoORefrendo(updated, next);
    if (!res.ok && res.error) {
      setSyncError(res.error);
      return;
    }
    setGastosYRefrendos(next);
  };

  const handleUpdateHorario = async (
    updated: HorarioSucursalDia
  ): Promise<ServiceResult> => {
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

    const res = await saveHorarioDia(updated, next);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    setHorarios(next);
    return res;
  };

  const handleApplyWeekdays = async (
    sucursalId: string,
    horaActividad: string,
    horaCorte: string,
    sinLimite: boolean
  ): Promise<ServiceResult> => {
    const weekdays: DiaSemana[] = [
      'lunes',
      'martes',
      'miercoles',
      'jueves',
      'viernes',
    ];
    const next = [...horarios];
    const targets: HorarioSucursalDia[] = [];
    for (const d of weekdays) {
      const target: HorarioSucursalDia = {
        id: `hor-${sucursalId}-${d}`,
        sucursal_id: sucursalId,
        dia: d,
        hora_limite_actividad: horaActividad,
        hora_limite_corte: horaCorte,
        sin_horario_limite: sinLimite,
      };
      targets.push(target);
      const idx = next.findIndex(
        (h) => h.sucursal_id === sucursalId && h.dia === d
      );
      if (idx >= 0) next[idx] = target;
      else next.push(target);
    }
    const res = await saveHorariosBatch(targets, next);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    setHorarios(next);
    return res;
  };

  // --- Admin Total (Creador) Handlers ---
  const handleSaveSucursal = async (
    suc: Sucursal,
    isNew = false
  ): Promise<ServiceResult> => {
    const exists = sucursales.some((s) => s.id === suc.id);
    const next = exists
      ? sucursales.map((s) => (s.id === suc.id ? suc : s))
      : [...sucursales, suc];
    const res =
      isNew || !exists
        ? await createSucursal(suc, next)
        : await saveSucursal(suc, next);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    const savedSuc = (res.data as Sucursal) || suc;
    const syncedNext = exists
      ? sucursales.map((s) => (s.id === savedSuc.id ? savedSuc : s))
      : [...sucursales, savedSuc];
    setSucursales(syncedNext);
    setRemoteCounts((prev) => ({
      ...prev,
      sucursales_config: Math.max(prev.sucursales_config || 0, isNew ? (prev.sucursales_config || 0) + 1 : 1),
    }));
    return res;
  };

  const handleSyncBaseSucursales = async (): Promise<ServiceResult> => {
    const res = await saveSucursalesBatch(sucursales);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    setRemoteCounts((prev) => ({
      ...prev,
      sucursales_config: sucursales.length,
    }));
    return res;
  };

  const handleDeleteSucursal = async (id: string): Promise<ServiceResult> => {
    const next = sucursales.filter((s) => s.id !== id);
    const res = await deleteSucursalRecord(id, next);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    setSucursales(next);
    return res;
  };

  const handleSaveMeta = async (
    meta: MetaSucursal
  ): Promise<ServiceResult> => {
    const exists = metas.some((m) => m.sucursal_id === meta.sucursal_id);
    const next = exists
      ? metas.map((m) => (m.sucursal_id === meta.sucursal_id ? meta : m))
      : [...metas, meta];
    const res = await saveMetaSucursal(meta, next);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    setMetas(next);
    return res;
  };

  const handleSaveCatalogos = async (
    nextCatalogos: CatalogosControlOps
  ): Promise<ServiceResult> => {
    const res = await saveCatalogos(nextCatalogos);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    setCatalogos(nextCatalogos);
    return res;
  };

  const handleSaveCatalogTask = async (
    tarea: TareaCatalogo,
    isNew = false
  ): Promise<ServiceResult> => {
    const baseList = ensureBaseDailyCatalogTasks(catalogos.tareas_obligatorias);
    const exists = baseList.some((t) => t.id === tarea.id);
    const nextTasks =
      isNew || !exists
        ? [...baseList, tarea]
        : baseList.map((t) => (t.id === tarea.id ? tarea : t));
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      id: catalogos.id || 'cat-global',
      tareas_obligatorias: ensureBaseDailyCatalogTasks(nextTasks),
    };
    return handleSaveCatalogos(nextCatalogos);
  };

  const handleDeleteCatalogTask = async (
    taskId: string
  ): Promise<ServiceResult> => {
    const deletedTask = guaranteedTareasCatalogo.find(
      (t) => t.id === taskId
    );
    if (deletedTask && isFixedBaseTask(deletedTask)) {
      return {
        ok: false,
        error:
          'Las 9 actividades base diarias son fijas para las cajeras y no se pueden eliminar del catálogo.',
      };
    }
    const nextCatalogos: CatalogosControlOps = {
      ...catalogos,
      id: catalogos.id || 'cat-global',
      tareas_obligatorias: catalogos.tareas_obligatorias.filter(
        (t) => t.id !== taskId
      ),
    };
    const res = await handleSaveCatalogos(nextCatalogos);
    if (!res.ok) return res;

    const cleanupRes = await deleteActividadesByCatalogTaskId(
      taskId,
      actividades,
      deletedTask?.titulo
    );
    if (!cleanupRes.ok) {
      if (cleanupRes.error) setSyncError(cleanupRes.error);
      return cleanupRes;
    }
    const prefix = `act-cat-${taskId}__`;
    const normalizedTitle = deletedTask?.titulo.trim().toLowerCase();
    setActividades((prev) =>
      prev.filter((a) => {
        if (a.id.startsWith(prefix)) return false;
        if (
          normalizedTitle &&
          !a.id.startsWith('act-cat-') &&
          a.titulo.trim().toLowerCase() === normalizedTitle
        ) {
          return false;
        }
        return true;
      })
    );
    return { ok: true };
  };

  const handleSaveUsuario = async (
    usr: UsuarioControlOps,
    isNew = false
  ): Promise<ServiceResult> => {
    const exists = usuarios.some((u) => u.id === usr.id);
    const next = exists
      ? usuarios.map((u) => (u.id === usr.id ? usr : u))
      : [...usuarios, usr];

    const res =
      isNew || !exists
        ? await createUsuario(usr, next)
        : await updateUsuario(usr, next);

    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }

    const saved = res.data || usr;
    const syncedNext = exists
      ? usuarios.map((u) => (u.id === saved.id ? saved : u))
      : [...usuarios, saved];
    setUsuarios(syncedNext);

    if (currentUser && saved.id === currentUser.id) {
      setCurrentUser(saved);
      saveSessionUser(saved);
    }
    return res;
  };

  const handleDeleteUsuario = async (id: string): Promise<ServiceResult> => {
    const next = usuarios.filter((u) => u.id !== id);
    const res = await deleteUsuarioRecord(id, next);
    if (!res.ok) {
      if (res.error) setSyncError(res.error);
      return res;
    }
    setUsuarios(next);
    return res;
  };

  const handleQuickAction = (action: 'llamada' | 'evidencia' | 'gasto') => {
    if (currentUser?.rol !== 'cajera') return;
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
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Guard protected routes
  const isCajera = currentUser.rol === 'cajera';
  const cajeraAllowedSections: SectionId[] = [
    'mi_dia',
    'llamadas',
    'refrendos',
    'gastos',
  ];

  const safeSection: SectionId = isCajera
    ? cajeraAllowedSections.includes(activeSection)
      ? activeSection
      : 'mi_dia'
    : activeSection === 'admin' && currentUser.rol !== 'creador'
      ? 'ranking'
      : activeSection === 'mi_dia' || activeSection === 'refrendos'
        ? 'ranking'
        : activeSection;

  const activeHeader = SECTION_TITLES[safeSection];
  const currentCajeraSucursal =
    resolvedCajeraSucursal ||
    sucursales.find((s) => s.id === effectiveSucursalId) ||
    sucursales[0];
  const currentCajeraMeta = metas.find(
    (m) => m.sucursal_id === currentCajeraSucursal?.id
  );
  const selectedBranchName =
    effectiveSucursalId === 'todas'
      ? 'Todas las sucursales'
      : currentCajeraSucursal?.nombre || 'Sucursal';

  return (
    <div
      className={`min-h-screen flex text-[#1F172B] ${
        isCajera ? 'bg-[#FAF7FF]' : 'bg-[#F8F6FB]'
      }`}
    >
      <Sidebar
        activeSection={safeSection}
        onSelectSection={setActiveSection}
        sucursales={sucursales}
        selectedSucursalId={effectiveSucursalId}
        onSelectSucursal={(id) => {
          if (!isCajera) {
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
        {/* Top Bar (compact on Cajera Mi día, full on other views) */}
        {isCajera && safeSection === 'mi_dia' ? (
          <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-[#EAE3F5] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 rounded-xl border border-[#EAE3F5] text-[#55476E] hover:bg-[#FAF7FF]"
                aria-label="Abrir menú"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <span className="font-display text-sm font-bold text-[#1F172B]">
                  ControlOps
                </span>
                <span className="ml-2 text-[10px] font-extrabold tracking-wider text-[#7C3AED] uppercase">
                  CAJERAS
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchData}
              title="Actualizar datos"
              className="p-2 rounded-xl border border-[#E6DDF5] bg-white hover:bg-[#FAF7FF] text-[#7C3AED] transition-colors"
              aria-label="Recargar datos"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          </header>
        ) : (
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
                    {safeSection === 'llamadas' && currentUser.rol !== 'creador'
                      ? 'Módulo de Llamadas'
                      : activeHeader.title}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {!isCajera ? (
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
                  <span className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF7FF] text-xs font-semibold text-[#6D28D9]">
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
        )}

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto space-y-5">
            {syncError && (
              <div
                role="alert"
                className="rounded-xl px-4 py-3 bg-[#FFF1F2] border border-[#FECDD3] text-xs text-[#BE123C] flex items-center justify-between gap-3"
              >
                <div>
                  <span className="font-bold">Error de Supabase: </span>
                  <span>{syncError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncError(null)}
                  className="font-semibold underline shrink-0"
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
                {safeSection === 'mi_dia' &&
                  isCajera &&
                  currentCajeraSucursal && (
                    <CajeraMiDiaView
                      currentUser={currentUser}
                      sucursal={currentCajeraSucursal}
                      metaSucursal={currentCajeraMeta}
                      actividades={actividades}
                      tareasCatalogo={guaranteedTareasCatalogo}
                      llamadas={llamadas}
                      gastosYRefrendos={gastosYRefrendos}
                      horarios={horarios}
                      diaActivo={diaActivo}
                      onUpdateActividad={handleUpdateActividad}
                    />
                  )}

                {safeSection === 'ranking' &&
                  currentUser.rol !== 'cajera' && (
                    <RankingView
                      summaries={branchSummaries}
                      selectedSucursalId={effectiveSucursalId}
                      onSelectSucursal={setSelectedSucursalId}
                      onNavigateSection={setActiveSection}
                      userRole={currentUser.rol}
                      sucursales={sucursales}
                      llamadas={llamadas}
                      actividades={actividades}
                      gastosYRefrendos={gastosYRefrendos}
                      horarios={horarios}
                      diaActivo={diaActivo}
                      metas={metas}
                      tareasCatalogo={guaranteedTareasCatalogo}
                      usuarios={usuarios}
                      onUpdateActividad={handleUpdateActividad}
                      onSaveMeta={handleSaveMeta}
                      onSaveSucursal={handleSaveSucursal}
                      onCreateGastoORefrendo={handleCreateGastoORefrendo}
                      onUpdateGastoORefrendo={handleUpdateGastoORefrendo}
                      onDeleteGastoORefrendo={handleDeleteGastoORefrendo}
                    />
                  )}

                {safeSection === 'llamadas' && (
                  <LlamadasView
                    llamadas={llamadas}
                    sucursales={sucursales}
                    selectedSucursalId={effectiveSucursalId}
                    userRole={currentUser.rol}
                    currentUserId={currentUser.id}
                    currentUserName={currentUser.nombre}
                    opcionesReporte={catalogos.opciones_llamada}
                    onUpdateLlamada={handleUpdateLlamada}
                    onCreateLlamada={handleCreateLlamada}
                    onImportLlamadas={handleImportLlamadas}
                    onDeleteLlamada={handleDeleteLlamada}
                    onSelectSucursal={
                      currentUser.rol !== 'cajera'
                        ? setSelectedSucursalId
                        : undefined
                    }
                    openCreateModalExternal={quickModal === 'llamada'}
                    onCloseCreateModalExternal={() => setQuickModal(null)}
                  />
                )}

                {safeSection === 'actividades' && !isCajera && (
                  <ActividadesView
                    actividades={actividades}
                    sucursales={sucursales}
                    horarios={horarios}
                    selectedSucursalId={effectiveSucursalId}
                    diaActivo={diaActivo}
                    userRole={currentUser.rol}
                    tareasCatalogo={guaranteedTareasCatalogo}
                    onChangeDiaActivo={setDiaActivo}
                    onSelectSucursal={setSelectedSucursalId}
                    onUpdateActividad={handleUpdateActividad}
                    onCreateActividad={handleCreateActividad}
                    onCreateActividadesBatch={handleCreateActividadesBatch}
                    onDeleteActividad={handleDeleteActividad}
                    onSaveCatalogTask={handleSaveCatalogTask}
                    onDeleteCatalogTask={handleDeleteCatalogTask}
                    onDeleteEvidenciaActividad={handleDeleteEvidenciaActividad}
                    onResetActividadPendiente={handleResetActividadPendiente}
                    onGoToHorarios={() => setActiveSection('horarios')}
                    openCreateModalExternal={quickModal === 'evidencia'}
                    onCloseCreateModalExternal={() => setQuickModal(null)}
                  />
                )}

                {(safeSection === 'gastos' || safeSection === 'refrendos') && (
                  <GastosRefrendosView
                    key={`gr-${safeSection}-${currentUser.rol}`}
                    registros={gastosYRefrendos}
                    summaries={branchSummaries}
                    sucursales={sucursales}
                    selectedSucursalId={effectiveSucursalId}
                    userRole={currentUser.rol}
                    currentUserId={currentUser.id}
                    currentUserName={currentUser.nombre}
                    fixedTab={
                      safeSection === 'refrendos'
                        ? 'refrendos'
                        : isCajera
                          ? 'gastos'
                          : undefined
                    }
                    onCreateRegistro={handleCreateGastoORefrendo}
                    onUpdateRegistro={handleUpdateGastoORefrendo}
                    onDeleteRegistro={handleDeleteGastoORefrendo}
                    onDeleteEvidenciaRegistro={handleDeleteEvidenciaRegistro}
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
                    tareasCatalogo={guaranteedTareasCatalogo}
                    usuarios={usuarios}
                    onSaveCatalogTask={handleSaveCatalogTask}
                  />
                )}

                {safeSection === 'admin' && currentUser.rol === 'creador' && (
                  <AdminCatalogosView
                    sucursales={sucursales}
                    metas={metas}
                    catalogos={guaranteedCatalogos}
                    usuarios={usuarios}
                    actividades={actividades}
                    currentUserId={currentUser.id}
                    supabaseConnected={
                      dataSource === 'supabase' && isSupabaseConfigured()
                    }
                    remoteSucursalesCount={remoteCounts.sucursales_config}
                    onSyncBaseSucursales={handleSyncBaseSucursales}
                    onOpenSupabaseModal={() => setSupabaseModalOpen(true)}
                    onSaveSucursal={handleSaveSucursal}
                    onDeleteSucursal={handleDeleteSucursal}
                    onSaveMeta={handleSaveMeta}
                    onSaveCatalogos={handleSaveCatalogos}
                    onSaveCatalogTask={handleSaveCatalogTask}
                    onDeleteCatalogTask={handleDeleteCatalogTask}
                    onSaveUsuario={handleSaveUsuario}
                    onDeleteUsuario={handleDeleteUsuario}
                    onCreateActividadesBatch={handleCreateActividadesBatch}
                    onUpdateActividad={handleUpdateActividad}
                    onDeleteActividad={handleDeleteActividad}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {currentUser.rol === 'creador' && (
        <SupabaseSetupModal
          open={supabaseModalOpen}
          onClose={() => setSupabaseModalOpen(false)}
          isConnected={dataSource === 'supabase' && isSupabaseConfigured()}
          warningMessage={supabaseWarning}
          onResetDemoData={handleResetDemo}
        />
      )}
    </div>
  );
}
