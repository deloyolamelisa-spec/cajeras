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
  RotateCcw,
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
  TareaCatalogo,
  UsuarioControlOps,
} from '../types/controlops';
import {
  MEXICO_TIMEZONE,
  calcularPuntualidadEnvio,
  evaluarVencimientoActividad,
  formatCurrencyClean,
  formatHora12h,
  formatMexicoDateLabel,
  formatMexicoMonthYearUpper,
  getCurrentLocalHHMM,
  getDiaSemanaFromDate,
  getLlamadaLocalDate,
  getTodayLocalYYYYMMDD,
  resolveDailyTasksForBranch,
  roundMoney2,
} from '../utils/calculations';
import {
  ServiceResult,
  uploadEvidenciaFoto,
} from '../services/controlOpsService';

interface CajeraMiDiaViewProps {
  currentUser: UsuarioControlOps;
  sucursal: Sucursal;
  metaSucursal?: MetaSucursal;
  actividades: ActividadDiaria[];
  tareasCatalogo: TareaCatalogo[];
  llamadas: LlamadaSucursal[];
  gastosYRefrendos: GastoYRefrendo[];
  horarios: HorarioSucursalDia[];
  diaActivo: DiaSemana;
  onUpdateActividad: (updated: ActividadDiaria) => Promise<ServiceResult>;
}

export const CajeraMiDiaView: React.FC<CajeraMiDiaViewProps> = ({
  currentUser,
  sucursal,
  metaSucursal,
  actividades,
  tareasCatalogo,
  llamadas,
  gastosYRefrendos,
  horarios,
  diaActivo,
  onUpdateActividad,
}) => {
  const [notifDenied, setNotifDenied] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [previewImg, setPreviewImg] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Desktop live camera capture modal state
  const [webcamActivity, setWebcamActivity] = useState<ActividadDiaria | null>(
    null
  );
  const [webcamLoading, setWebcamLoading] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<{
    previewUrl: string;
    file: File;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const mobileUA =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
        ua
      );
    const ipadOS =
      navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return mobileUA || ipadOS;
  }, []);

  const stopWebcamStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifDenied(Notification.permission === 'denied');
    }
    return () => {
      stopWebcamStream();
    };
  }, []);

  const [todayStr, setTodayStr] = useState<string>(() =>
    getTodayLocalYYYYMMDD()
  );

  useEffect(() => {
    const syncToday = () => {
      const latest = getTodayLocalYYYYMMDD();
      setTodayStr((prev) => (prev === latest ? prev : latest));
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

  const [currentYear, currentMonthNum, currentDay] = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    return [y || 2026, m || 1, d || 1];
  }, [todayStr]);
  const currentMonthPrefix = todayStr.slice(0, 7);
  const effectiveDiaActivo = useMemo(
    () => getDiaSemanaFromDate(todayStr),
    [todayStr]
  );

  const formattedDate = useMemo(
    () => formatMexicoDateLabel(todayStr),
    [todayStr]
  );

  const monthYearUpper = useMemo(
    () => formatMexicoMonthYearUpper(todayStr),
    [todayStr]
  );

  const horarioHoy = useMemo(
    () =>
      horarios.find(
        (h) =>
          h.sucursal_id === sucursal.id &&
          h.dia === (effectiveDiaActivo || diaActivo)
      ),
    [horarios, sucursal.id, effectiveDiaActivo, diaActivo]
  );

  // Branch-scoped records
  const branchActividades = useMemo(
    () => actividades.filter((a) => a.sucursal_id === sucursal.id),
    [actividades, sucursal.id]
  );

  const tareasHoy = useMemo(
    () =>
      resolveDailyTasksForBranch(
        sucursal,
        tareasCatalogo,
        actividades,
        effectiveDiaActivo || diaActivo,
        todayStr,
        { id: currentUser.id, nombre: currentUser.nombre }
      ),
    [
      sucursal,
      tareasCatalogo,
      actividades,
      effectiveDiaActivo,
      diaActivo,
      todayStr,
      currentUser.id,
      currentUser.nombre,
    ]
  );

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

    const completadasMes = branchActividades.filter(
      (a) => a.fecha?.startsWith(currentMonthPrefix) && a.estatus === 'Completada'
    ).length;
    const metaDiaria = Math.max(asignadasHoy, 1);
    const totalEsperadoMes = metaDiaria * currentDay;
    const pctMes = Math.min(
      100,
      Math.round((completadasMes / Math.max(totalEsperadoMes, 1)) * 100)
    );

    return {
      completadasMes,
      totalMes: totalEsperadoMes,
      pctMes,
      completadasHoy,
      asignadasHoy,
    };
  }, [branchActividades, tareasHoy, currentMonthPrefix, currentDay]);

  // KPI 2: METAS DE REFRENDOS (in clean MXN, max 2 decimals)
  const kpiRefrendos = useMemo(() => {
    const refrendosMes = branchGastosRefrendos.filter(
      (r) => r.tipo === 'Refrendo' && r.fecha?.startsWith(currentMonthPrefix)
    );
    const refrendosHoy = refrendosMes.filter((r) => r.fecha === todayStr);

    const montoHoy = roundMoney2(
      refrendosHoy.reduce((acc, r) => acc + (Number(r.monto_real) || 0), 0)
    );
    const montoAcumulado = roundMoney2(
      refrendosMes.reduce((acc, r) => acc + (Number(r.monto_real) || 0), 0)
    );

    const rawMeta =
      metaSucursal?.meta_refrendos_mensual ??
      sucursal.meta_refrendos_mensual ??
      0;

    // Si meta_refrendos_mensual < 500 representa cantidad de operaciones, convertir a meta monetaria estimada
    const totalOps = refrendosMes.reduce(
      (acc, r) => acc + (Number(r.cantidad_refrendos) || 0),
      0
    );
    const avgTicket =
      totalOps > 0 && montoAcumulado > 0 ? montoAcumulado / totalOps : 3250;
    const metaMonto = roundMoney2(
      rawMeta >= 500 ? rawMeta : rawMeta * avgTicket
    );

    const faltante = Math.max(0, roundMoney2(metaMonto - montoAcumulado));
    const pct =
      metaMonto > 0
        ? Math.min(100, Math.round((montoAcumulado / metaMonto) * 100))
        : 0;

    return {
      montoHoy,
      montoAcumulado,
      metaMonto,
      faltante,
      pct,
    };
  }, [branchGastosRefrendos, currentMonthPrefix, todayStr, metaSucursal, sucursal]);

  // KPI 3: TECHO DE GASTOS
  const kpiGastos = useMemo(() => {
    const gastosMes = branchGastosRefrendos.filter(
      (r) => r.tipo === 'Gasto' && r.fecha?.startsWith(currentMonthPrefix)
    );
    const gastosHoy = gastosMes.filter((r) => r.fecha === todayStr);

    const gastoHoy = roundMoney2(
      gastosHoy.reduce((acc, g) => acc + (Number(g.monto_real) || 0), 0)
    );
    const gastoAcumulado = roundMoney2(
      gastosMes.reduce((acc, g) => acc + (Number(g.monto_real) || 0), 0)
    );

    const techo = roundMoney2(
      metaSucursal?.techo_gasto_mensual ?? sucursal.techo_gasto_mensual ?? 0
    );
    const sinTecho = techo <= 0;
    const excedido = !sinTecho && gastoAcumulado > techo;
    const exceso = excedido ? roundMoney2(gastoAcumulado - techo) : 0;
    const disponible =
      !sinTecho && !excedido ? roundMoney2(techo - gastoAcumulado) : 0;
    const pct =
      !sinTecho && techo > 0
        ? Math.min(100, Math.round((gastoAcumulado / techo) * 100))
        : 0;

    return {
      gastoHoy,
      gastoAcumulado,
      techo,
      sinTecho,
      excedido,
      exceso,
      disponible,
      pct,
    };
  }, [branchGastosRefrendos, currentMonthPrefix, todayStr, metaSucursal, sucursal]);

  // KPI 4: LLAMADAS DE TU BASE (HOY) — sin exponer metas diarias/mensuales a cajeras
  const kpiLlamadas = useMemo(() => {
    const baseHoyTotal = branchLlamadas.filter(
      (l) => getLlamadaLocalDate(l) === todayStr
    ).length;

    const realizadasHoy = branchLlamadas.filter(
      (l) => l.llamada_registrada && getLlamadaLocalDate(l) === todayStr
    ).length;

    const registradasMes = branchLlamadas.filter(
      (l) =>
        l.llamada_registrada &&
        getLlamadaLocalDate(l).startsWith(currentMonthPrefix)
    ).length;

    const pctHoy =
      baseHoyTotal > 0
        ? Math.min(100, Math.round((realizadasHoy / baseHoyTotal) * 1000) / 10)
        : 0;

    return {
      realizadasHoy,
      baseHoyTotal,
      registradasMes,
      pctHoy,
    };
  }, [branchLlamadas, currentMonthPrefix, todayStr]);

  // Daily breakdown rows for current month (DÍA 1 .. DÍA currentDay)
  const desgloseDiario = useMemo(() => {
    const rows: {
      day: number;
      dateStr: string;
      weekdayShort: string;
      llamadasCount: number;
      totalBaseDia: number;
      refrendosMonto: number;
      gastosMonto: number;
      actCompletadas: number;
      actAsignadas: number;
    }[] = [];

    for (let d = 1; d <= currentDay; d++) {
      const dateStr = `${currentMonthPrefix}-${String(d).padStart(2, '0')}`;
      const diaSem = getDiaSemanaFromDate(dateStr);
      const weekdayShort = new Date(
        Date.UTC(currentYear, currentMonthNum - 1, d, 12, 0, 0)
      )
        .toLocaleDateString('es-MX', {
          timeZone: MEXICO_TIMEZONE,
          weekday: 'short',
          month: 'short',
        })
        .replace('.', '');

      const callsDia = branchLlamadas.filter(
        (l) => getLlamadaLocalDate(l) === dateStr
      );
      const totalBaseDia = callsDia.length;
      const llamadasCount = callsDia.filter((l) => l.llamada_registrada).length;

      const refrendosMonto = roundMoney2(
        branchGastosRefrendos
          .filter((g) => g.tipo === 'Refrendo' && g.fecha === dateStr)
          .reduce((acc, g) => acc + (Number(g.monto_real) || 0), 0)
      );

      const gastosMonto = roundMoney2(
        branchGastosRefrendos
          .filter((g) => g.tipo === 'Gasto' && g.fecha === dateStr)
          .reduce((acc, g) => acc + (Number(g.monto_real) || 0), 0)
      );

      const asignadasDiaList = resolveDailyTasksForBranch(
        sucursal,
        tareasCatalogo,
        actividades,
        diaSem,
        dateStr,
        { id: currentUser.id, nombre: currentUser.nombre }
      );
      const actAsignadas = asignadasDiaList.length;
      const actCompletadas = asignadasDiaList.filter(
        (a) => a.estatus === 'Completada'
      ).length;

      rows.push({
        day: d,
        dateStr,
        weekdayShort,
        llamadasCount,
        totalBaseDia,
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
    currentMonthNum,
    branchLlamadas,
    branchGastosRefrendos,
    actividades,
    tareasCatalogo,
    sucursal,
    currentUser.id,
    currentUser.nombre,
  ]);

  const startWebcamStream = async () => {
    stopWebcamStream();
    setWebcamLoading(true);
    setWebcamError(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setWebcamLoading(false);
      setWebcamError(
        'Este navegador no permite acceso directo a la cámara. Selecciona una imagen desde tu equipo.'
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo activar la cámara del dispositivo.';
      setWebcamError(
        `No se pudo abrir la cámara (${msg}). Verifica los permisos del navegador o elige una foto de archivo.`
      );
    } finally {
      setWebcamLoading(false);
    }
  };

  const openWebcamModal = (actividad: ActividadDiaria) => {
    if (capturedPhoto?.previewUrl) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
    }
    setCapturedPhoto(null);
    setWebcamError(null);
    setWebcamActivity(actividad);
    void startWebcamStream();
  };

  const closeWebcamModal = () => {
    stopWebcamStream();
    if (capturedPhoto?.previewUrl) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
    }
    setCapturedPhoto(null);
    setWebcamError(null);
    setWebcamActivity(null);
  };

  const handleCaptureSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setWebcamError('La cámara aún está iniciando, espera un momento.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setWebcamError('No se pudo capturar la fotografía.');
          return;
        }
        const file = new File([blob], `camara-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        const previewUrl = URL.createObjectURL(blob);
        stopWebcamStream();
        setCapturedPhoto({ previewUrl, file });
      },
      'image/jpeg',
      0.9
    );
  };

  const handleRetakeSnapshot = () => {
    if (capturedPhoto?.previewUrl) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
    }
    setCapturedPhoto(null);
    void startWebcamStream();
  };

  const handleConfirmSnapshot = async () => {
    if (!webcamActivity || !capturedPhoto) return;
    const targetAct = webcamActivity;
    const fileToSend = capturedPhoto.file;
    closeWebcamModal();
    await handleUploadEvidence(targetAct, fileToSend);
  };

  const handleUploadEvidence = async (
    actividad: ActividadDiaria,
    file: File | undefined
  ) => {
    if (!file) return;
    setUploadingId(actividad.id);
    setUploadFeedback(null);
    try {
      const res = await uploadEvidenciaFoto(file, 'actividades', sucursal.id);
      if (!res.uploadedToSupabase || !res.url) {
        setUploadFeedback({
          type: 'error',
          message:
            res.error ||
            `No se pudo subir la evidencia de "${actividad.titulo}" a Supabase Storage.`,
        });
        return;
      }

      const safeSucursalNombre =
        (
          sucursal.nombre ||
          actividad.sucursal_nombre ||
          actividad.sucursal ||
          'Sucursal'
        ).trim() || 'Sucursal';

      const horaCompletada = getCurrentLocalHHMM();
      const evalInfo = evaluarVencimientoActividad(
        actividad,
        horarioHoy,
        horaCompletada
      );
      const effHoraLimite = evalInfo.horaLimite;
      const effSinLimite = effHoraLimite === null;
      const puntualidad = calcularPuntualidadEnvio(
        'Completada',
        horaCompletada,
        effHoraLimite,
        effSinLimite
      );

      const updated: ActividadDiaria = {
        ...actividad,
        sucursal_id: sucursal.id || actividad.sucursal_id,
        sucursal_nombre: safeSucursalNombre,
        sucursal: safeSucursalNombre,
        cajera_id: currentUser.id,
        cajera_nombre: currentUser.nombre,
        responsable:
          currentUser.nombre ||
          actividad.responsable ||
          sucursal.responsable_caja,
        estatus: 'Completada',
        hora_limite: effHoraLimite,
        sin_horario_limite: effSinLimite,
        hora_completada: horaCompletada,
        puntualidad,
        validacion_admin: 'Pendiente',
        fecha: todayStr,
        evidencia_url: res.url,
      };

      const saveRes = await onUpdateActividad(updated);
      if (!saveRes.ok) {
        setUploadFeedback({
          type: 'error',
          message:
            saveRes.error ||
            `La foto subió, pero falló el guardado de "${actividad.titulo}" en actividades_diarias.`,
        });
        return;
      }

      setUploadFeedback({
        type: 'success',
        message: `Evidencia de "${actividad.titulo}" guardada en Supabase (${puntualidad}${horaCompletada ? ` · ${formatHora12h(horaCompletada)}` : ''}).`,
      });
    } catch (err) {
      setUploadFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : `Ocurrió un error al guardar "${actividad.titulo}".`,
      });
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
              <div className="text-[11px] text-[#6E5F87] leading-snug space-y-0.5">
                <p>
                  {kpiRefrendos.faltante > 0
                    ? `Te faltan ${formatCurrencyClean(kpiRefrendos.faltante)} refrendos`
                    : 'Meta mensual alcanzada'}
                </p>
                <p className="font-semibold text-[#15803D]">
                  Hoy: {formatCurrencyClean(kpiRefrendos.montoHoy)}
                </p>
              </div>
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
              <div className="text-[11px] leading-snug space-y-0.5">
                {kpiGastos.sinTecho ? (
                  <p className="text-[#6E5F87]">Sin techo de gastos asignado</p>
                ) : kpiGastos.excedido ? (
                  <p className="font-semibold text-[#BE123C]">
                    Techo excedido por {formatCurrencyClean(kpiGastos.exceso)}
                  </p>
                ) : (
                  <p className="text-[#6E5F87]">
                    Disponible: {formatCurrencyClean(kpiGastos.disponible)}
                  </p>
                )}
                <p className="font-semibold text-[#4F46E5]">
                  Hoy: {formatCurrencyClean(kpiGastos.gastoHoy)}
                </p>
              </div>
            </div>
          </div>

          {/* KPI 4: LLAMADAS DE TU BASE DE HOY */}
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-5 flex flex-col justify-between gap-3 shadow-[0_2px_10px_rgba(124,58,237,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-[#7A6B93] uppercase">
                LLAMADAS DE TU BASE (HOY)
              </span>
              <div className="h-8 w-8 rounded-xl bg-[#FFF7ED] text-[#EA580C] flex items-center justify-center">
                <PhoneCall className="h-4 w-4" />
              </div>
            </div>

            <div className="font-mono-num text-2xl font-extrabold text-[#1F172B]">
              {kpiLlamadas.realizadasHoy}
              <span className="text-base font-semibold text-[#9D8FB5]">
                /{kpiLlamadas.baseHoyTotal}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-2 rounded-full bg-[#EFE9F8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#7C3AED] transition-all"
                    style={{ width: `${kpiLlamadas.pctHoy}%` }}
                  />
                </div>
                <span className="font-mono-num text-xs font-bold text-[#7C3AED]">
                  {kpiLlamadas.pctHoy.toFixed(1)}%
                </span>
              </div>
              <p className="text-[11px] text-[#6E5F87] leading-snug">
                {kpiLlamadas.realizadasHoy} de {kpiLlamadas.baseHoyTotal} llamadas
                de tu base de hoy ({kpiLlamadas.pctHoy.toFixed(1)}%) · Mes:{' '}
                {kpiLlamadas.registradasMes} realizadas
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feedback Banner */}
      {uploadFeedback && (
        <div
          role="alert"
          className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 border ${
            uploadFeedback.type === 'error'
              ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
              : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {uploadFeedback.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-[#E11D48]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
            )}
            <span className="break-words">{uploadFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadFeedback(null)}
            className={`font-bold hover:underline shrink-0 ${
              uploadFeedback.type === 'error'
                ? 'text-[#BE123C]'
                : 'text-[#065F46]'
            }`}
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
              const isObservada = act.estatus === 'Observada';
              const isVencida = !isCompleted && !isObservada && evalInfo.vencidaPorHora;
              const isUploading = uploadingId === act.id;
              const isLateSubmission =
                act.puntualidad === 'A destiempo' ||
                evalInfo.etiqueta === 'Completada con retraso';

              const circleStyle = isCompleted
                ? 'bg-[#ECFDF5] text-[#15803D]'
                : isObservada || isVencida
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
                      ) : isObservada ? (
                        <AlertCircle className="h-5 w-5" />
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
                            'Adjunta la evidencia fotográfica para completar esta tarea.'}
                        </p>
                        {isObservada && act.observaciones && (
                          <p className="text-xs font-medium text-[#BE123C] bg-[#FFF1F2] border border-[#FECDD3] rounded-lg px-2.5 py-1.5 mt-1.5">
                            Observación de administración: {act.observaciones}
                          </p>
                        )}
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
                        ) : isObservada ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FFF1F2] text-[#BE123C]">
                            <AlertCircle className="h-3 w-3" />
                            Observada (volver a subir)
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

                        {/* Punctuality & Admin Validation Pills */}
                        {(isCompleted || isObservada) && (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              isLateSubmission
                                ? 'bg-[#FFF7ED] text-[#C2410C]'
                                : 'bg-[#ECFDF5] text-[#15803D]'
                            }`}
                          >
                            {isLateSubmission ? 'A destiempo' : 'A tiempo'}
                            {act.hora_completada
                              ? ` · ${formatHora12h(act.hora_completada)}`
                              : ''}
                          </span>
                        )}

                        {act.validacion_admin === 'Aprobada' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#EEF2FF] text-[#4338CA]">
                            <CheckCircle2 className="h-3 w-3" />
                            Validada
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

                  {/* Right: Camera & Gallery Upload Controls */}
                  <div className="flex items-center gap-2.5 shrink-0 pl-13 md:pl-0">
                    {isMobileDevice ? (
                      <label
                        className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors whitespace-nowrap select-none ${
                          isUploading
                            ? 'opacity-50 pointer-events-none'
                            : 'cursor-pointer'
                        }`}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={isUploading}
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.currentTarget.value = '';
                            if (file) void handleUploadEvidence(act, file);
                          }}
                        />
                        <Camera className="h-4 w-4" />
                        {isUploading ? 'Subiendo...' : 'Cámara'}
                      </label>
                    ) : (
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => openWebcamModal(act)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        <Camera className="h-4 w-4" />
                        {isUploading ? 'Subiendo...' : 'Cámara'}
                      </button>
                    )}

                    <label
                      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[#C4B5FD] text-[#6D28D9] hover:bg-[#FAF7FF] transition-colors whitespace-nowrap select-none ${
                        isUploading
                          ? 'opacity-50 pointer-events-none'
                          : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploading}
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = '';
                          if (file) void handleUploadEvidence(act, file);
                        }}
                      />
                      <ImageIcon className="h-4 w-4" />
                      Galería
                    </label>
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
                  {row.llamadasCount}/{row.totalBaseDia} llamadas
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

      {/* Desktop Live Camera Capture Modal */}
      {webcamActivity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/70 backdrop-blur-[2px]"
          onClick={closeWebcamModal}
        >
          <div
            className="max-w-lg w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#E6DDF5]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F1ECF9]">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1F172B] truncate">
                  Capturar evidencia — {webcamActivity.titulo}
                </p>
                <p className="text-[11px] text-[#7A6B93]">
                  Toma la fotografía en vivo y confirma el envío a Supabase
                </p>
              </div>
              <button
                type="button"
                onClick={closeWebcamModal}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
                aria-label="Cerrar cámara"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 bg-[#FAF7FF] space-y-4">
              {capturedPhoto ? (
                <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-[60vh]">
                  <img
                    src={capturedPhoto.previewUrl}
                    alt="Captura de evidencia"
                    className="max-h-[58vh] w-full object-contain"
                  />
                </div>
              ) : webcamError ? (
                <div className="rounded-xl bg-[#FFF1F2] border border-[#FECDD3] p-4 text-xs text-[#BE123C] space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#E11D48]" />
                    <p>{webcamError}</p>
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (file && webcamActivity) {
                          const targetAct = webcamActivity;
                          closeWebcamModal();
                          void handleUploadEvidence(targetAct, file);
                        }
                      }}
                    />
                    <ImageIcon className="h-4 w-4" />
                    Seleccionar imagen desde archivo
                  </label>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-[#1F172B] aspect-video flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {webcamLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#1F172B]/75 text-white text-xs font-medium">
                      Iniciando cámara...
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeWebcamModal}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[#DDD6FE] text-[#6E5F87] hover:bg-[#F5F0FC]"
                >
                  Cancelar
                </button>

                {capturedPhoto ? (
                  <>
                    <button
                      type="button"
                      onClick={handleRetakeSnapshot}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[#C4B5FD] text-[#6D28D9] hover:bg-[#FAF7FF]"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Volver a tomar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmSnapshot()}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Confirmar y enviar
                    </button>
                  </>
                ) : !webcamError ? (
                  <button
                    type="button"
                    disabled={webcamLoading}
                    onClick={handleCaptureSnapshot}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
                  >
                    <Camera className="h-4 w-4" />
                    Tomar foto
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

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
