import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Image as ImageIcon,
  MinusCircle,
  ShieldCheck,
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
  formatHora12h,
  formatMXN,
  formatPercent,
  getDiaSemanaFromDate,
  getTodayLocalYYYYMMDD,
  resolveDailyTasksForBranch,
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
}) => {
  const isCreador = userRole === 'creador';
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => getTodayLocalYYYYMMDD(), []);
  const [panelTab, setPanelTab] = useState<PanelTabId>('resumen');
  const [criterion, setCriterion] = useState<RankingCriterion>('consolidado');
  const [filterMes, setFilterMes] = useState<string>('todos');
  const [filterAnio, setFilterAnio] = useState<string>(
    String(now.getFullYear())
  );
  const [filterCajera, setFilterCajera] = useState<string>('todas');
  const [validacionFecha, setValidacionFecha] = useState<string>(todayStr);
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

  const yearOptions = useMemo(() => {
    const curr = now.getFullYear();
    return ['todos', String(curr - 1), String(curr), String(curr + 1)];
  }, [now]);

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
      filterCajera !== 'todas';

    const monthPrefix =
      filterAnio !== 'todos' && filterMes !== 'todos'
        ? `${filterAnio}-${filterMes}`
        : filterAnio !== 'todos'
          ? filterAnio
          : 'todos';

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
    const metaRefrendos = activeSummaries.reduce(
      (acc, s) => acc + s.refrendosMeta,
      0
    );
    const montoRefrendos = activeSummaries.reduce(
      (acc, s) => acc + s.montoRefrendos,
      0
    );
    const excedidas = activeSummaries.filter((s) => s.excedioPresupuesto).length;
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
      excedidas,
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
          detalle: `Exceso de ${formatMXN(item.excesoDinero)} (+${formatPercent(item.excesoPorcentaje)}) sobre límite`,
          severity: 'danger',
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
          detalle: `${item.actividadesVencidas} actividad(es) vencida(s) hoy sin evidencia`,
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
          detalle: `${item.refrendosRealizados}/${item.refrendosMeta} (${formatPercent(item.pctRefrendos, 0)} de meta)`,
          severity: 'warn',
          targetSection: 'gastos',
        });
      }
    }

    return alerts;
  }, [activeSummaries]);

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
              ? `${s.actividadesCompletadas}/${s.actividadesTotal} hoy (${formatPercent(s.pctActividades, 1)})`
              : '0/0 hoy (Sin asignadas)',
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
            ? `${formatMXN(s.gastoRealTotal)} / ${formatMXN(s.gastoPresupuestoTotal)} (+${formatPercent(s.excesoPorcentaje)})`
            : `${formatMXN(s.gastoRealTotal)} / ${formatMXN(s.gastoPresupuestoTotal)} (${formatPercent(s.pctUsoPresupuesto, 0)})`,
          status: s.excedioPresupuesto ? 'Techo excedido' : 'Dentro del límite',
          tone: s.excedioPresupuesto ? 'danger' : 'good',
        };
      case 'refrendos':
        return {
          pct: Math.min(100, s.pctRefrendos),
          display: `${s.refrendosRealizados}/${s.refrendosMeta} · ${formatMXN(s.montoRefrendos)}`,
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
            onChange={(e) => setFilterMes(e.target.value)}
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
            onChange={(e) => setFilterAnio(e.target.value)}
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
      </section>

      {/* Top Executive KPI Strip (shown in Resumen & Avance) */}
      {(panelTab === 'resumen' || panelTab === 'avance') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            Cumplimiento real de actividades hoy
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
              {formatPercent(totals.promedioActividades, 1)}
            </span>
            <span className="font-mono-num text-xs text-[#6E5F87]">
              {totals.totalActividadesCompletadas}/
              {totals.totalActividadesAsignadas} hoy
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            Techo de gasto por sucursal
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
              {totals.dentroLimite}/{activeSummaries.length}
            </span>
            <span
              className={`text-xs font-medium ${
                totals.excedidas > 0 ? 'text-[#BE123C]' : 'text-[#15803D]'
              }`}
            >
              {totals.excedidas > 0
                ? `${totals.excedidas} excedieron techo`
                : 'Todas dentro del límite'}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            Refrendos acumulados
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
              {totals.totalRefrendos}
              <span className="text-sm font-normal text-[#8B7CA5]">
                /{totals.metaRefrendos}
              </span>
            </span>
            <span className="font-mono-num text-xs font-medium text-[#6D28D9]">
              {formatMXN(totals.montoRefrendos)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            Avance diario de llamadas
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
                        {formatMXN(item.gastoRealTotal)}
                        <span className="text-xs text-[#8B7CA5]">
                          {' '}
                          / {formatMXN(item.gastoPresupuestoTotal)}
                        </span>
                      </div>
                      {item.excedioPresupuesto ? (
                        <div className="text-xs font-semibold text-[#BE123C]">
                          +{formatMXN(item.excesoDinero)} (+
                          {formatPercent(item.excesoPorcentaje)}) excedido
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
                        {item.refrendosRealizados}/{item.refrendosMeta}
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

                    <td className="py-3.5 px-4 text-right">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

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
