import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BellOff,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Image as ImageIcon,
  MapPin,
  PhoneCall,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  ActividadDiaria,
  DiaSemana,
  GastoYRefrendo,
  HorarioSucursalDia,
  LlamadaSucursal,
  MetaSucursal,
  Sucursal,
  UsuarioControlOps,
} from '../types/controlops';
import {
  evaluarVencimientoActividad,
  formatCurrencyClean,
  formatHora12h,
  getCurrentLocalHHMM,
  getDiaSemanaFromDate,
} from '../utils/calculations';
import { uploadEvidenciaFoto } from '../services/controlOpsService';

interface CajeraMiDiaViewProps {
  currentUser: UsuarioControlOps;
  sucursal: Sucursal;
  metaSucursal?: MetaSucursal;
  actividades: ActividadDiaria[];
  llamadas: LlamadaSucursal[];
  gastosYRefrendos: GastoYRefrendo[];
  horarios: HorarioSucursalDia[];
  diaActivo: DiaSemana;
  onUpdateActividad: (updated: ActividadDiaria) => Promise<unknown>;
}

export const CajeraMiDiaView: React.FC<CajeraMiDiaViewProps> = ({
  currentUser,
  sucursal,
  metaSucursal,
  actividades,
  llamadas,
  gastosYRefrendos,
  horarios,
  diaActivo,
  onUpdateActividad,
}) => {
  const [notifDenied, setNotifDenied] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifDenied(Notification.permission === 'denied');
    }
  }, []);

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentDay = now.getDate();
  const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
  const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const formattedDate = useMemo(() => {
    const raw = now.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return raw.charAt(0).toLowerCase() + raw.slice(1);
  }, [now]);

  const monthYearUpper = useMemo(() => {
    return now
      .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
      .replace(' de ', ' ')
      .toUpperCase();
  }, [now]);

  const horarioHoy = useMemo(
    () =>
      horarios.find(
        (h) => h.sucursal_id === sucursal.id && h.dia === diaActivo
      ),
    [horarios, sucursal.id, diaActivo]
  );

  // Branch-scoped records
  const branchActividades = useMemo(
    () => actividades.filter((a) => a.sucursal_id === sucursal.id),
    [actividades, sucursal.id]
  );

  const tareasHoy = useMemo(() => {
    return branchActividades.filter(
      (a) =>
        !a.dias_semana ||
        a.dias_semana.length === 0 ||
        a.dias_semana.includes(diaActivo)
    );
  }, [branchActividades, diaActivo]);

  const branchLlamadas = useMemo(
    () => llamadas.filter((l) => l.sucursal_id === sucursal.id),
    [llamadas, sucursal.id]
  );

  const branchGastosRefrendos = useMemo(
    () => gastosYRefrendos.filter((g) => g.sucursal_id === sucursal.id),
    [gastosYRefrendos, sucursal.id]
  );

  // KPI 1: ACTIVIDADES DIARIAS (monthly & today)
  const kpiActividades = useMemo(() => {
    const asignadasHoy = tareasHoy.length;
    const completadasHoy = tareasHoy.filter(
      (a) => a.estatus === 'Completada'
    ).length;

    const delMes = branchActividades.filter((a) =>
      a.fecha?.startsWith(currentMonthPrefix)
    );
    const fuenteMes = delMes.length > 0 ? delMes : tareasHoy;
    const completadasMes = fuenteMes.filter(
      (a) => a.estatus === 'Completada'
    ).length;
    const totalMes = Math.max(fuenteMes.length, completadasMes, 1);
    const pctMes = Math.min(100, Math.round((completadasMes / totalMes) * 100));

    return {
      completadasMes,
      totalMes: fuenteMes.length,
      pctMes,
      completadasHoy,
      asignadasHoy,
    };
  }, [branchActividades, tareasHoy, currentMonthPrefix]);

  // KPI 2: METAS DE REFRENDOS (in clean MXN, max 2 decimals)
  const kpiRefrendos = useMemo(() => {
    const refrendosMes = branchGastosRefrendos.filter(
      (r) => r.tipo === 'Refrendo' && r.fecha?.startsWith(currentMonthPrefix)
    );
    const refrendosFuente =
      refrendosMes.length > 0
        ? refrendosMes
        : branchGastosRefrendos.filter((r) => r.tipo === 'Refrendo');

    const montoAcumuladoRaw = refrendosFuente.reduce(
      (acc, r) => acc + (Number(r.monto_real) || 0),
      0
    );
    const montoAcumulado = Math.round(montoAcumuladoRaw * 100) / 100;

    const rawMeta =
      metaSucursal?.meta_refrendos_mensual ??
      sucursal.meta_refrendos_mensual ??
      0;

    // Si meta_refrendos_mensual < 500 representa cantidad de operaciones, convertir a meta monetaria estimada
    const totalOps = refrendosFuente.reduce(
      (acc, r) => acc + (Number(r.cantidad_refrendos) || 0),
      0
    );
    const avgTicket =
      totalOps > 0 && montoAcumulado > 0 ? montoAcumulado / totalOps : 3250;
    const metaMontoRaw = rawMeta >= 500 ? rawMeta : rawMeta * avgTicket;
    const metaMonto = Math.round(metaMontoRaw * 100) / 100;

    const faltante = Math.max(
      0,
      Math.round((metaMonto - montoAcumulado) * 100) / 100
    );
    const pct =
      metaMonto > 0
        ? Math.min(100, Math.round((montoAcumulado / metaMonto) * 100))
        : 0;

    return {
      montoAcumulado,
      metaMonto,
      faltante,
      pct,
    };
  }, [branchGastosRefrendos, currentMonthPrefix, metaSucursal, sucursal]);

  // KPI 3: TECHO DE GASTOS
  const kpiGastos = useMemo(() => {
    const gastosMes = branchGastosRefrendos.filter(
      (r) => r.tipo === 'Gasto' && r.fecha?.startsWith(currentMonthPrefix)
    );
    const gastosFuente =
      gastosMes.length > 0
        ? gastosMes
        : branchGastosRefrendos.filter((r) => r.tipo === 'Gasto');

    const gastoAcumulado =
      Math.round(
        gastosFuente.reduce((acc, g) => acc + (Number(g.monto_real) || 0), 0) *
          100
      ) / 100;

    const techoRaw =
      metaSucursal?.techo_gasto_mensual ?? sucursal.techo_gasto_mensual ?? 0;
    const techo = Math.round(techoRaw * 100) / 100;
    const sinTecho = techo <= 0;
    const excedido = !sinTecho && gastoAcumulado > techo;
    const exceso = excedido
      ? Math.round((gastoAcumulado - techo) * 100) / 100
      : 0;
    const disponible = !sinTecho && !excedido
      ? Math.round((techo - gastoAcumulado) * 100) / 100
      : 0;
    const pct =
      !sinTecho && techo > 0
        ? Math.min(100, Math.round((gastoAcumulado / techo) * 100))
        : 0;

    return {
      gastoAcumulado,
      techo,
      sinTecho,
      excedido,
      exceso,
      disponible,
      pct,
    };
  }, [branchGastosRefrendos, currentMonthPrefix, metaSucursal, sucursal]);

  // KPI 4: LLAMADAS DEL MES
  const kpiLlamadas = useMemo(() => {
    const metaDiaria =
      metaSucursal?.meta_llamadas_diarias ||
      sucursal.meta_llamadas_diarias ||
      30;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const metaMensual = metaDiaria * daysInMonth;

    const registradasMes = branchLlamadas.filter(
      (l) =>
        l.llamada_registrada &&
        (!l.fecha_registro || l.fecha_registro.startsWith(currentMonthPrefix))
    ).length;

    const hoy = branchLlamadas.filter(
      (l) =>
        l.llamada_registrada &&
        (!l.fecha_registro || l.fecha_registro.startsWith(todayStr))
    ).length;

    const pct =
      metaMensual > 0
        ? Math.min(100, Math.round((registradasMes / metaMensual) * 100))
        : 0;

    return {
      registradasMes,
      metaMensual,
      hoy,
      metaDiaria,
      pct,
    };
  }, [
    branchLlamadas,
    currentYear,
    currentMonth,
    currentMonthPrefix,
    todayStr,
    metaSucursal,
    sucursal,
  ]);

  // Daily breakdown rows for current month (DÍA 1 .. DÍA currentDay)
  const desgloseDiario = useMemo(() => {
    const metaDiaria =
      metaSucursal?.meta_llamadas_diarias ||
      sucursal.meta_llamadas_diarias ||
      30;

    const rows: {
      day: number;
      dateStr: string;
      weekdayShort: string;
      llamadasCount: number;
      metaLlamadas: number;
      refrendosMonto: number;
      gastosMonto: number;
      actCompletadas: number;
      actAsignadas: number;
    }[] = [];

    for (let d = 1; d <= currentDay; d++) {
      const dateStr = `${currentMonthPrefix}-${String(d).padStart(2, '0')}`;
      const diaSem = getDiaSemanaFromDate(dateStr);
      const weekdayShort = new Date(currentYear, currentMonth, d)
        .toLocaleDateString('es-MX', { weekday: 'short', month: 'short' })
        .replace('.', '');

      const llamadasCount = branchLlamadas.filter(
        (l) =>
          l.llamada_registrada &&
          (l.fecha_registro?.startsWith(dateStr) ||
            (!l.fecha_registro && dateStr === todayStr))
      ).length;

      const refrendosMonto =
        Math.round(
          branchGastosRefrendos
            .filter((g) => g.tipo === 'Refrendo' && g.fecha === dateStr)
            .reduce((acc, g) => acc + (Number(g.monto_real) || 0), 0) * 100
        ) / 100;

      const gastosMonto =
        Math.round(
          branchGastosRefrendos
            .filter((g) => g.tipo === 'Gasto' && g.fecha === dateStr)
            .reduce((acc, g) => acc + (Number(g.monto_real) || 0), 0) * 100
        ) / 100;

      // Actividades asignadas para ese día de la semana (o registradas explícitamente en esa fecha)
      const asignadasDiaList = branchActividades.filter(
        (a) =>
          !a.dias_semana ||
          a.dias_semana.length === 0 ||
          a.dias_semana.includes(diaSem)
      );
      const actAsignadas = asignadasDiaList.length;
      const actCompletadas = asignadasDiaList.filter(
        (a) =>
          a.estatus === 'Completada' &&
          (a.fecha === dateStr || (!a.fecha && dateStr === todayStr))
      ).length;

      rows.push({
        day: d,
        dateStr,
        weekdayShort,
        llamadasCount,
        metaLlamadas: metaDiaria,
        refrendosMonto,
        gastosMonto,
        actCompletadas,
        actAsignadas,
      });
    }

    return rows;
  }, [
    currentDay,
    currentMonthPrefix,
    currentYear,
    currentMonth,
    todayStr,
    branchLlamadas,
    branchGastosRefrendos,
    branchActividades,
    metaSucursal,
    sucursal,
  ]);

  const handleUploadEvidence = async (
    actividad: ActividadDiaria,
    file: File | undefined
  ) => {
    if (!file) return;
    setUploadingId(actividad.id);
    setUploadFeedback(null);
    try {
      const res = await uploadEvidenciaFoto(file, 'actividades', sucursal.id);
      const updated: ActividadDiaria = {
        ...actividad,
        estatus: 'Completada',
        hora_completada: getCurrentLocalHHMM(),
        fecha: todayStr,
        evidencia_url: res.url,
      };
      await onUpdateActividad(updated);
      setUploadFeedback(
        res.uploadedToSupabase
          ? `Evidencia de "${actividad.titulo}" guardada en Supabase.`
          : res.error ||
              `Evidencia de "${actividad.titulo}" guardada localmente.`
      );
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notification Permission Alert Banner */}
      {notifDenied && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] px-4 py-3 flex items-center gap-3 text-xs sm:text-sm text-[#BE123C] font-medium"
        >
          <BellOff className="h-4 w-4 shrink-0 text-[#E11D48]" />
          <span>
            Notificaciones bloqueadas: Permite las notificaciones de este sitio
            en los ajustes de tu navegador
          </span>
        </div>
      )}

      {/* Personalized Greeting Header */}
      <header className="space-y-1.5">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1F172B]">
          Hola, {currentUser.nombre}
        </h1>
        <p className="text-sm text-[#6E5F87] capitalize">{formattedDate}</p>
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] pt-0.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>
            {sucursal.nombre} · {sucursal.ciudad || 'Zona 1'}
          </span>
        </div>
      </header>

      {/* Section: Mi avance del periodo */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-bold text-[#1F172B]">
            Mi avance del periodo
          </h2>
          <span className="text-[11px] font-bold tracking-wider text-[#7A6B93] uppercase">
            {monthYearUpper}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* KPI 1: ACTIVIDADES DIARIAS */}
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5 flex flex-col justify-between gap-3 shadow-[0_2px_10px_rgba(124,58,237,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-[#7A6B93] uppercase">
                ACTIVIDADES DIARIAS
              </span>
              <div className="h-8 w-8 rounded-xl bg-[#F3ECFC] text-[#7C3AED] flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4" />
              </div>
            </div>

            <div className="font-mono-num text-2xl font-extrabold text-[#1F172B]">
              {kpiActividades.completadasMes}
              <span className="text-base font-semibold text-[#9D8FB5]">
                /{kpiActividades.totalMes}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-2 rounded-full bg-[#EFE9F8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#7C3AED] transition-all"
                    style={{ width: `${kpiActividades.pctMes}%` }}
                  />
                </div>
                <span className="font-mono-num text-xs font-bold text-[#7C3AED]">
                  {kpiActividades.pctMes}%
                </span>
              </div>
              <div className="text-[11px] text-[#6E5F87] leading-snug">
                <p>Enviadas a tiempo en el mes</p>
                <p className="font-semibold text-[#5B21B6] mt-0.5">
                  Hoy: {kpiActividades.completadasHoy}/
                  {kpiActividades.asignadasHoy} completadas
                </p>
              </div>
            </div>
          </div>

          {/* KPI 2: METAS DE REFRENDOS */}
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5 flex flex-col justify-between gap-3 shadow-[0_2px_10px_rgba(124,58,237,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-[#7A6B93] uppercase">
                METAS DE REFRENDOS
              </span>
              <div className="h-8 w-8 rounded-xl bg-[#ECFDF5] text-[#15803D] flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>

            <div className="font-mono-num text-xl sm:text-2xl font-extrabold text-[#1F172B] truncate">
              {formatCurrencyClean(kpiRefrendos.montoAcumulado)}
              <span className="text-sm font-semibold text-[#9D8FB5]">
                /{formatCurrencyClean(kpiRefrendos.metaMonto)}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-2 rounded-full bg-[#EFE9F8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#7C3AED] transition-all"
                    style={{ width: `${kpiRefrendos.pct}%` }}
                  />
                </div>
                <span className="font-mono-num text-xs font-bold text-[#7C3AED]">
                  {kpiRefrendos.pct}%
                </span>
              </div>
              <p className="text-[11px] text-[#6E5F87] leading-snug">
                {kpiRefrendos.faltante > 0
                  ? `Te faltan ${formatCurrencyClean(kpiRefrendos.faltante)} refrendos`
                  : 'Meta mensual alcanzada'}
              </p>
            </div>
          </div>

          {/* KPI 3: TECHO DE GASTOS */}
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5 flex flex-col justify-between gap-3 shadow-[0_2px_10px_rgba(124,58,237,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-[#7A6B93] uppercase">
                TECHO DE GASTOS
              </span>
              <div className="h-8 w-8 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
                <Wallet className="h-4 w-4" />
              </div>
            </div>

            <div className="font-mono-num text-xl sm:text-2xl font-extrabold text-[#1F172B] truncate">
              {formatCurrencyClean(kpiGastos.gastoAcumulado)}
              {!kpiGastos.sinTecho && (
                <span className="text-sm font-semibold text-[#9D8FB5]">
                  /{formatCurrencyClean(kpiGastos.techo)}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-2 rounded-full bg-[#EFE9F8] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      kpiGastos.excedido ? 'bg-[#E11D48]' : 'bg-[#7C3AED]'
                    }`}
                    style={{
                      width: `${kpiGastos.sinTecho ? 0 : kpiGastos.pct}%`,
                    }}
                  />
                </div>
                <span
                  className={`font-mono-num text-xs font-bold ${
                    kpiGastos.excedido ? 'text-[#E11D48]' : 'text-[#7C3AED]'
                  }`}
                >
                  {kpiGastos.sinTecho ? '—' : `${kpiGastos.pct}%`}
                </span>
              </div>
              {kpiGastos.sinTecho ? (
                <p className="text-[11px] text-[#6E5F87]">
                  Sin techo de gastos asignado
                </p>
              ) : kpiGastos.excedido ? (
                <p className="text-[11px] font-semibold text-[#BE123C]">
                  Techo excedido por {formatCurrencyClean(kpiGastos.exceso)}
                </p>
              ) : (
                <p className="text-[11px] text-[#6E5F87]">
                  Disponible: {formatCurrencyClean(kpiGastos.disponible)}
                </p>
              )}
            </div>
          </div>

          {/* KPI 4: LLAMADAS DEL MES */}
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5 flex flex-col justify-between gap-3 shadow-[0_2px_10px_rgba(124,58,237,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-[#7A6B93] uppercase">
                LLAMADAS DEL MES
              </span>
              <div className="h-8 w-8 rounded-xl bg-[#FFF7ED] text-[#EA580C] flex items-center justify-center">
                <PhoneCall className="h-4 w-4" />
              </div>
            </div>

            <div className="font-mono-num text-2xl font-extrabold text-[#1F172B]">
              {kpiLlamadas.registradasMes}
              <span className="text-base font-semibold text-[#9D8FB5]">
                /{kpiLlamadas.metaMensual}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-2 rounded-full bg-[#EFE9F8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#7C3AED] transition-all"
                    style={{ width: `${kpiLlamadas.pct}%` }}
                  />
                </div>
                <span className="font-mono-num text-xs font-bold text-[#7C3AED]">
                  {kpiLlamadas.pct}%
                </span>
              </div>
              <p className="text-[11px] text-[#6E5F87] leading-snug">
                Hoy llevas {kpiLlamadas.hoy} de {kpiLlamadas.metaDiaria} ·
                Acumulado mensual de tu base diaria
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feedback Banner */}
      {uploadFeedback && (
        <div className="rounded-2xl bg-[#F3ECFC] border border-[#DDD6FE] px-4 py-3 text-xs font-medium text-[#5B21B6] flex items-center justify-between">
          <span>{uploadFeedback}</span>
          <button
            type="button"
            onClick={() => setUploadFeedback(null)}
            className="text-[#7C3AED] font-bold hover:underline ml-3"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Section: Tareas de hoy */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-bold text-[#1F172B]">
            Tareas de hoy
          </h2>
          <span className="text-xs font-semibold text-[#7A6B93]">
            {tareasHoy.length}{' '}
            {tareasHoy.length === 1 ? 'actividad' : 'actividades'}
          </span>
        </div>

        {tareasHoy.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-8 text-center text-sm text-[#7A6B93]">
            No hay actividades asignadas para hoy en {sucursal.nombre}.
          </div>
        ) : (
          <div className="space-y-3">
            {tareasHoy.map((act) => {
              const evalInfo = evaluarVencimientoActividad(act, horarioHoy);
              const isCompleted = act.estatus === 'Completada';
              const isVencida = !isCompleted && evalInfo.vencidaPorHora;
              const isUploading = uploadingId === act.id;

              const circleStyle = isCompleted
                ? 'bg-[#ECFDF5] text-[#15803D]'
                : isVencida
                  ? 'bg-[#FFF1F2] text-[#E11D48]'
                  : 'bg-[#F3ECFC] text-[#7C3AED]';

              return (
                <article
                  key={act.id}
                  className="bg-white rounded-2xl border border-[#EAE3F5] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_2px_10px_rgba(124,58,237,0.02)]"
                >
                  {/* Left: Icon + Details + Pills */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${circleStyle}`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-2">
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-[#1F172B]">
                          {act.titulo}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#7A6B93] mt-0.5">
                          {act.descripcion ||
                            act.observaciones ||
                            'Adjunta la evidencia fotográfica para completar esta tarea.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Deadline Pill */}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#F3ECFC] text-[#6D28D9]">
                          <Clock className="h-3 w-3" />
                          {evalInfo.horaLimite
                            ? `Límite ${formatHora12h(evalInfo.horaLimite)}`
                            : 'Sin horario límite'}
                        </span>

                        {/* Dynamic Status Pill */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#ECFDF5] text-[#15803D]">
                            <CheckCircle2 className="h-3 w-3" />
                            Completada
                          </span>
                        ) : isVencida ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FFF1F2] text-[#E11D48]">
                            <AlertCircle className="h-3 w-3" />
                            Vencida
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FEF9C3] text-[#A16207]">
                            <Clock className="h-3 w-3" />
                            Pendiente
                          </span>
                        )}

                        {act.evidencia_url && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImg({
                                url: act.evidencia_url!,
                                title: act.titulo,
                              })
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7C3AED] hover:underline px-1.5 py-0.5"
                          >
                            <ImageIcon className="h-3 w-3" />
                            Ver evidencia
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Camera & Gallery Upload Buttons */}
                  <div className="flex items-center gap-2.5 shrink-0 pl-13 md:pl-0">
                    <input
                      ref={(el) => {
                        cameraInputRefs.current[act.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        handleUploadEvidence(act, file);
                        e.currentTarget.value = '';
                      }}
                    />
                    <input
                      ref={(el) => {
                        galleryInputRefs.current[act.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        handleUploadEvidence(act, file);
                        e.currentTarget.value = '';
                      }}
                    />

                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => cameraInputRefs.current[act.id]?.click()}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <Camera className="h-4 w-4" />
                      {isUploading ? 'Subiendo...' : 'Cámara'}
                    </button>

                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => galleryInputRefs.current[act.id]?.click()}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[#C4B5FD] text-[#6D28D9] hover:bg-[#FAF7FF] transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <ImageIcon className="h-4 w-4" />
                      Galería
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Section: Mi desglose diario */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden shadow-[0_2px_10px_rgba(124,58,237,0.02)]">
        <div className="px-5 py-4 border-b border-[#F1ECF9]">
          <h2 className="font-display text-base font-bold text-[#1F172B]">
            Mi desglose diario
          </h2>
          <p className="text-xs text-[#7A6B93] mt-0.5">
            Lo que has completado cada día del mes
          </p>
        </div>

        <div className="max-h-[380px] overflow-y-auto divide-y divide-[#F3EEF9]">
          {desgloseDiario.map((row) => (
            <div
              key={row.dateStr}
              className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[#FCFAFF]"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-extrabold tracking-wide text-[#5B21B6] uppercase">
                  DÍA {row.day}
                </span>
                <span className="text-xs text-[#8B7CA5] capitalize">
                  {row.weekdayShort}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F5F0FF] text-[#5B21B6] border border-[#E9DDFC] font-mono-num">
                  {row.llamadasCount}/{row.metaLlamadas} (llamadas)
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F5F0FF] text-[#5B21B6] border border-[#E9DDFC] font-mono-num">
                  {formatCurrencyClean(row.refrendosMonto)} refrendos
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F5F0FF] text-[#5B21B6] border border-[#E9DDFC] font-mono-num">
                  {formatCurrencyClean(row.gastosMonto)} (gastos)
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F5F0FF] text-[#5B21B6] border border-[#E9DDFC] font-mono-num">
                  {row.actCompletadas}/{row.actAsignadas} actividades
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Lightbox for uploaded evidence */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/65 backdrop-blur-[2px]"
          onClick={() => setPreviewImg(null)}
        >
          <div
            className="max-w-xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#E6DDF5]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F1ECF9]">
              <p className="text-sm font-semibold text-[#1F172B] truncate">
                {previewImg.title}
              </p>
              <button
                type="button"
                onClick={() => setPreviewImg(null)}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
                aria-label="Cerrar vista previa"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 bg-[#FAF8FC] flex items-center justify-center">
              <img
                src={previewImg.url}
                alt={previewImg.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
