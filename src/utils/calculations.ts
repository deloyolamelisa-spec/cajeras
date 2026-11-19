import {
  ActividadDiaria,
  BranchMetricSummary,
  DiaSemana,
  GastoYRefrendo,
  HorarioSucursalDia,
  LlamadaSucursal,
  MetaSucursal,
  Sucursal,
} from '../types/controlops';

export function formatMXN(amount: number, decimals = 0): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function sanitizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length === 12) {
    return digits;
  }
  if (digits.length === 10) {
    return `52${digits}`;
  }
  return `52${digits}`;
}

export function getTodayDiaSemana(): DiaSemana {
  const dayIndex = new Date().getDay();
  const map: Record<number, DiaSemana> = {
    0: 'domingo',
    1: 'lunes',
    2: 'martes',
    3: 'miercoles',
    4: 'jueves',
    5: 'viernes',
    6: 'sabado',
  };
  return map[dayIndex] ?? 'lunes';
}

export function evaluarVencimientoActividad(
  actividad: ActividadDiaria,
  horario: HorarioSucursalDia | undefined,
  horaActualReferencia = '11:30'
): {
  etiqueta:
    | 'Sin horario límite'
    | 'A tiempo'
    | 'Vencida'
    | 'Completada con retraso'
    | 'En tiempo';
  vencidaPorHora: boolean;
  horaLimite: string | null;
} {
  if (actividad.sin_horario_limite) {
    return {
      etiqueta: 'Sin horario límite',
      vencidaPorHora: false,
      horaLimite: null,
    };
  }

  if (!actividad.hora_limite && (!horario || horario.sin_horario_limite)) {
    return {
      etiqueta: 'Sin horario límite',
      vencidaPorHora: false,
      horaLimite: null,
    };
  }

  const horaLimite =
    actividad.hora_limite ||
    (actividad.categoria === 'Corte'
      ? horario?.hora_limite_corte || '18:30'
      : horario?.hora_limite_actividad || '09:00');

  if (actividad.estatus === 'Completada') {
    if (actividad.hora_completada && actividad.hora_completada > horaLimite) {
      return {
        etiqueta: 'Completada con retraso',
        vencidaPorHora: false,
        horaLimite,
      };
    }
    return {
      etiqueta: 'A tiempo',
      vencidaPorHora: false,
      horaLimite,
    };
  }

  if (horaActualReferencia > horaLimite) {
    return {
      etiqueta: 'Vencida',
      vencidaPorHora: true,
      horaLimite,
    };
  }

  return {
    etiqueta: 'En tiempo',
    vencidaPorHora: false,
    horaLimite,
  };
}

export function calcularExcesoPresupuesto(
  montoReal: number,
  presupuestoLimite: number
): {
  excedido: boolean;
  excesoDinero: number;
  excesoPorcentaje: number;
  margenDisponible: number;
  porcentajeUso: number;
} {
  if (presupuestoLimite <= 0) {
    return {
      excedido: montoReal > 0,
      excesoDinero: montoReal > 0 ? montoReal : 0,
      excesoPorcentaje: 0,
      margenDisponible: 0,
      porcentajeUso: 0,
    };
  }

  const excedido = montoReal > presupuestoLimite;
  const excesoDinero = excedido ? montoReal - presupuestoLimite : 0;
  const excesoPorcentaje = excedido
    ? ((montoReal - presupuestoLimite) / presupuestoLimite) * 100
    : 0;
  const margenDisponible = !excedido ? presupuestoLimite - montoReal : 0;
  const porcentajeUso = (montoReal / presupuestoLimite) * 100;

  return {
    excedido,
    excesoDinero,
    excesoPorcentaje,
    margenDisponible,
    porcentajeUso,
  };
}

export function computeBranchSummaries(
  sucursales: Sucursal[],
  llamadas: LlamadaSucursal[],
  actividades: ActividadDiaria[],
  gastosYRefrendos: GastoYRefrendo[],
  horarios: HorarioSucursalDia[],
  diaActivo: DiaSemana,
  metasSucursal: MetaSucursal[] = []
): BranchMetricSummary[] {
  const activas = sucursales.filter((s) => s.activa);

  return activas.map((sucursal) => {
    const metaConfig = metasSucursal.find((m) => m.sucursal_id === sucursal.id);

    const llamadasSuc = llamadas.filter((l) => l.sucursal_id === sucursal.id);
    const llamadasRegistradas = llamadasSuc.filter(
      (l) => l.llamada_registrada
    ).length;
    const llamadasVerificadas = llamadasSuc.filter(
      (l) => l.estatus_auditoria === 'Verificada'
    ).length;
    const llamadasFalsas = llamadasSuc.filter(
      (l) => l.estatus_auditoria === 'Falsa'
    ).length;
    const llamadasSinAuditar = llamadasSuc.filter(
      (l) => l.estatus_auditoria === 'Sin auditar'
    ).length;
    const metaLlamadas =
      metaConfig?.meta_llamadas_diarias || sucursal.meta_llamadas_diarias || 30;
    const pctLlamadas = Math.min(100, (llamadasRegistradas / metaLlamadas) * 100);

    const actividadesSuc = actividades.filter(
      (a) => a.sucursal_id === sucursal.id
    );
    const horarioDia = horarios.find(
      (h) => h.sucursal_id === sucursal.id && h.dia === diaActivo
    );
    const actividadesCompletadas = actividadesSuc.filter(
      (a) => a.estatus === 'Completada'
    ).length;
    const actividadesTotal = actividadesSuc.length;
    const actividadesVencidas = actividadesSuc.filter(
      (a) => evaluarVencimientoActividad(a, horarioDia).vencidaPorHora
    ).length;
    const pctActividades =
      actividadesTotal > 0 ? (actividadesCompletadas / actividadesTotal) * 100 : 0;

    const gastosSuc = gastosYRefrendos.filter(
      (g) => g.sucursal_id === sucursal.id && g.tipo === 'Gasto'
    );
    const gastoRealTotal = gastosSuc.reduce((acc, g) => acc + g.monto_real, 0);
    const sumaTechosGasto = gastosSuc.reduce(
      (acc, g) => acc + g.presupuesto_limite,
      0
    );
    const gastoPresupuestoTotal =
      metaConfig?.techo_gasto_mensual ||
      sucursal.techo_gasto_mensual ||
      sumaTechosGasto;
    const gastoCalc = calcularExcesoPresupuesto(
      gastoRealTotal,
      gastoPresupuestoTotal
    );

    const refrendosSuc = gastosYRefrendos.filter(
      (g) => g.sucursal_id === sucursal.id && g.tipo === 'Refrendo'
    );
    const refrendosRealizados = refrendosSuc.reduce(
      (acc, r) => acc + (r.cantidad_refrendos || 0),
      0
    );
    const refrendosMeta =
      metaConfig?.meta_refrendos_mensual ||
      sucursal.meta_refrendos_mensual ||
      refrendosSuc.reduce((acc, r) => acc + (r.meta_refrendos || 0), 0) ||
      40;
    const montoRefrendos = refrendosSuc.reduce((acc, r) => acc + r.monto_real, 0);
    const pctRefrendos =
      refrendosMeta > 0 ? (refrendosRealizados / refrendosMeta) * 100 : 0;

    const scoreGasto = gastoCalc.excedido
      ? Math.max(0, 100 - gastoCalc.excesoPorcentaje * 2)
      : 100;
    const puntajeGlobal = Math.round(
      pctActividades * 0.3 +
        scoreGasto * 0.25 +
        Math.min(100, pctRefrendos) * 0.25 +
        pctLlamadas * 0.2
    );

    return {
      sucursal,
      llamadasRegistradas,
      llamadasVerificadas,
      llamadasFalsas,
      llamadasSinAuditar,
      metaLlamadas,
      pctLlamadas,
      actividadesCompletadas,
      actividadesTotal,
      actividadesVencidas,
      pctActividades,
      gastoRealTotal,
      gastoPresupuestoTotal,
      excesoDinero: gastoCalc.excesoDinero,
      excesoPorcentaje: gastoCalc.excesoPorcentaje,
      pctUsoPresupuesto: gastoCalc.porcentajeUso,
      excedioPresupuesto: gastoCalc.excedido,
      refrendosRealizados,
      refrendosMeta,
      montoRefrendos,
      pctRefrendos,
      puntajeGlobal,
    };
  });
}
