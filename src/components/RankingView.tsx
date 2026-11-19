import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  MinusCircle,
  Trophy,
} from 'lucide-react';
import { BranchMetricSummary, SectionId } from '../types/controlops';
import { formatMXN, formatPercent } from '../utils/calculations';

type RankingCriterion =
  | 'consolidado'
  | 'actividades'
  | 'gastos'
  | 'refrendos'
  | 'llamadas';

interface RankingViewProps {
  summaries: BranchMetricSummary[];
  selectedSucursalId: string;
  onSelectSucursal: (id: string) => void;
  onNavigateSection: (section: SectionId) => void;
}

const CRITERIA_TABS: { id: RankingCriterion; label: string }[] = [
  { id: 'consolidado', label: 'Vista Consolidada' },
  { id: 'actividades', label: 'Actividades' },
  { id: 'gastos', label: 'Gastos (Techo Máximo)' },
  { id: 'refrendos', label: 'Refrendos' },
  { id: 'llamadas', label: 'Llamadas' },
];

export const RankingView: React.FC<RankingViewProps> = ({
  summaries,
  selectedSucursalId,
  onSelectSucursal,
  onNavigateSection,
}) => {
  const [criterion, setCriterion] = useState<RankingCriterion>('consolidado');

  const totals = useMemo(() => {
    const totalLlamadas = summaries.reduce(
      (acc, s) => acc + s.llamadasRegistradas,
      0
    );
    const metaLlamadas = summaries.reduce((acc, s) => acc + s.metaLlamadas, 0);
    const totalRefrendos = summaries.reduce(
      (acc, s) => acc + s.refrendosRealizados,
      0
    );
    const metaRefrendos = summaries.reduce(
      (acc, s) => acc + s.refrendosMeta,
      0
    );
    const montoRefrendos = summaries.reduce(
      (acc, s) => acc + s.montoRefrendos,
      0
    );
    const excedidas = summaries.filter((s) => s.excedioPresupuesto).length;
    const dentroLimite = summaries.length - excedidas;
    const promedioActividades =
      summaries.length > 0
        ? summaries.reduce((acc, s) => acc + s.pctActividades, 0) /
          summaries.length
        : 0;

    return {
      totalLlamadas,
      metaLlamadas,
      totalRefrendos,
      metaRefrendos,
      montoRefrendos,
      excedidas,
      dentroLimite,
      promedioActividades,
    };
  }, [summaries]);

  const sortedSummaries = useMemo(() => {
    const copy = [...summaries];
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
  }, [summaries, criterion]);

  const getChartValue = (s: BranchMetricSummary) => {
    switch (criterion) {
      case 'actividades':
        return {
          pct: s.pctActividades,
          display: `${s.actividadesCompletadas}/${s.actividadesTotal} (${formatPercent(s.pctActividades, 0)})`,
          status:
            s.pctActividades >= 80 && s.actividadesVencidas === 0
              ? 'En meta'
              : 'Por debajo',
          tone:
            s.pctActividades >= 80 && s.actividadesVencidas === 0
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
          display: `${s.llamadasRegistradas}/${s.metaLlamadas} registradas · ${s.llamadasVerificadas} verif.`,
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
      {/* Top Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            Cumplimiento de actividades
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
              {formatPercent(totals.promedioActividades, 0)}
            </span>
            <span className="text-xs text-[#6E5F87]">
              {summaries.length} sucursales activas
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5">
          <p className="text-xs font-medium text-[#7A6B93]">
            Techo de gasto por sucursal
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-[#1F172B] tabular-nums">
              {totals.dentroLimite}/{summaries.length}
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

      {/* Comparative Criterion Selector & Bar Comparison */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 md:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#1F172B]">
              Comparativa de sucursales (mayor a menor)
            </h2>
            <p className="text-xs text-[#7A6B93] mt-0.5">
              {criterion === 'gastos'
                ? 'Ordenadas de mejor disciplina presupuestal (bajo techo máximo) a mayor sobrecosto.'
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
                    style={{ width: `${Math.max(4, Math.min(100, metric.pct))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Consolidated Matrix Table */}
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
                        {formatPercent(item.pctActividades, 0)})
                      </div>
                      <div
                        className={`text-xs ${
                          item.actividadesVencidas > 0
                            ? 'text-[#BE123C]'
                            : item.pctActividades >= 80
                              ? 'text-[#15803D]'
                              : 'text-[#B45309]'
                        }`}
                      >
                        {item.actividadesVencidas > 0
                          ? `${item.actividadesVencidas} vencida(s)`
                          : item.pctActividades >= 80
                            ? 'En meta'
                            : 'Por debajo'}
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
                        {item.llamadasVerificadas} verif. · {item.llamadasFalsas}{' '}
                        falsas
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
    </div>
  );
};
