import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  CalendarRange,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Image as ImageIcon,
  MinusCircle,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import {
  ActividadDiaria,
  BranchMetricSummary,
  DiaSemana,
  GastoYRefrendo,
  HorarioSucursalDia,
  LlamadaSucursal,
  MetaSucursal,
  RolUsuario,
  SectionId,
  Sucursal,
  TareaCatalogo,
  UsuarioControlOps,
} from '../types/controlops';
import {
  calcularPuntualidadEnvio,
  computeBranchSummaries,
  evaluarVencimientoActividad,
  formatCurrencyClean,
  formatHora12h,
  formatPercent,
  getDiaSemanaFromDate,
  getTodayLocalYYYYMMDD,
  parseMoneyInput,
  resolveDailyTasksForBranch,
  roundMoney2,
} from '../utils/calculations';
import { ServiceResult } from '../services/controlOpsService';

type RankingCriterion =
  | 'consolidado'
  | 'actividades'
  | 'gastos'
  | 'refrendos'
  | 'llamadas';

type PanelTabId = 'resumen' | 'validaciones' | 'avance' | 'por_sucursal';
type ValidacionFilter =
  | 'enviadas'
  | 'todas'
  | 'a_tiempo'
  | 'a_destiempo'
  | 'aprobadas'
  | 'observadas';

interface RankingViewProps {
  summaries: BranchMetricSummary[];
  selectedSucursalId: string;
  onSelectSucursal: (id: string) => void;
  onNavigateSection: (section: SectionId) => void;
  userRole?: RolUsuario;
  sucursales?: Sucursal[];
  llamadas?: LlamadaSucursal[];
  actividades?: ActividadDiaria[];
  gastosYRefrendos?: GastoYRefrendo[];
  horarios?: HorarioSucursalDia[];
  diaActivo?: DiaSemana;
  metas?: MetaSucursal[];
  tareasCatalogo?: TareaCatalogo[];
  usuarios?: UsuarioControlOps[];
  onUpdateActividad?: (updated: ActividadDiaria) => Promise<ServiceResult>;
  onSaveMeta?: (meta: MetaSucursal) => Promise<ServiceResult>;
  onSaveSucursal?: (suc: Sucursal, isNew?: boolean) => Promise<ServiceResult>;
  onCreateGastoORefrendo?: (nuevo: GastoYRefrendo) => Promise<ServiceResult>;
  onUpdateGastoORefrendo?: (updated: GastoYRefrendo) => Promise<ServiceResult>;
  onDeleteGastoORefrendo?: (registro: GastoYRefrendo) => Promise<void>;
}

const CRITERIA_TABS: { id: RankingCriterion; label: string }[] = [
  { id: 'consolidado', label: 'Vista Consolidada' },
  { id: 'actividades', label: 'Actividades' },
  { id: 'gastos', label: 'Gastos (Techo Máximo)' },
  { id: 'refrendos', label: 'Refrendos' },
  { id: 'llamadas', label: 'Llamadas' },
];

const MESES_OPTIONS = [
  { value: 'todos', label: 'Todos los meses' },
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export const RankingView: React.FC<RankingViewProps> = ({
  summaries,
  selectedSucursalId,
  onSelectSucursal,
  onNavigateSection,
  userRole = 'creador',
  sucursales = [],
  llamadas = [],
  actividades = [],
  gastosYRefrendos = [],
  horarios = [],
  diaActivo = 'lunes',
  metas = [],
  tareasCatalogo = [],
  usuarios = [],
  onUpdateActividad,
  onSaveMeta,
  onSaveSucursal,
  onCreateGastoORefrendo,
  onUpdateGastoORefrendo,
  onDeleteGastoORefrendo,
}) => {
  const isCreador = userRole === 'creador';
  const [todayStr, setTodayStr] = useState<string>(() =>
    getTodayLocalYYYYMMDD()
  );

  const [panelTab, setPanelTab] = useState<PanelTabId>('resumen');
  const [criterion, setCriterion] = useState<RankingCriterion>('consolidado');
  const [filterMes, setFilterMes] = useState<string>('todos');
  const [filterAnio, setFilterAnio] = useState<string>(() =>
    getTodayLocalYYYYMMDD().slice(0, 4)
  );
  const [filterCajera, setFilterCajera] = useState<string>('todas');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');
  const [validacionFecha, setValidacionFecha] = useState<string>(() =>
    getTodayLocalYYYYMMDD()
  );

  useEffect(() => {
    const syncToday = () => {
      const latest = getTodayLocalYYYYMMDD();
      setTodayStr((prev) => {
        if (prev !== latest) {
          setValidacionFecha((vf) => (vf === prev ? latest : vf));
          return latest;
        }
        return prev;
      });
    };
    const interval = window.setInterval(syncToday, 30000);
    window.addEventListener('focus', syncToday);
    document.addEventListener('visibilitychange', syncToday);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncToday);
      document.removeEventListener('visibilitychange', syncToday);
    };
  }, []);

  const hasDateRange = Boolean(fechaDesde || fechaHasta);

  const [validacionFilter, setValidacionFilter] =
    useState<ValidacionFilter>('enviadas');
  const [obsDrafts, setObsDrafts] = useState<Record<string, string>>({});
  const [savingActId, setSavingActId] = useState<string | null>(null);
  const [validationFeedback, setValidationFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [lightboxImg, setLightboxImg] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);

  // Creator Direct Adjustment Modal state
  const [adjustModalBranchId, setAdjustModalBranchId] = useState<string | null>(
    null
  );
  const [adjustTab, setAdjustTab] = useState<'metas' | 'montos'>('metas');
  const [adjustMetaForm, setAdjustMetaForm] = useState({
    meta_llamadas_diarias: '30',
    meta_actividades_diarias: '9',
    meta_refrendos_mensual: '40',
    techo_gasto_mensual: '0',
  });
  const [adjustRecordForm, setAdjustRecordForm] = useState({
    editingId: '' as string,
    tipo: 'Refrendo' as 'Refrendo' | 'Gasto',
    concepto: '',
    monto_real: '',
    presupuesto_limite: '0',
    cantidad_refrendos: '1',
    fecha: getTodayLocalYYYYMMDD(),
    notas: '',
  });
  const [targetAccumRefrendos, setTargetAccumRefrendos] = useState<string>('');
  const [targetAccumGastos, setTargetAccumGastos] = useState<string>('');
  const [adjustFeedback, setAdjustFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [savingAdjust, setSavingAdjust] = useState(false);

  const yearOptions = useMemo(() => {
    const curr = Number(todayStr.slice(0, 4)) || 2026;
    return ['todos', String(curr - 1), String(curr), String(curr + 1)];
  }, [todayStr]);

  const cajeraOptions = useMemo(() => {
    const names = new Set<string>();
    sucursales.forEach((s) => {
      if (s.activa && s.responsable_caja) names.add(s.responsable_caja);
    });
    usuarios.forEach((u) => {
      if (u.rol === 'cajera' && u.activo && u.nombre) names.add(u.nombre);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [sucursales, usuarios]);

  const activeSummaries = useMemo(() => {
    const hasCustomFilter =
      filterMes !== 'todos' ||
      filterAnio !== 'todos' ||
      filterCajera !== 'todas' ||
      hasDateRange;

    const monthPrefix =
      filterAnio !== 'todos' && filterMes !== 'todos'
        ? `${filterAnio}-${filterMes}`
        : filterAnio !== 'todos'
          ? filterAnio
          : filterMes !== 'todos'
            ? `${todayStr.slice(0, 4)}-${filterMes}`
            : undefined;

    const baseList =
      hasCustomFilter && sucursales.length > 0
        ? computeBranchSummaries(
            sucursales,
            llamadas,
            actividades,
            gastosYRefrendos,
            horarios,
            diaActivo,
            metas,
            tareasCatalogo,
            {
              monthPrefix,
              cajeraNombre: filterCajera,
              fechaDesde: fechaDesde || undefined,
              fechaHasta: fechaHasta || undefined,
            }
          )
        : summaries;

    if (selectedSucursalId !== 'todas') {
      return baseList.filter((s) => s.sucursal.id === selectedSucursalId);
    }
    return baseList;
  }, [
    filterMes,
    filterAnio,
    filterCajera,
    hasDateRange,
    fechaDesde,
    fechaHasta,
    todayStr,
    sucursales,
    llamadas,
    actividades,
    gastosYRefrendos,
    horarios,
    diaActivo,
    metas,
    tareasCatalogo,
    summaries,
    selectedSucursalId,
  ]);

  const totals = useMemo(() => {
    const totalLlamadas = activeSummaries.reduce(
      (acc, s) => acc + s.llamadasRegistradas,
      0
    );
    const metaLlamadas = activeSummaries.reduce((acc, s) => acc + s.metaLlamadas, 0);
    const totalRefrendos = activeSummaries.reduce(
      (acc, s) => acc + s.refrendosRealizados,
      0
    );
    const metaRefrendos = roundMoney2(
      activeSummaries.reduce((acc, s) => acc + s.refrendosMeta, 0)
    );
    const montoRefrendos = roundMoney2(
      activeSummaries.reduce((acc, s) => acc + s.montoRefrendos, 0)
    );
    const totalGastosReal = roundMoney2(
      activeSummaries.reduce((acc, s) => acc + s.gastoRealTotal, 0)
    );
    const totalGastosTecho = roundMoney2(
      activeSummaries.reduce((acc, s) => acc + s.gastoPresupuestoTotal, 0)
    );
    const hasMonetaryRefrendoMeta = activeSummaries.some(
      (s) => s.refrendosMeta >= 500
    );
    const excedidas = activeSummaries.filter((s) => s.excedioPresupuesto).length;
    const enAlertaPreventiva = activeSummaries.filter(
      (s) => s.alertaPreventivaPresupuesto
    ).length;
    const dentroLimite = activeSummaries.length - excedidas;
    const totalActividadesCompletadas = activeSummaries.reduce(
      (acc, s) => acc + s.actividadesCompletadas,
      0
    );
    const totalActividadesAsignadas = activeSummaries.reduce(
      (acc, s) => acc + s.actividadesTotal,
      0
    );
    const promedioActividades =
      totalActividadesAsignadas > 0
        ? (totalActividadesCompletadas / totalActividadesAsignadas) * 100
        : 0;

    return {
      totalLlamadas,
      metaLlamadas,
      totalRefrendos,
      metaRefrendos,
      montoRefrendos,
      totalGastosReal,
      totalGastosTecho,
      hasMonetaryRefrendoMeta,
      excedidas,
      enAlertaPreventiva,
      dentroLimite,
      totalActividadesCompletadas,
      totalActividadesAsignadas,
      promedioActividades,
    };
  }, [activeSummaries]);

  const dailyComplianceRows = useMemo(() => {
    const targetDate = validacionFecha || todayStr;
    const targetDia = getDiaSemanaFromDate(targetDate);
    const activeSucs = activeSummaries.map((s) => s.sucursal);

    const rows: {
      actividad: ActividadDiaria;
      puntualidad: NonNullable<ActividadDiaria['puntualidad']>;
      validacion: NonNullable<ActividadDiaria['validacion_admin']>;
      horaLimiteEfectiva: string | null;
      hasSubmission: boolean;
    }[] = [];

    for (const suc of activeSucs) {
      const branchCajera = usuarios.find(
        (u) => u.rol === 'cajera' && u.activo && u.sucursal_id === suc.id
      );
      const horarioSuc = horarios.find(
        (h) => h.sucursal_id === suc.id && h.dia === targetDia
      );
      const resolved = resolveDailyTasksForBranch(
        suc,
        tareasCatalogo,
        actividades,
        targetDia,
        targetDate,
        branchCajera
          ? { id: branchCajera.id, nombre: branchCajera.nombre }
          : { nombre: suc.responsable_caja }
      );

      for (const act of resolved) {
        if (filterCajera !== 'todas') {
          const normFilter = filterCajera.trim().toLowerCase();
          const cajName = (act.cajera_nombre || act.responsable || suc.responsable_caja || '')
            .trim()
            .toLowerCase();
          if (cajName !== normFilter) continue;
        }
        const evalInfo = evaluarVencimientoActividad(act, horarioSuc);
        const effSinLimite = Boolean(act.sin_horario_limite || evalInfo.horaLimite === null);
        const effLimite = effSinLimite ? null : evalInfo.horaLimite;
        const puntualidad =
          act.puntualidad && act.puntualidad !== 'Pendiente'
            ? act.puntualidad
            : calcularPuntualidadEnvio(
                act.estatus,
                act.hora_completada,
                effLimite,
                effSinLimite
              );
        const validacion: NonNullable<ActividadDiaria['validacion_admin']> =
          act.validacion_admin ||
          (act.estatus === 'Observada' ? 'Rechazada' : 'Pendiente');
        const hasSubmission =
          act.estatus === 'Completada' ||
          act.estatus === 'Observada' ||
          Boolean(act.evidencia_url);

        rows.push({
          actividad: act,
          puntualidad,
          validacion,
          horaLimiteEfectiva: effLimite,
          hasSubmission,
        });
      }
    }

    return rows;
  }, [
    validacionFecha,
    todayStr,
    activeSummaries,
    usuarios,
    horarios,
    tareasCatalogo,
    actividades,
    filterCajera,
  ]);

  const evidenceSummaryCounts = useMemo(() => {
    const total = dailyComplianceRows.length;
    const enviadas = dailyComplianceRows.filter((r) => r.hasSubmission).length;
    const aTiempo = dailyComplianceRows.filter(
      (r) => r.hasSubmission && r.puntualidad === 'A tiempo'
    ).length;
    const aDestiempo = dailyComplianceRows.filter(
      (r) => r.hasSubmission && r.puntualidad === 'A destiempo'
    ).length;
    const porValidar = dailyComplianceRows.filter(
      (r) => r.hasSubmission && r.validacion === 'Pendiente'
    ).length;
    const aprobadas = dailyComplianceRows.filter(
      (r) => r.validacion === 'Aprobada'
    ).length;
    const observadas = dailyComplianceRows.filter(
      (r) => r.actividad.estatus === 'Observada' || r.validacion === 'Rechazada'
    ).length;
    return {
      total,
      enviadas,
      aTiempo,
      aDestiempo,
      porValidar,
      aprobadas,
      observadas,
    };
  }, [dailyComplianceRows]);

  const filteredValidationRows = useMemo(() => {
    return dailyComplianceRows.filter((r) => {
      switch (validacionFilter) {
        case 'enviadas':
          return r.hasSubmission;
        case 'a_tiempo':
          return r.hasSubmission && r.puntualidad === 'A tiempo';
        case 'a_destiempo':
          return r.hasSubmission && r.puntualidad === 'A destiempo';
        case 'aprobadas':
          return r.validacion === 'Aprobada';
        case 'observadas':
          return (
            r.actividad.estatus === 'Observada' || r.validacion === 'Rechazada'
          );
        case 'todas':
        default:
          return true;
      }
    });
  }, [dailyComplianceRows, validacionFilter]);

  const branchComplianceStats = useMemo(() => {
    return activeSummaries.map((s) => {
      const sucRows = dailyComplianceRows.filter(
        (r) => r.actividad.sucursal_id === s.sucursal.id
      );
      const total = sucRows.length;
      const completadas = sucRows.filter(
        (r) => r.actividad.estatus === 'Completada'
      ).length;
      const aTiempo = sucRows.filter(
        (r) => r.hasSubmission && r.puntualidad === 'A tiempo'
      ).length;
      const aDestiempo = sucRows.filter(
        (r) => r.hasSubmission && r.puntualidad === 'A destiempo'
      ).length;
      const aprobadas = sucRows.filter(
        (r) => r.validacion === 'Aprobada'
      ).length;
      const observadas = sucRows.filter(
        (r) =>
          r.actividad.estatus === 'Observada' || r.validacion === 'Rechazada'
      ).length;
      return {
        summary: s,
        total,
        completadas,
        aTiempo,
        aDestiempo,
        aprobadas,
        observadas,
      };
    });
  }, [activeSummaries, dailyComplianceRows]);

  const handleValidateEvidence = async (
    act: ActividadDiaria,
    decision: 'Aprobada' | 'Rechazada'
  ) => {
    if (!onUpdateActividad) return;
    setSavingActId(act.id);
    setValidationFeedback(null);
    const obsText = (obsDrafts[act.id] ?? act.observaciones ?? '').trim();
    const next: ActividadDiaria = {
      ...act,
      estatus: decision === 'Aprobada' ? 'Completada' : 'Observada',
      validacion_admin: decision,
      observaciones: obsText,
    };
    const res = await onUpdateActividad(next);
    setSavingActId(null);
    if (!res.ok) {
      setValidationFeedback({
        type: 'error',
        message:
          res.error ||
          `No se pudo guardar la validación de "${act.titulo}" en Supabase.`,
      });
      return;
    }
    setValidationFeedback({
      type: 'success',
      message:
        decision === 'Aprobada'
          ? `Evidencia "${act.titulo}" (${act.sucursal_nombre}) validada correctamente.`
          : `Evidencia "${act.titulo}" (${act.sucursal_nombre}) marcada como Observada / Rechazada.`,
    });
  };

  const alertasRezago = useMemo(() => {
    const alerts: {
      id: string;
      sucursalId: string;
      sucursalNombre: string;
      cajera: string;
      tipo: string;
      detalle: string;
      severity: 'danger' | 'warn';
      targetSection: SectionId;
    }[] = [];

    for (const item of activeSummaries) {
      if (item.excedioPresupuesto) {
        alerts.push({
          id: `alert-gasto-${item.sucursal.id}`,
          sucursalId: item.sucursal.id,
          sucursalNombre: item.sucursal.nombre,
          cajera: item.sucursal.responsable_caja,
          tipo: 'Techo de gasto excedido',
          detalle: `Exceso de ${formatCurrencyClean(item.excesoDinero)} (+${formatPercent(item.excesoPorcentaje)}) sobre límite`,
          severity: 'danger',
          targetSection: 'gastos',
        });
      } else if (item.alertaPreventivaPresupuesto) {
        alerts.push({
          id: `alert-gasto-prev-${item.sucursal.id}`,
          sucursalId: item.sucursal.id,
          sucursalNombre: item.sucursal.nombre,
          cajera: item.sucursal.responsable_caja,
          tipo: 'Alerta preventiva gasto (≥85%)',
          detalle: `${formatCurrencyClean(item.gastoRealTotal)} de ${formatCurrencyClean(item.gastoPresupuestoTotal)} (${formatPercent(item.pctUsoPresupuesto, 1)} usado)`,
          severity: 'warn',
          targetSection: 'gastos',
        });
      }
      if (item.actividadesVencidas > 0) {
        alerts.push({
          id: `alert-act-${item.sucursal.id}`,
          sucursalId: item.sucursal.id,
          sucursalNombre: item.sucursal.nombre,
          cajera: item.sucursal.responsable_caja,
          tipo: 'Actividades fuera de horario',
          detalle: `${item.actividadesVencidas} actividad(es) vencida(s) ${hasDateRange ? 'en el rango' : 'hoy'} sin evidencia`,
          severity: 'danger',
          targetSection: 'actividades',
        });
      }
      if (item.pctLlamadas < 50) {
        alerts.push({
          id: `alert-ll-${item.sucursal.id}`,
          sucursalId: item.sucursal.id,
          sucursalNombre: item.sucursal.nombre,
          cajera: item.sucursal.responsable_caja,
          tipo: 'Rezago en llamadas',
          detalle: `${item.llamadasRegistradas}/${item.metaLlamadas} marcaciones (${formatPercent(item.pctLlamadas, 0)})`,
          severity: 'warn',
          targetSection: 'llamadas',
        });
      }
      if (item.pctRefrendos < 50) {
        alerts.push({
          id: `alert-ref-${item.sucursal.id}`,
          sucursalId: item.sucursal.id,
          sucursalNombre: item.sucursal.nombre,
          cajera: item.sucursal.responsable_caja,
          tipo: 'Rezago en refrendos',
          detalle:
            item.refrendosMeta >= 500
              ? `${formatCurrencyClean(item.montoRefrendos)}/${formatCurrencyClean(item.refrendosMeta)} (${formatPercent(item.pctRefrendos, 0)} de meta)`
              : `${item.refrendosRealizados}/${item.refrendosMeta} (${formatPercent(item.pctRefrendos, 0)} de meta)`,
          severity: 'warn',
          targetSection: 'gastos',
        });
      }
    }

    return alerts;
  }, [activeSummaries, hasDateRange]);

  const sortedSummaries = useMemo(() => {
    const copy = [...activeSummaries];
    copy.sort((a, b) => {
      switch (criterion) {
        case 'actividades':
          return b.pctActividades - a.pctActividades;
        case 'gastos': {
          // Mejor disciplina primero: quienes están dentro del límite antes que quienes excedieron,
          // y ordenados por menor porcentaje de uso del techo presupuestal.
          if (a.excedioPresupuesto !== b.excedioPresupuesto) {
            return a.excedioPresupuesto ? 1 : -1;
          }
          return a.pctUsoPresupuesto - b.pctUsoPresupuesto;
        }
        case 'refrendos':
          return b.pctRefrendos - a.pctRefrendos;
        case 'llamadas':
          return b.pctLlamadas - a.pctLlamadas;
        case 'consolidado':
        default:
          return b.puntajeGlobal - a.puntajeGlobal;
      }
    });
    return copy;
  }, [activeSummaries, criterion]);

  const getChartValue = (s: BranchMetricSummary) => {
    switch (criterion) {
      case 'actividades':
        return {
          pct: s.pctActividades,
          display:
            s.actividadesTotal > 0
              ? `${s.actividadesCompletadas}/${s.actividadesTotal} ${hasDateRange ? 'en rango' : 'hoy'} (${formatPercent(s.pctActividades, 1)})`
              : '0/0 (Sin asignadas)',
          status:
            s.actividadesTotal === 0
              ? 'Sin asignadas'
              : s.pctActividades >= 100
                ? '100% completado'
                : s.pctActividades >= 80 && s.actividadesVencidas === 0
                  ? 'En avance'
                  : 'Pendiente',
          tone:
            s.actividadesTotal === 0
              ? 'warn'
              : s.pctActividades >= 100 ||
                  (s.pctActividades >= 80 && s.actividadesVencidas === 0)
                ? 'good'
                : 'warn',
        };
      case 'gastos':
        return {
          pct: Math.min(100, s.pctUsoPresupuesto),
          display: s.excedioPresupuesto
            ? `${formatCurrencyClean(s.gastoRealTotal)} / ${formatCurrencyClean(s.gastoPresupuestoTotal)} (+${formatPercent(s.excesoPorcentaje)})`
            : `${formatCurrencyClean(s.gastoRealTotal)} / ${formatCurrencyClean(s.gastoPresupuestoTotal)} (${formatPercent(s.pctUsoPresupuesto, 1)})`,
          status: s.excedioPresupuesto
            ? 'Techo excedido'
            : s.alertaPreventivaPresupuesto
              ? 'Alerta preventiva (≥85%)'
              : 'Dentro del límite',
          tone: s.excedioPresupuesto
            ? 'danger'
            : s.alertaPreventivaPresupuesto
              ? 'warn'
              : 'good',
        };
      case 'refrendos':
        return {
          pct: Math.min(100, s.pctRefrendos),
          display:
            s.refrendosMeta >= 500
              ? `${formatCurrencyClean(s.montoRefrendos)} / ${formatCurrencyClean(s.refrendosMeta)} (${s.refrendosRealizados} op.)`
              : `${s.refrendosRealizados}/${s.refrendosMeta} · ${formatCurrencyClean(s.montoRefrendos)}`,
          status: s.pctRefrendos >= 100 ? 'Meta alcanzada' : 'No llegó a meta',
          tone: s.pctRefrendos >= 100 ? 'good' : 'warn',
        };
      case 'llamadas':
        return {
          pct: s.pctLlamadas,
          display: isCreador
            ? `${s.llamadasRegistradas}/${s.metaLlamadas} registradas · ${s.llamadasVerificadas} verif.`
            : `${s.llamadasRegistradas}/${s.metaLlamadas} registradas`,
          status: s.pctLlamadas >= 100 ? 'Meta alcanzada' : 'En progreso',
          tone: s.pctLlamadas >= 100 ? 'good' : 'warn',
        };
      case 'consolidado':
      default:
        return {
          pct: s.puntajeGlobal,
          display: `${s.puntajeGlobal} pts`,
          status: s.excedioPresupuesto
            ? 'Techo excedido'
            : s.puntajeGlobal >= 75
              ? 'En meta'
              : 'Requiere atención',
          tone: s.excedioPresupuesto
            ? 'danger'
            : s.puntajeGlobal >= 75
              ? 'good'
              : 'warn',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Panel de control Navigation Tabs + Filters Bar */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#5B21B6]">
            <Filter className="h-4 w-4 text-[#DB2777]" />
            <span>Panel de control · Filtros</span>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F0FC] rounded-xl">
            {(
              [
                { id: 'resumen', label: 'Resumen' },
                {
                  id: 'validaciones',
                  label:
                    evidenceSummaryCounts.porValidar > 0
                      ? `Validaciones (${evidenceSummaryCounts.porValidar})`
                      : `Validaciones (${evidenceSummaryCounts.enviadas})`,
                },
                { id: 'avance', label: 'Avance' },
                { id: 'por_sucursal', label: 'Por sucursal' },
              ] as { id: PanelTabId; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPanelTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  panelTab === tab.id
                    ? 'bg-white text-[#5B21B6] shadow-xs'
                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-[#F1ECF9]">
          <select
            aria-label="Filtrar por mes"
            value={filterMes}
            onChange={(e) => {
              setFilterMes(e.target.value);
              if (e.target.value !== 'todos') {
                setFechaDesde('');
                setFechaHasta('');
              }
            }}
            className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
          >
            {MESES_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                Mes: {m.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por año"
            value={filterAnio}
            onChange={(e) => {
              setFilterAnio(e.target.value);
              if (e.target.value !== 'todos') {
                setFechaDesde('');
                setFechaHasta('');
              }
            }}
            className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y === 'todos' ? 'Año: Todos' : `Año: ${y}`}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por sucursal"
            value={selectedSucursalId}
            onChange={(e) => onSelectSucursal(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#5B21B6] focus:outline-none focus:border-[#7C3AED]"
          >
            <option value="todas">Sucursal: Todas</option>
            {sucursales
              .filter((s) => s.activa)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
          </select>

          <select
            aria-label="Filtrar por cajera"
            value={filterCajera}
            onChange={(e) => setFilterCajera(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
          >
            <option value="todas">Cajera: Todas</option>
            {cajeraOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Fecha de cumplimiento y evidencias"
            value={validacionFecha}
            onChange={(e) => setValidacionFecha(e.target.value || todayStr)}
            className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
          />
        </div>

        {/* Date Range Selector (Desde — Hasta) & Creator Direct Adjust */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2 border-t border-[#F1ECF9]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B21B6]">
              <CalendarRange className="h-3.5 w-3.5 text-[#7C3AED]" />
              Rango de fechas:
            </span>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#6E5F87]">
              <span>Desde</span>
              <input
                type="date"
                aria-label="Fecha desde"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#6E5F87]">
              <span>Hasta</span>
              <input
                type="date"
                aria-label="Fecha hasta"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setFechaDesde(todayStr);
                setFechaHasta(todayStr);
              }}
              className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] hover:bg-[#F3ECFC] text-[11px] font-semibold text-[#5B21B6]"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => {
                setFechaDesde(`${todayStr.slice(0, 7)}-01`);
                setFechaHasta(todayStr);
              }}
              className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] hover:bg-[#F3ECFC] text-[11px] font-semibold text-[#5B21B6]"
            >
              Este mes
            </button>
            {hasDateRange && (
              <button
                type="button"
                onClick={() => {
                  setFechaDesde('');
                  setFechaHasta('');
                }}
                className="px-2.5 py-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] text-[11px] font-semibold text-[#BE123C]"
              >
                Limpiar rango
              </button>
            )}
          </div>

          {isCreador && activeSummaries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const targetSum =
                  selectedSucursalId !== 'todas'
                    ? activeSummaries.find(
                        (s) => s.sucursal.id === selectedSucursalId
                      ) || activeSummaries[0]
                    : activeSummaries[0];
                if (!targetSum) return;
                const m = metas.find(
                  (mt) => mt.sucursal_id === targetSum.sucursal.id
                );
                setAdjustFeedback(null);
                setAdjustTab('metas');
                setAdjustMetaForm({
                  meta_llamadas_diarias: String(
                    m?.meta_llamadas_diarias ??
                      targetSum.sucursal.meta_llamadas_diarias ??
                      30
                  ),
                  meta_actividades_diarias: String(
                    m?.meta_actividades_diarias ??
                      targetSum.sucursal.meta_actividades_diarias ??
                      9
                  ),
                  meta_refrendos_mensual: String(
                    m?.meta_refrendos_mensual ??
                      targetSum.sucursal.meta_refrendos_mensual ??
                      40
                  ),
                  techo_gasto_mensual: String(
                    m?.techo_gasto_mensual ??
                      targetSum.sucursal.techo_gasto_mensual ??
                      0
                  ),
                });
                setTargetAccumRefrendos(String(targetSum.montoRefrendos));
                setTargetAccumGastos(String(targetSum.gastoRealTotal));
                setAdjustRecordForm({
                  editingId: '',
                  tipo: 'Refrendo',
                  concepto: '',
                  monto_real: '',
                  presupuesto_limite: String(targetSum.gastoPresupuestoTotal),
                  cantidad_refrendos: '1',
                  fecha: fechaHasta || todayStr,
                  notas: '',
                });
                setAdjustModalBranchId(targetSum.sucursal.id);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors self-start lg:self-auto"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Ajustar montos / metas
            </button>
          )}
        </div>
      </section>

      {/* Top Executive KPI Strip (shown in Resumen & Avance) */}
      {(panelTab === 'resumen' || panelTab === 'avance') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            {hasDateRange
              ? 'Cumplimiento de actividades (rango)'
              : 'Cumplimiento real de actividades hoy'}
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
              {formatPercent(totals.promedioActividades, 1)}
            </span>
            <span className="font-mono-num text-xs text-[#6E5F87]">
              {totals.totalActividadesCompletadas}/
              {totals.totalActividadesAsignadas} {hasDateRange ? 'rango' : 'hoy'}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            Techo de gasto por sucursal
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
              {totals.dentroLimite}/{activeSummaries.length}
            </span>
            <div className="text-right">
              <span
                className={`block text-xs font-medium ${
                  totals.excedidas > 0
                    ? 'text-[#BE123C]'
                    : totals.enAlertaPreventiva > 0
                      ? 'text-[#B45309]'
                      : 'text-[#15803D]'
                }`}
              >
                {totals.excedidas > 0 && totals.enAlertaPreventiva > 0
                  ? `${totals.excedidas} excedieron · ${totals.enAlertaPreventiva} ≥85%`
                  : totals.excedidas > 0
                    ? `${totals.excedidas} excedieron techo`
                    : totals.enAlertaPreventiva > 0
                      ? `${totals.enAlertaPreventiva} en preventiva (≥85%)`
                      : 'Todas dentro del límite'}
              </span>
              <span className="font-mono-num text-[11px] text-[#6E5F87]">
                {formatCurrencyClean(totals.totalGastosReal)} /{' '}
                {formatCurrencyClean(totals.totalGastosTecho)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            Refrendos acumulados
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            {totals.hasMonetaryRefrendoMeta ? (
              <>
                <span className="font-display text-xl sm:text-2xl font-bold text-[#1F172B] tabular-nums truncate">
                  {formatCurrencyClean(totals.montoRefrendos)}
                </span>
                <span className="font-mono-num text-xs font-medium text-[#6D28D9] shrink-0">
                  Meta {formatCurrencyClean(totals.metaRefrendos)}
                </span>
              </>
            ) : (
              <>
                <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
                  {totals.totalRefrendos}
                  <span className="text-sm font-normal text-[#8B7CA5]">
                    /{totals.metaRefrendos}
                  </span>
                </span>
                <span className="font-mono-num text-xs font-medium text-[#6D28D9]">
                  {formatCurrencyClean(totals.montoRefrendos)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            {hasDateRange
              ? 'Avance de llamadas (rango)'
              : 'Avance diario de llamadas'}
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
              {totals.totalLlamadas}
              <span className="text-sm font-normal text-[#8B7CA5]">
                /{totals.metaLlamadas}
              </span>
            </span>
            <span className="text-xs text-[#DB2777] font-medium tabular-nums">
              {formatPercent(
                totals.metaLlamadas > 0
                  ? (totals.totalLlamadas / totals.metaLlamadas) * 100
                  : 0,
                1
              )}
            </span>
          </div>
        </div>
      </div>
      )}

      {/* Real-time Lag Alerts Block (shown in Resumen) */}
      {panelTab === 'resumen' && (
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-[#DB2777]" />
            <h2 className="font-display text-base font-bold text-[#1F172B]">
              Alertas de rezago en tiempo real
            </h2>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              alertasRezago.length > 0
                ? 'bg-[#FFF1F2] text-[#BE123C]'
                : 'bg-[#F0FDF4] text-[#15803D]'
            }`}
          >
            {alertasRezago.length > 0
              ? `${alertasRezago.length} alerta(s) activa(s)`
              : 'Sin rezagos críticos'}
          </span>
        </div>

        {alertasRezago.length === 0 ? (
          <p className="text-xs text-[#6E5F87]">
            Todas las sucursales filtradas se encuentran dentro de sus rangos operativos esperados.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
            {alertasRezago.slice(0, 12).map((alert) => (
              <button
                key={alert.id}
                type="button"
                onClick={() => {
                  onSelectSucursal(alert.sucursalId);
                  onNavigateSection(alert.targetSection);
                }}
                className={`text-left rounded-xl border p-3.5 transition-colors hover:shadow-xs ${
                  alert.severity === 'danger'
                    ? 'bg-[#FFF1F2]/70 border-[#FECDD3] hover:bg-[#FFF1F2]'
                    : 'bg-[#FFFBEB]/80 border-[#FDE68A] hover:bg-[#FFFBEB]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#1F172B] truncate">
                    {alert.sucursalNombre}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                      alert.severity === 'danger'
                        ? 'bg-white text-[#BE123C]'
                        : 'bg-white text-[#B45309]'
                    }`}
                  >
                    {alert.tipo}
                  </span>
                </div>
                <p className="text-[11px] text-[#55476E] mt-1">{alert.detalle}</p>
                <p className="text-[11px] text-[#8B7CA5] mt-0.5 truncate">
                  Cajera: {alert.cajera}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>
      )}

      {/* Comparative Criterion Selector & Bar Comparison (Resumen & Por sucursal) */}
      {(panelTab === 'resumen' || panelTab === 'por_sucursal') && (
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 md:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#1F172B]">
              Comparativa de sucursales (mayor a menor)
            </h2>
            <p className="text-xs text-[#7A6B93] mt-0.5">
              {criterion === 'gastos'
                ? 'Ordenadas de mejor disciplina presupuestal (bajo techo máximo) a mayor sobrecosto.'
                : criterion === 'actividades'
                  ? 'Porcentaje real calculado dinámicamente: (Completadas hoy / Asignadas hoy) × 100.'
                  : 'Ordenadas de mayor a menor desempeño según el indicador seleccionado.'}
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F0FC] rounded-xl"
            role="tablist"
            aria-label="Criterio de ranking"
          >
            {CRITERIA_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={criterion === tab.id}
                onClick={() => setCriterion(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  criterion === tab.id
                    ? 'bg-white text-[#5B21B6] shadow-xs'
                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clean Visual Bars */}
        <div className="space-y-3 pt-1">
          {sortedSummaries.map((item, idx) => {
            const metric = getChartValue(item);
            const isSelected = selectedSucursalId === item.sucursal.id;

            const barColor =
              metric.tone === 'danger'
                ? 'bg-[#E11D48]'
                : metric.tone === 'warn'
                  ? 'bg-[#D97706]'
                  : 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899]';

            return (
              <div
                key={item.sucursal.id}
                onClick={() =>
                  onSelectSucursal(
                    isSelected ? 'todas' : item.sucursal.id
                  )
                }
                className={`group rounded-xl p-3.5 border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#FAF5FF] border-[#C4B5FD]'
                    : 'bg-[#FCFAFE] border-[#EFE9F8] hover:border-[#D8CCF0]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`font-mono-num text-xs font-semibold w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? 'bg-[#FDF2F8] text-[#BE185D]'
                          : 'bg-[#F3ECFC] text-[#5B21B6]'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-[#1F172B]">
                        {item.sucursal.nombre}
                      </span>
                      <span className="text-xs text-[#7A6B93] ml-2">
                        · {item.sucursal.responsable_caja}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <span className="font-mono-num font-medium text-[#1F172B]">
                      {metric.display}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${
                        metric.tone === 'danger'
                          ? 'text-[#BE123C]'
                          : metric.tone === 'warn'
                            ? 'text-[#B45309]'
                            : 'text-[#15803D]'
                      }`}
                    >
                      {metric.tone === 'danger' ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : metric.tone === 'warn' ? (
                        <MinusCircle className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {metric.status}
                    </span>
                  </div>
                </div>

                <div className="h-2.5 w-full rounded-full bg-[#EFE9F8] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    style={{
                      width: `${metric.pct <= 0 ? 0 : Math.max(3, Math.min(100, metric.pct))}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {/* Avance Detallado de Cumplimiento y Puntualidad (Avance & Resumen) */}
      {(panelTab === 'avance' || panelTab === 'resumen') && (
        <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F1ECF9] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-[#1F172B]">
                Avance diario de actividades y puntualidad ({validacionFecha})
              </h2>
              <p className="text-xs text-[#7A6B93] mt-0.5">
                {evidenceSummaryCounts.enviadas} de {evidenceSummaryCounts.total} actividades enviadas ·{' '}
                <span className="font-semibold text-[#15803D]">
                  {evidenceSummaryCounts.aTiempo} a tiempo
                </span>{' '}
                ·{' '}
                <span className="font-semibold text-[#C2410C]">
                  {evidenceSummaryCounts.aDestiempo} a destiempo
                </span>{' '}
                ·{' '}
                <span className="font-semibold text-[#4338CA]">
                  {evidenceSummaryCounts.aprobadas} validadas
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanelTab('validaciones')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F3ECFC] text-[#5B21B6] hover:bg-[#E7DAFA] transition-colors self-start sm:self-auto"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Ir a Validaciones ({evidenceSummaryCounts.porValidar} pendientes)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-5">
            {branchComplianceStats.map((st) => {
              const pctDone =
                st.total > 0 ? Math.round((st.completadas / st.total) * 100) : 0;
              return (
                <div
                  key={st.summary.sucursal.id}
                  className="rounded-xl border border-[#EAE3F5] bg-[#FCFAFE] p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-[#1F172B] truncate">
                        {st.summary.sucursal.nombre}
                      </h3>
                      <p className="text-[11px] text-[#7A6B93] truncate">
                        Cajera: {st.summary.sucursal.responsable_caja}
                      </p>
                    </div>
                    <span className="font-mono-num text-xs font-bold text-[#5B21B6]">
                      {st.completadas}/{st.total} ({pctDone}%)
                    </span>
                  </div>

                  <div className="h-2 rounded-full bg-[#EFE9F8] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#EC4899]"
                      style={{ width: `${pctDone}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#15803D] font-semibold">
                      {st.aTiempo} a tiempo
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#FFF7ED] text-[#C2410C] font-semibold">
                      {st.aDestiempo} a destiempo
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#EEF2FF] text-[#4338CA] font-semibold">
                      {st.aprobadas} aprobadas
                    </span>
                    {st.observadas > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-[#FFF1F2] text-[#BE123C] font-semibold">
                        {st.observadas} observadas
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Validaciones de Evidencias y Puntualidad (Validaciones & Resumen) */}
      {(panelTab === 'validaciones' || panelTab === 'resumen') && (
        <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F1ECF9] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#7C3AED]" />
                <h2 className="font-display text-base font-bold text-[#1F172B]">
                  Validación de evidencias y puntualidad ({validacionFecha})
                </h2>
              </div>
              <p className="text-xs text-[#7A6B93] mt-0.5">
                Revisa cada fotografía enviada por las sucursales, su hora de envío frente al límite activo (A tiempo / A destiempo) y valida u observa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  {
                    id: 'enviadas',
                    label: `Enviadas (${evidenceSummaryCounts.enviadas})`,
                  },
                  {
                    id: 'todas',
                    label: `Todas (${evidenceSummaryCounts.total})`,
                  },
                  {
                    id: 'a_tiempo',
                    label: `A tiempo (${evidenceSummaryCounts.aTiempo})`,
                  },
                  {
                    id: 'a_destiempo',
                    label: `A destiempo (${evidenceSummaryCounts.aDestiempo})`,
                  },
                  {
                    id: 'aprobadas',
                    label: `Aprobadas (${evidenceSummaryCounts.aprobadas})`,
                  },
                  {
                    id: 'observadas',
                    label: `Observadas (${evidenceSummaryCounts.observadas})`,
                  },
                ] as { id: ValidacionFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setValidacionFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                    validacionFilter === f.id
                      ? 'bg-[#F3ECFC] border-[#C4B5FD] text-[#5B21B6]'
                      : 'bg-[#FAF8FC] border-[#EAE3F5] text-[#6E5F87] hover:text-[#1F172B]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {validationFeedback && (
            <div
              role="alert"
              className={`mx-5 mt-4 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-2 border ${
                validationFeedback.type === 'error'
                  ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
                  : 'bg-[#ECFDF5] border-[#BBF7D0] text-[#15803D]'
              }`}
            >
              <span>{validationFeedback.message}</span>
              <button
                type="button"
                onClick={() => setValidationFeedback(null)}
                className="font-bold underline shrink-0"
              >
                Cerrar
              </button>
            </div>
          )}

          {filteredValidationRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#7A6B93]">
              No hay evidencias o actividades que coincidan con el filtro seleccionado para {validacionFecha}.
            </div>
          ) : (
            <div className="divide-y divide-[#F3EEF9]">
              {filteredValidationRows.map(
                ({
                  actividad: act,
                  puntualidad,
                  validacion,
                  horaLimiteEfectiva,
                  hasSubmission,
                }) => {
                  const isBusy = savingActId === act.id;
                  const draftValue =
                    obsDrafts[act.id] !== undefined
                      ? obsDrafts[act.id]
                      : act.observaciones || '';
                  return (
                    <div
                      key={`${act.id}-${act.sucursal_id}`}
                      className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#FCFAFE]"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {act.evidencia_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImg({
                                url: act.evidencia_url!,
                                title: act.titulo,
                                subtitle: `${act.sucursal_nombre} · ${act.cajera_nombre || act.responsable}`,
                              })
                            }
                            className="relative h-16 w-16 rounded-xl overflow-hidden border border-[#E6DDF5] bg-[#FAF8FC] shrink-0 group"
                            title="Ampliar fotografía de evidencia"
                          >
                            <img
                              src={act.evidencia_url}
                              alt={`Evidencia de ${act.titulo}`}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <span className="absolute inset-0 bg-[#1F172B]/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="h-4 w-4 text-white" />
                            </span>
                          </button>
                        ) : (
                          <div className="h-16 w-16 rounded-xl border border-dashed border-[#DDD4EE] bg-[#FAF8FC] flex items-center justify-center text-[#9D8FB5] shrink-0">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}

                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-[#1F172B]">
                              {act.titulo}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#F3ECFC] text-[#5B21B6]">
                              {act.sucursal_nombre}
                            </span>
                            <span className="text-xs text-[#6E5F87]">
                              Cajera: {act.cajera_nombre || act.responsable}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FAF8FC] border border-[#EAE3F5] text-[#55476E] font-mono-num">
                              <Clock className="h-3 w-3 text-[#7C3AED]" />
                              {horaLimiteEfectiva
                                ? `Límite ${formatHora12h(horaLimiteEfectiva)}`
                                : 'Sin horario límite'}
                            </span>

                            {act.hora_completada && (
                              <span className="font-mono-num text-[#55476E]">
                                Envío: <strong>{formatHora12h(act.hora_completada)}</strong>
                              </span>
                            )}

                            <span
                              className={`px-2 py-0.5 rounded-md font-semibold ${
                                puntualidad === 'A tiempo'
                                  ? 'bg-[#ECFDF5] text-[#15803D]'
                                  : puntualidad === 'A destiempo'
                                    ? 'bg-[#FFF7ED] text-[#C2410C]'
                                    : puntualidad === 'Sin horario límite'
                                      ? 'bg-[#F3ECFC] text-[#5B21B6]'
                                      : 'bg-[#FEF9C3] text-[#A16207]'
                              }`}
                            >
                              {puntualidad}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded-md font-semibold ${
                                validacion === 'Aprobada'
                                  ? 'bg-[#EEF2FF] text-[#4338CA]'
                                  : act.estatus === 'Observada' ||
                                      validacion === 'Rechazada'
                                    ? 'bg-[#FFF1F2] text-[#BE123C]'
                                    : hasSubmission
                                      ? 'bg-[#FEF9C3] text-[#A16207]'
                                      : 'bg-[#FAF8FC] text-[#8B7CA5]'
                              }`}
                            >
                              {validacion === 'Aprobada'
                                ? 'Validada'
                                : act.estatus === 'Observada' ||
                                    validacion === 'Rechazada'
                                  ? 'Observada / Rechazada'
                                  : hasSubmission
                                    ? 'Por validar'
                                    : 'Sin evidencia'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isCreador && onUpdateActividad && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 lg:w-[420px] shrink-0">
                          <input
                            type="text"
                            value={draftValue}
                            onChange={(e) =>
                              setObsDrafts((prev) => ({
                                ...prev,
                                [act.id]: e.target.value,
                              }))
                            }
                            placeholder="Observación para la cajera..."
                            className="flex-1 px-3 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs text-[#1F172B] focus:outline-none focus:border-[#7C3AED] focus:bg-white"
                          />
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy || !hasSubmission}
                              onClick={() =>
                                void handleValidateEvidence(act, 'Aprobada')
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#15803D] border border-[#A7F3D0] disabled:opacity-45"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Validar
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleValidateEvidence(act, 'Rechazada')
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#FFF1F2] hover:bg-[#FFE4E6] text-[#BE123C] border border-[#FECDD3] disabled:opacity-45"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Observar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>
      )}

      {/* Consolidated Matrix Table (Resumen & Por sucursal) */}
      {(panelTab === 'resumen' || panelTab === 'por_sucursal') && (
      <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F1ECF9] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#DB2777]" />
            <h2 className="font-display text-base font-bold text-[#1F172B]">
              Tablero integral por sucursal
            </h2>
          </div>
          <p className="text-xs text-[#7A6B93]">
            Haz clic en una sucursal para enfocar sus módulos
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#F1ECF9] bg-[#FAF8FC] text-[12px] font-semibold text-[#6E5F87]">
                <th className="py-3 px-4">Posición / Sucursal</th>
                <th className="py-3 px-4 text-right">Actividades</th>
                <th className="py-3 px-4 text-right">Gasto vs Techo</th>
                <th className="py-3 px-4 text-right">Refrendos</th>
                <th className="py-3 px-4 text-right">Llamadas</th>
                <th className="py-3 px-4 text-right">Estado general</th>
                <th className="py-3 px-4 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3EEF9] text-sm">
              {sortedSummaries.map((item, idx) => {
                const isSelected = selectedSucursalId === item.sucursal.id;
                return (
                  <tr
                    key={item.sucursal.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-[#FAF5FF]' : 'hover:bg-[#FCFAFE]'
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <span className="font-mono-num text-xs font-semibold text-[#6D28D9] w-5">
                          {idx + 1}.
                        </span>
                        <div>
                          <div className="font-semibold text-[#1F172B]">
                            {item.sucursal.nombre}
                          </div>
                          <div className="text-xs text-[#7A6B93]">
                            {item.sucursal.ciudad} · {item.sucursal.responsable_caja}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right tabular-nums">
                      <div className="font-mono-num font-medium text-[#1F172B]">
                        {item.actividadesCompletadas}/{item.actividadesTotal} (
                        {formatPercent(item.pctActividades, 1)})
                      </div>
                      <div
                        className={`text-xs ${
                          item.actividadesTotal === 0
                            ? 'text-[#8B7CA5]'
                            : item.actividadesVencidas > 0
                              ? 'text-[#BE123C]'
                              : item.pctActividades >= 100
                                ? 'text-[#15803D]'
                                : 'text-[#B45309]'
                        }`}
                      >
                        {item.actividadesTotal === 0
                          ? 'Sin actividades hoy'
                          : item.actividadesVencidas > 0
                            ? `${item.actividadesVencidas} fuera de horario`
                            : item.pctActividades >= 100
                              ? 'Completado 100%'
                              : 'En progreso'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right tabular-nums">
                      <div className="font-mono-num font-medium text-[#1F172B]">
                        {formatCurrencyClean(item.gastoRealTotal)}
                        <span className="text-xs text-[#8B7CA5]">
                          {' '}
                          / {formatCurrencyClean(item.gastoPresupuestoTotal)}
                        </span>
                      </div>
                      {item.excedioPresupuesto ? (
                        <div className="text-xs font-semibold text-[#BE123C]">
                          +{formatCurrencyClean(item.excesoDinero)} (+
                          {formatPercent(item.excesoPorcentaje)}) excedido
                        </div>
                      ) : item.alertaPreventivaPresupuesto ? (
                        <div className="text-xs font-semibold text-[#B45309]">
                          Alerta preventiva ({formatPercent(item.pctUsoPresupuesto, 1)})
                        </div>
                      ) : (
                        <div className="text-xs text-[#15803D]">
                          Dentro del límite (
                          {formatPercent(item.pctUsoPresupuesto, 0)})
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right tabular-nums">
                      <div className="font-mono-num font-medium text-[#1F172B]">
                        {item.refrendosMeta >= 500
                          ? `${formatCurrencyClean(item.montoRefrendos)} / ${formatCurrencyClean(item.refrendosMeta)}`
                          : `${item.refrendosRealizados}/${item.refrendosMeta}`}
                      </div>
                      <div
                        className={`text-xs ${
                          item.pctRefrendos >= 100
                            ? 'text-[#15803D] font-medium'
                            : item.pctRefrendos >= 75
                              ? 'text-[#6D28D9]'
                              : 'text-[#B45309]'
                        }`}
                      >
                        {item.pctRefrendos >= 100
                          ? 'Meta superada'
                          : `${formatPercent(item.pctRefrendos, 0)} de meta`}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right tabular-nums">
                      <div className="font-mono-num font-medium text-[#1F172B]">
                        {item.llamadasRegistradas}/{item.metaLlamadas}
                      </div>
                      <div className="text-xs text-[#7A6B93]">
                        {isCreador
                          ? `${item.llamadasVerificadas} verif. · ${item.llamadasFalsas} falsas`
                          : `${formatPercent(item.pctLlamadas, 0)} de meta`}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {item.excedioPresupuesto ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#BE123C]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Techo excedido
                        </span>
                      ) : item.alertaPreventivaPresupuesto ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B45309]">
                          <AlertTriangle className="h-3.5 w-3.5 text-[#D97706]" />
                          Preventiva gasto (≥85%)
                        </span>
                      ) : item.puntajeGlobal >= 75 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          En meta ({item.puntajeGlobal} pts)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B45309]">
                          <MinusCircle className="h-3.5 w-3.5" />
                          Rezagada ({item.puntajeGlobal} pts)
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {isCreador && (
                          <button
                            type="button"
                            onClick={() => {
                              const m = metas.find(
                                (mt) => mt.sucursal_id === item.sucursal.id
                              );
                              setAdjustFeedback(null);
                              setAdjustTab('montos');
                              setAdjustMetaForm({
                                meta_llamadas_diarias: String(
                                  m?.meta_llamadas_diarias ??
                                    item.sucursal.meta_llamadas_diarias ??
                                    30
                                ),
                                meta_actividades_diarias: String(
                                  m?.meta_actividades_diarias ??
                                    item.sucursal.meta_actividades_diarias ??
                                    9
                                ),
                                meta_refrendos_mensual: String(
                                  m?.meta_refrendos_mensual ??
                                    item.sucursal.meta_refrendos_mensual ??
                                    40
                                ),
                                techo_gasto_mensual: String(
                                  m?.techo_gasto_mensual ??
                                    item.sucursal.techo_gasto_mensual ??
                                    0
                                ),
                              });
                              setTargetAccumRefrendos(
                                String(item.montoRefrendos)
                              );
                              setTargetAccumGastos(String(item.gastoRealTotal));
                              setAdjustRecordForm({
                                editingId: '',
                                tipo: 'Refrendo',
                                concepto: '',
                                monto_real: '',
                                presupuesto_limite: String(
                                  item.gastoPresupuestoTotal
                                ),
                                cantidad_refrendos: '1',
                                fecha: fechaHasta || todayStr,
                                notas: '',
                              });
                              setAdjustModalBranchId(item.sucursal.id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#5B21B6] bg-[#F3ECFC] hover:bg-[#E7DAFA] transition-colors"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Ajustar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSucursal(item.sucursal.id);
                            onNavigateSection(
                              item.excedioPresupuesto ? 'gastos' : 'llamadas'
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6D28D9] hover:bg-[#F3ECFC] transition-colors whitespace-nowrap"
                        >
                          Auditar
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Creator Direct Adjustment Modal (Metas, Techos & Acumulados/Montos) */}
      {isCreador && adjustModalBranchId && (() => {
        const branchSummary =
          activeSummaries.find((s) => s.sucursal.id === adjustModalBranchId) ||
          summaries.find((s) => s.sucursal.id === adjustModalBranchId);
        const branchObj =
          branchSummary?.sucursal ||
          sucursales.find((s) => s.id === adjustModalBranchId);
        if (!branchObj) return null;

        const branchMovements = gastosYRefrendos
          .filter((r) => {
            if (r.sucursal_id !== branchObj.id) return false;
            if (fechaDesde && (r.fecha || '') < fechaDesde) return false;
            if (fechaHasta && (r.fecha || '') > fechaHasta) return false;
            return true;
          })
          .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

        const handleSaveBranchMetas = async (e: React.FormEvent) => {
          e.preventDefault();
          if (!onSaveMeta || !onSaveSucursal) return;
          setSavingAdjust(true);
          setAdjustFeedback(null);
          try {
            const existingMeta = metas.find(
              (m) => m.sucursal_id === branchObj.id
            );
            const nextMeta: MetaSucursal = {
              id: existingMeta?.id || `meta-${branchObj.id}`,
              sucursal_id: branchObj.id,
              meta_llamadas_diarias:
                Number(adjustMetaForm.meta_llamadas_diarias) || 30,
              meta_actividades_diarias:
                Number(adjustMetaForm.meta_actividades_diarias) || 9,
              meta_refrendos_mensual: parseMoneyInput(
                adjustMetaForm.meta_refrendos_mensual
              ),
              techo_gasto_mensual: parseMoneyInput(
                adjustMetaForm.techo_gasto_mensual
              ),
            };
            const resM = await onSaveMeta(nextMeta);
            if (!resM.ok) {
              setAdjustFeedback({
                type: 'error',
                message: resM.error || 'No se pudo guardar en metas_sucursal.',
              });
              return;
            }
            const resS = await onSaveSucursal({
              ...branchObj,
              meta_llamadas_diarias: nextMeta.meta_llamadas_diarias,
              meta_actividades_diarias: nextMeta.meta_actividades_diarias,
              meta_refrendos_mensual: nextMeta.meta_refrendos_mensual,
              techo_gasto_mensual: nextMeta.techo_gasto_mensual,
            });
            if (!resS.ok) {
              setAdjustFeedback({
                type: 'error',
                message: resS.error || 'No se pudo guardar en sucursales_config.',
              });
              return;
            }
            setAdjustFeedback({
              type: 'success',
              message: `Metas y techo actualizados en Supabase para ${branchObj.nombre}.`,
            });
          } finally {
            setSavingAdjust(false);
          }
        };

        const handleApplyAccumulatedTarget = async (
          tipo: 'Refrendo' | 'Gasto'
        ) => {
          if (!onCreateGastoORefrendo) return;
          const currentSum =
            tipo === 'Refrendo'
              ? branchSummary?.montoRefrendos || 0
              : branchSummary?.gastoRealTotal || 0;
          const desired = parseMoneyInput(
            tipo === 'Refrendo' ? targetAccumRefrendos : targetAccumGastos
          );
          const delta = roundMoney2(desired - currentSum);
          if (Math.abs(delta) < 0.01) {
            setAdjustFeedback({
              type: 'success',
              message: `El acumulado de ${tipo.toLowerCase()}s ya coincide con ${formatCurrencyClean(desired)}.`,
            });
            return;
          }
          setSavingAdjust(true);
          setAdjustFeedback(null);
          try {
            const adj: GastoYRefrendo = {
              id: `gr-${Date.now()}`,
              sucursal_id: branchObj.id,
              sucursal_nombre: branchObj.nombre,
              sucursal: branchObj.nombre,
              cajera_nombre: branchObj.responsable_caja || 'Administración',
              tipo,
              categoria: 'Ajuste administrativo',
              concepto: `Ajuste directo acumulado (${formatCurrencyClean(currentSum)} → ${formatCurrencyClean(desired)})`,
              monto_real: delta,
              presupuesto_limite:
                tipo === 'Gasto'
                  ? parseMoneyInput(adjustMetaForm.techo_gasto_mensual)
                  : 0,
              cantidad_refrendos: 0,
              meta_refrendos:
                tipo === 'Refrendo'
                  ? parseMoneyInput(adjustMetaForm.meta_refrendos_mensual)
                  : 0,
              fecha: fechaHasta || todayStr,
              responsable: 'Creador / Administrador',
              evidencia_url: null,
              notas: 'Ajuste aplicado desde Panel de control',
            };
            const res = await onCreateGastoORefrendo(adj);
            if (!res.ok) {
              setAdjustFeedback({
                type: 'error',
                message: res.error || 'No se pudo aplicar el ajuste acumulado.',
              });
              return;
            }
            const techoSuc = roundMoney2(
              metas.find((m) => m.sucursal_id === branchObj.id)
                ?.techo_gasto_mensual ?? branchObj.techo_gasto_mensual ?? 0
            );
            let gastoNote = '';
            if (tipo === 'Gasto' && techoSuc > 0) {
              const pctAfter = roundMoney2((desired / techoSuc) * 100);
              if (desired > techoSuc) {
                gastoNote = ` · ALERTA ROJA: supera el techo de ${formatCurrencyClean(techoSuc)} (${pctAfter.toFixed(1)}%).`;
              } else if (pctAfter >= 85) {
                gastoNote = ` · ALERTA PREVENTIVA: alcanza el ${pctAfter.toFixed(1)}% del techo (${formatCurrencyClean(techoSuc)}).`;
              }
            }
            setAdjustFeedback({
              type: 'success',
              message: `Acumulado de ${tipo.toLowerCase()}s ajustado a ${formatCurrencyClean(desired)} en Supabase.${gastoNote}`,
            });
          } finally {
            setSavingAdjust(false);
          }
        };

        const handleSaveMovementRecord = async (e: React.FormEvent) => {
          e.preventDefault();
          if (!adjustRecordForm.concepto.trim()) return;
          setSavingAdjust(true);
          setAdjustFeedback(null);
          try {
            const existingRec = adjustRecordForm.editingId
              ? branchMovements.find((r) => r.id === adjustRecordForm.editingId)
              : undefined;
            const payloadRec: GastoYRefrendo = {
              ...(existingRec || {
                id: `gr-${Date.now()}`,
                sucursal_id: branchObj.id,
                sucursal_nombre: branchObj.nombre,
                sucursal: branchObj.nombre,
                cajera_nombre: branchObj.responsable_caja || 'Administración',
                categoria: 'Operación de Sucursal',
                responsable: 'Creador / Administrador',
                evidencia_url: null,
              }),
              tipo: adjustRecordForm.tipo,
              concepto: adjustRecordForm.concepto.trim(),
              monto_real: parseMoneyInput(adjustRecordForm.monto_real),
              presupuesto_limite:
                adjustRecordForm.tipo === 'Gasto'
                  ? parseMoneyInput(adjustRecordForm.presupuesto_limite)
                  : 0,
              cantidad_refrendos:
                adjustRecordForm.tipo === 'Refrendo'
                  ? Number(adjustRecordForm.cantidad_refrendos) || 0
                  : 0,
              meta_refrendos:
                adjustRecordForm.tipo === 'Refrendo'
                  ? parseMoneyInput(adjustMetaForm.meta_refrendos_mensual)
                  : 0,
              fecha: adjustRecordForm.fecha || todayStr,
              notas: adjustRecordForm.notas.trim(),
            };

            const res =
              existingRec && onUpdateGastoORefrendo
                ? await onUpdateGastoORefrendo(payloadRec)
                : onCreateGastoORefrendo
                  ? await onCreateGastoORefrendo(payloadRec)
                  : { ok: false, error: 'Operación no disponible' };

            if (!res.ok) {
              setAdjustFeedback({
                type: 'error',
                message: res.error || 'No se pudo guardar el movimiento.',
              });
              return;
            }
            const savedType = adjustRecordForm.tipo;
            const savedFecha = adjustRecordForm.fecha || todayStr;
            const savedMonto = payloadRec.monto_real;
            const techoSuc = roundMoney2(
              metas.find((m) => m.sucursal_id === branchObj.id)
                ?.techo_gasto_mensual ?? branchObj.techo_gasto_mensual ?? 0
            );
            let ceilingMsg = '';
            if (savedType === 'Gasto' && techoSuc > 0) {
              const monthKey = savedFecha.slice(0, 7);
              const existingMonthGastos = gastosYRefrendos.filter(
                (r) =>
                  r.id !== payloadRec.id &&
                  r.tipo === 'Gasto' &&
                  r.sucursal_id === branchObj.id &&
                  (r.fecha || '').startsWith(monthKey)
              );
              const newTotal = roundMoney2(
                existingMonthGastos.reduce(
                  (acc, r) => acc + (Number(r.monto_real) || 0),
                  0
                ) + savedMonto
              );
              const pct = roundMoney2((newTotal / techoSuc) * 100);
              if (newTotal > techoSuc) {
                ceilingMsg = ` · ALERTA ROJA: acumulado ${formatCurrencyClean(newTotal)} supera el techo de ${formatCurrencyClean(techoSuc)} (${pct.toFixed(1)}%).`;
              } else if (pct >= 85) {
                ceilingMsg = ` · ALERTA PREVENTIVA: acumulado ${formatCurrencyClean(newTotal)} al ${pct.toFixed(1)}% del techo (${formatCurrencyClean(techoSuc)}).`;
              }
            }
            setAdjustRecordForm({
              editingId: '',
              tipo: adjustRecordForm.tipo,
              concepto: '',
              monto_real: '',
              presupuesto_limite: adjustMetaForm.techo_gasto_mensual,
              cantidad_refrendos: '1',
              fecha: fechaHasta || todayStr,
              notas: '',
            });
            setAdjustFeedback({
              type: 'success',
              message: `${
                existingRec
                  ? 'Registro actualizado en Supabase.'
                  : 'Movimiento registrado en Supabase.'
              }${ceilingMsg}`,
            });
          } finally {
            setSavingAdjust(false);
          }
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/50 backdrop-blur-[2px]"
            onClick={() => setAdjustModalBranchId(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-[#E6DDF5] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1ECF9]">
                <div>
                  <h3 className="font-display text-base font-bold text-[#1F172B]">
                    Ajuste directo · {branchObj.nombre}
                  </h3>
                  <p className="text-xs text-[#7A6B93]">
                    Modifica montos registrados, acumulados, metas o techos directamente en Supabase.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdjustModalBranchId(null)}
                  className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-6 pt-3 border-b border-[#F1ECF9] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-[#F5F0FC] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAdjustTab('montos')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      adjustTab === 'montos'
                        ? 'bg-white text-[#5B21B6] shadow-xs'
                        : 'text-[#6E5F87]'
                    }`}
                  >
                    Montos y Acumulados
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustTab('metas')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      adjustTab === 'metas'
                        ? 'bg-white text-[#5B21B6] shadow-xs'
                        : 'text-[#6E5F87]'
                    }`}
                  >
                    Metas y Techo de gasto
                  </button>
                </div>

                <select
                  value={branchObj.id}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const nextSum = activeSummaries.find(
                      (s) => s.sucursal.id === nextId
                    );
                    const nextSuc = sucursales.find((s) => s.id === nextId);
                    const nextM = metas.find((mt) => mt.sucursal_id === nextId);
                    setAdjustFeedback(null);
                    setAdjustModalBranchId(nextId);
                    setAdjustMetaForm({
                      meta_llamadas_diarias: String(
                        nextM?.meta_llamadas_diarias ??
                          nextSuc?.meta_llamadas_diarias ??
                          30
                      ),
                      meta_actividades_diarias: String(
                        nextM?.meta_actividades_diarias ??
                          nextSuc?.meta_actividades_diarias ??
                          9
                      ),
                      meta_refrendos_mensual: String(
                        nextM?.meta_refrendos_mensual ??
                          nextSuc?.meta_refrendos_mensual ??
                          40
                      ),
                      techo_gasto_mensual: String(
                        nextM?.techo_gasto_mensual ??
                          nextSuc?.techo_gasto_mensual ??
                          0
                      ),
                    });
                    setTargetAccumRefrendos(
                      String(nextSum?.montoRefrendos ?? 0)
                    );
                    setTargetAccumGastos(String(nextSum?.gastoRealTotal ?? 0));
                  }}
                  className="px-3 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#5B21B6]"
                >
                  {sucursales
                    .filter((s) => s.activa)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-6 overflow-y-auto space-y-5">
                {adjustFeedback && (
                  <div
                    role="alert"
                    className={`rounded-xl px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-2 border ${
                      adjustFeedback.type === 'error'
                        ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
                        : 'bg-[#ECFDF5] border-[#BBF7D0] text-[#15803D]'
                    }`}
                  >
                    <span>{adjustFeedback.message}</span>
                    <button
                      type="button"
                      onClick={() => setAdjustFeedback(null)}
                      className="font-bold underline shrink-0"
                    >
                      Cerrar
                    </button>
                  </div>
                )}

                {adjustTab === 'metas' ? (
                  <form onSubmit={handleSaveBranchMetas} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#55476E] mb-1">
                          Meta refrendos/mes ($ o cantidad)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={adjustMetaForm.meta_refrendos_mensual}
                          onChange={(e) =>
                            setAdjustMetaForm({
                              ...adjustMetaForm,
                              meta_refrendos_mensual: e.target.value,
                            })
                          }
                          placeholder="Ej. 1808484.55"
                          className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#55476E] mb-1">
                          Techo máximo de gasto ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={adjustMetaForm.techo_gasto_mensual}
                          onChange={(e) =>
                            setAdjustMetaForm({
                              ...adjustMetaForm,
                              techo_gasto_mensual: e.target.value,
                            })
                          }
                          placeholder="Ej. 294878.63"
                          className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#55476E] mb-1">
                          Meta llamadas/día
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={adjustMetaForm.meta_llamadas_diarias}
                          onChange={(e) =>
                            setAdjustMetaForm({
                              ...adjustMetaForm,
                              meta_llamadas_diarias: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#55476E] mb-1">
                          Meta actividades/día
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={adjustMetaForm.meta_actividades_diarias}
                          onChange={(e) =>
                            setAdjustMetaForm({
                              ...adjustMetaForm,
                              meta_actividades_diarias: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={savingAdjust}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingAdjust
                          ? 'Guardando...'
                          : 'Guardar metas y techo en Supabase'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    {/* Direct Accumulated Value Adjustment */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-[#EAE3F5] bg-[#FAF8FC] p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#1F172B]">
                            Acumulado Refrendos
                          </span>
                          <span className="font-mono-num text-[#6D28D9] font-bold">
                            Actual:{' '}
                            {formatCurrencyClean(
                              branchSummary?.montoRefrendos ?? 0
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={targetAccumRefrendos}
                            onChange={(e) =>
                              setTargetAccumRefrendos(e.target.value)
                            }
                            placeholder="Ej. 1808484.55"
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] bg-white text-xs font-mono-num"
                          />
                          <button
                            type="button"
                            disabled={savingAdjust}
                            onClick={() =>
                              void handleApplyAccumulatedTarget('Refrendo')
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#EAE3F5] bg-[#FAF8FC] p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#1F172B]">
                            Acumulado Gastos
                          </span>
                          <span className="font-mono-num text-[#BE185D] font-bold">
                            Actual:{' '}
                            {formatCurrencyClean(
                              branchSummary?.gastoRealTotal ?? 0
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={targetAccumGastos}
                            onChange={(e) =>
                              setTargetAccumGastos(e.target.value)
                            }
                            placeholder="Ej. 294878.63"
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] bg-white text-xs font-mono-num"
                          />
                          <button
                            type="button"
                            disabled={savingAdjust}
                            onClick={() =>
                              void handleApplyAccumulatedTarget('Gasto')
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#DB2777] hover:bg-[#BE185D] text-white disabled:opacity-50"
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Add or Edit Individual Movement */}
                    <form
                      onSubmit={handleSaveMovementRecord}
                      className="rounded-xl border border-[#EAE3F5] p-4 space-y-3 bg-white"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[#1F172B]">
                          {adjustRecordForm.editingId
                            ? 'Editando movimiento seleccionado'
                            : 'Agregar movimiento o ajuste manual'}
                        </h4>
                        {adjustRecordForm.editingId && (
                          <button
                            type="button"
                            onClick={() =>
                              setAdjustRecordForm({
                                editingId: '',
                                tipo: 'Refrendo',
                                concepto: '',
                                monto_real: '',
                                presupuesto_limite:
                                  adjustMetaForm.techo_gasto_mensual,
                                cantidad_refrendos: '1',
                                fecha: fechaHasta || todayStr,
                                notas: '',
                              })
                            }
                            className="text-[11px] font-semibold text-[#6E5F87] hover:underline"
                          >
                            Cancelar edición
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <select
                          value={adjustRecordForm.tipo}
                          onChange={(e) =>
                            setAdjustRecordForm({
                              ...adjustRecordForm,
                              tipo: e.target.value as 'Refrendo' | 'Gasto',
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-xs font-semibold"
                        >
                          <option value="Refrendo">Refrendo</option>
                          <option value="Gasto">Gasto</option>
                        </select>
                        <input
                          type="date"
                          value={adjustRecordForm.fecha}
                          onChange={(e) =>
                            setAdjustRecordForm({
                              ...adjustRecordForm,
                              fecha: e.target.value,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-xs font-mono-num"
                        />
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="Monto ($)"
                          value={adjustRecordForm.monto_real}
                          onChange={(e) =>
                            setAdjustRecordForm({
                              ...adjustRecordForm,
                              monto_real: e.target.value,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-xs font-mono-num"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Concepto *"
                          value={adjustRecordForm.concepto}
                          onChange={(e) =>
                            setAdjustRecordForm({
                              ...adjustRecordForm,
                              concepto: e.target.value,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-[#E6DDF5] text-xs"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="submit"
                          disabled={savingAdjust}
                          className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
                        >
                          {adjustRecordForm.editingId ? (
                            <Save className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          {adjustRecordForm.editingId
                            ? 'Actualizar registro'
                            : 'Guardar movimiento'}
                        </button>
                      </div>
                    </form>

                    {/* Existing Branch Movements List */}
                    <div className="border border-[#EAE3F5] rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-[#FAF8FC] border-b border-[#F1ECF9] text-xs font-bold text-[#1F172B]">
                        Movimientos en el periodo ({branchMovements.length})
                      </div>
                      {branchMovements.length === 0 ? (
                        <p className="p-4 text-xs text-[#7A6B93] text-center">
                          Sin movimientos registrados en el rango actual.
                        </p>
                      ) : (
                        <div className="max-h-52 overflow-y-auto divide-y divide-[#F3EEF9]">
                          {branchMovements.map((mov) => (
                            <div
                              key={mov.id}
                              className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#FCFAFE]"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-semibold ${
                                      mov.tipo === 'Refrendo'
                                        ? 'text-[#BE185D]'
                                        : 'text-[#6D28D9]'
                                    }`}
                                  >
                                    {mov.tipo}
                                  </span>
                                  <span className="font-mono-num text-[#8B7CA5]">
                                    {mov.fecha}
                                  </span>
                                  <span className="font-medium text-[#1F172B] truncate">
                                    {mov.concepto}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono-num font-bold text-[#1F172B]">
                                  {formatCurrencyClean(mov.monto_real)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAdjustRecordForm({
                                      editingId: mov.id,
                                      tipo: mov.tipo,
                                      concepto: mov.concepto,
                                      monto_real: String(mov.monto_real),
                                      presupuesto_limite: String(
                                        mov.presupuesto_limite
                                      ),
                                      cantidad_refrendos: String(
                                        mov.cantidad_refrendos
                                      ),
                                      fecha: mov.fecha,
                                      notas: mov.notas || '',
                                    })
                                  }
                                  title="Editar este monto"
                                  className="p-1 rounded-lg text-[#5B21B6] hover:bg-[#F3ECFC]"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                {onDeleteGastoORefrendo && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void onDeleteGastoORefrendo(mov)
                                    }
                                    title="Eliminar movimiento"
                                    className="p-1 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Evidence Photo Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/70 backdrop-blur-[2px]"
          onClick={() => setLightboxImg(null)}
        >
          <div
            className="max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#E6DDF5]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F1ECF9]">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1F172B] truncate">
                  {lightboxImg.title}
                </p>
                <p className="text-xs text-[#7A6B93] truncate">
                  {lightboxImg.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxImg(null)}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
                aria-label="Cerrar imagen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 bg-[#FAF8FC] flex items-center justify-center max-h-[75vh]">
              <img
                src={lightboxImg.url}
                alt={lightboxImg.title}
                className="max-h-[68vh] w-auto rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
