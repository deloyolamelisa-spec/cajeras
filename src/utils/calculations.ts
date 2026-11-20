import {
  ActividadDiaria,
  BranchMetricSummary,
  DiaSemana,
  GastoYRefrendo,
  HorarioPersonalizado,
  HorarioSucursalDia,
  LlamadaSucursal,
  MetaSucursal,
  PuntualidadActividad,
  Sucursal,
  TareaCatalogo,
} from '../types/controlops';
import { BASE_DAILY_TASKS } from '../data/mockData';

export function formatMXN(amount: number, decimals = 0): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatCurrencyClean(amount: number): string {
  const rounded = Math.round((Number(amount) || 0) * 100) / 100;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function formatHora12h(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function getDiaSemanaFromDate(yyyyMmDd: string): DiaSemana {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dateObj = new Date(y, (m || 1) - 1, d || 1);
  const map: Record<number, DiaSemana> = {
    0: 'domingo',
    1: 'lunes',
    2: 'martes',
    3: 'miercoles',
    4: 'jueves',
    5: 'viernes',
    6: 'sabado',
  };
  return map[dateObj.getDay()] ?? 'lunes';
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

export function getCurrentLocalHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getTodayLocalYYYYMMDD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toLocalYYYYMMDD(dateInput?: string | Date | null): string {
  if (!dateInput) return getTodayLocalYYYYMMDD();
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return getTodayLocalYYYYMMDD();
}

export interface LlamadaBatchInfo {
  loteNum: number | null;
  fecha: string;
  sucursalId: string;
  batchKey: string;
}

export function extractLlamadaBatchInfo(
  llamada: LlamadaSucursal
): LlamadaBatchInfo | null {
  const id = llamada.id || '';
  const loteMatch = id.match(
    /^ll-lote-(\d+)__(\d{4}-\d{2}-\d{2})__([^_]+(?:_[^_]+)*)__([^_-]+)/
  );
  if (loteMatch) {
    const loteNum = Number(loteMatch[1]) || null;
    const fecha = loteMatch[2];
    const sucursalId = loteMatch[3];
    const stamp = loteMatch[4];
    return {
      loteNum,
      fecha,
      sucursalId,
      batchKey: `${fecha}__${sucursalId}__${loteMatch[1]}__${stamp}`,
    };
  }

  // Fallback for legacy imported records: ll-imp-<timestamp>-<idx>-<rand>
  const legacyMatch = id.match(/^ll-imp-(\d+)-/);
  if (legacyMatch) {
    const fecha = toLocalYYYYMMDD(llamada.fecha_registro);
    return {
      loteNum: null,
      fecha,
      sucursalId: llamada.sucursal_id,
      batchKey: `${fecha}__${llamada.sucursal_id}__imp-${legacyMatch[1]}`,
    };
  }

  return null;
}

export function getLlamadaLocalDate(llamada: LlamadaSucursal): string {
  const batchInfo = extractLlamadaBatchInfo(llamada);
  if (batchInfo?.fecha) return batchInfo.fecha;
  return toLocalYYYYMMDD(llamada.fecha_registro);
}

export interface DailyBatchSlotSummary {
  slot: number;
  batchKey: string;
  totalRegistros: number;
  llamadasRealizadas: number;
  loaded: boolean;
}

export interface DailyBatchSummary {
  fecha: string;
  sucursalId: string;
  count: number;
  maxBases: number;
  nextLoteNum: number;
  limitReached: boolean;
  totalHoyClientes: number;
  totalHoyRegistradas: number;
  slots: DailyBatchSlotSummary[];
}

export function getDailyBatchSummaryForBranch(
  llamadas: LlamadaSucursal[],
  sucursalId: string,
  fechaStr: string = getTodayLocalYYYYMMDD()
): DailyBatchSummary {
  const maxBases = 3;
  const branchTodayCalls = llamadas.filter(
    (l) => l.sucursal_id === sucursalId && getLlamadaLocalDate(l) === fechaStr
  );

  const grouped = new Map<
    string,
    {
      loteNum: number | null;
      totalRegistros: number;
      llamadasRealizadas: number;
      firstTs: string;
    }
  >();

  for (const item of branchTodayCalls) {
    const info = extractLlamadaBatchInfo(item);
    if (!info) continue;
    const existing = grouped.get(info.batchKey);
    if (existing) {
      existing.totalRegistros += 1;
      if (item.llamada_registrada) existing.llamadasRealizadas += 1;
    } else {
      grouped.set(info.batchKey, {
        loteNum: info.loteNum,
        totalRegistros: 1,
        llamadasRealizadas: item.llamada_registrada ? 1 : 0,
        firstTs: item.fecha_registro || '',
      });
    }
  }

  const orderedBatches = Array.from(grouped.entries()).sort(([, a], [, b]) => {
    if (a.loteNum !== null && b.loteNum !== null && a.loteNum !== b.loteNum) {
      return a.loteNum - b.loteNum;
    }
    return a.firstTs.localeCompare(b.firstTs);
  });

  const slots: DailyBatchSlotSummary[] = [1, 2, 3].map((slotNum) => {
    const matched =
      orderedBatches.find(([, val]) => val.loteNum === slotNum) ||
      orderedBatches[slotNum - 1];
    if (matched) {
      return {
        slot: slotNum,
        batchKey: matched[0],
        totalRegistros: matched[1].totalRegistros,
        llamadasRealizadas: matched[1].llamadasRealizadas,
        loaded: true,
      };
    }
    return {
      slot: slotNum,
      batchKey: '',
      totalRegistros: 0,
      llamadasRealizadas: 0,
      loaded: false,
    };
  });

  const count = orderedBatches.length;
  const totalHoyClientes = branchTodayCalls.length;
  const totalHoyRegistradas = branchTodayCalls.filter(
    (l) => l.llamada_registrada
  ).length;

  return {
    fecha: fechaStr,
    sucursalId,
    count,
    maxBases,
    nextLoteNum: Math.min(maxBases, count + 1),
    limitReached: count >= maxBases,
    totalHoyClientes,
    totalHoyRegistradas,
    slots,
  };
}

export function buildCatalogActividadId(
  tareaId: string,
  sucursalId: string,
  fechaStr: string
): string {
  return `act-cat-${tareaId}__${sucursalId}__${fechaStr}`;
}

export function extractCatalogTaskId(actividadId: string): string | null {
  if (!actividadId.startsWith('act-cat-')) return null;
  const rest = actividadId.slice('act-cat-'.length);
  const sepIdx = rest.indexOf('__');
  if (sepIdx === -1) return null;
  return rest.slice(0, sepIdx);
}

export const BASE_TASK_ID_SET = new Set(BASE_DAILY_TASKS.map((t) => t.id));

export function isFixedBaseTask(tarea: Pick<TareaCatalogo, 'id' | 'titulo'>): boolean {
  if (BASE_TASK_ID_SET.has(tarea.id)) return true;
  const norm = tarea.titulo.trim().toLowerCase();
  return BASE_DAILY_TASKS.some((b) => b.titulo.trim().toLowerCase() === norm);
}

export function ensureBaseDailyCatalogTasks(
  tareasCatalogo: TareaCatalogo[] = []
): TareaCatalogo[] {
  const safeInput = Array.isArray(tareasCatalogo) ? tareasCatalogo : [];
  const usedInputIds = new Set<string>();

  const mergedBase: TareaCatalogo[] = BASE_DAILY_TASKS.map((base) => {
    const match =
      safeInput.find((t) => t.id === base.id) ||
      safeInput.find(
        (t) =>
          t.titulo.trim().toLowerCase() === base.titulo.trim().toLowerCase()
      );
    if (!match) return { ...base };
    usedInputIds.add(match.id);
    return {
      ...base,
      ...match,
      id: base.id,
      sucursal_id: 'todas',
      dias_semana:
        match.dias_semana && match.dias_semana.length > 0
          ? match.dias_semana
          : base.dias_semana,
      activa: true, // Fixed daily base tasks never disappear from daily view
    };
  });

  const extraCustom = safeInput.filter((t) => !usedInputIds.has(t.id));
  return [...mergedBase, ...extraCustom];
}

export function resolveTareaHorarioForContext(
  tarea: TareaCatalogo,
  sucursalId: string,
  cajeraContext?: { id?: string; nombre?: string }
): HorarioPersonalizado {
  const cajeraOverrides = tarea.horarios_por_cajera || {};
  const byCajeraId = cajeraContext?.id
    ? cajeraOverrides[cajeraContext.id]
    : undefined;
  const byCajeraNombre = cajeraContext?.nombre
    ? cajeraOverrides[cajeraContext.nombre.trim().toLowerCase()] ||
      cajeraOverrides[cajeraContext.nombre.trim()]
    : undefined;

  const cajeraCustom = byCajeraId || byCajeraNombre;
  if (cajeraCustom) {
    return {
      sin_horario_limite: Boolean(cajeraCustom.sin_horario_limite),
      hora_limite: cajeraCustom.sin_horario_limite
        ? null
        : cajeraCustom.hora_limite ?? tarea.hora_limite ?? null,
    };
  }

  const branchCustom = tarea.horarios_por_sucursal?.[sucursalId];
  if (branchCustom) {
    return {
      sin_horario_limite: Boolean(branchCustom.sin_horario_limite),
      hora_limite: branchCustom.sin_horario_limite
        ? null
        : branchCustom.hora_limite ?? tarea.hora_limite ?? null,
    };
  }

  return {
    sin_horario_limite: Boolean(tarea.sin_horario_limite),
    hora_limite: tarea.sin_horario_limite ? null : tarea.hora_limite ?? null,
  };
}

export function calcularPuntualidadEnvio(
  estatus: ActividadDiaria['estatus'],
  horaCompletada: string | null | undefined,
  horaLimite: string | null | undefined,
  sinHorarioLimite?: boolean
): PuntualidadActividad {
  if (estatus !== 'Completada' && estatus !== 'Observada') {
    return 'Pendiente';
  }
  if (sinHorarioLimite || !horaLimite) {
    return 'Sin horario límite';
  }
  if (!horaCompletada) return 'A tiempo';
  return horaCompletada > horaLimite ? 'A destiempo' : 'A tiempo';
}

export function resolveDailyTasksForBranch(
  sucursal: Sucursal,
  tareasCatalogo: TareaCatalogo[],
  actividades: ActividadDiaria[],
  diaActivo: DiaSemana,
  fechaStr: string = getTodayLocalYYYYMMDD(),
  cajeraContext?: { id?: string; nombre?: string }
): ActividadDiaria[] {
  const guaranteedCatalog = ensureBaseDailyCatalogTasks(tareasCatalogo);
  const activeCatalogTasks = guaranteedCatalog.filter((t) => {
    if (isFixedBaseTask(t)) return true; // 9 base tasks always appear every day
    return (
      t.activa !== false &&
      (!t.sucursal_id ||
        t.sucursal_id === 'todas' ||
        t.sucursal_id === sucursal.id) &&
      (!t.dias_semana ||
        t.dias_semana.length === 0 ||
        t.dias_semana.includes(diaActivo))
    );
  });

  const catalogTaskIdSet = new Set(guaranteedCatalog.map((t) => t.id));
  const branchActsOnDate = actividades.filter(
    (a) => a.sucursal_id === sucursal.id && a.fecha === fechaStr
  );

  const usedRecordIds = new Set<string>();

  const resolvedFromCatalog: ActividadDiaria[] = activeCatalogTasks.map(
    (tarea) => {
      const deterministicId = buildCatalogActividadId(
        tarea.id,
        sucursal.id,
        fechaStr
      );
      const match =
        branchActsOnDate.find((a) => a.id === deterministicId) ||
        branchActsOnDate.find(
          (a) => extractCatalogTaskId(a.id) === tarea.id
        ) ||
        branchActsOnDate.find(
          (a) =>
            !usedRecordIds.has(a.id) &&
            a.titulo.trim().toLowerCase() === tarea.titulo.trim().toLowerCase()
        );

      const resolvedHorario = resolveTareaHorarioForContext(
        tarea,
        sucursal.id,
        cajeraContext || {
          id: match?.cajera_id,
          nombre: match?.cajera_nombre || sucursal.responsable_caja,
        }
      );

      if (match) {
        usedRecordIds.add(match.id);
        const effSinLimite = Boolean(resolvedHorario.sin_horario_limite);
        const effHoraLimite = effSinLimite
          ? null
          : resolvedHorario.hora_limite ?? match.hora_limite ?? null;
        return {
          ...match,
          titulo: tarea.titulo,
          descripcion:
            tarea.descripcion !== undefined
              ? tarea.descripcion
              : match.descripcion,
          categoria: tarea.categoria || match.categoria,
          dias_semana:
            tarea.dias_semana && tarea.dias_semana.length > 0
              ? tarea.dias_semana
              : match.dias_semana,
          hora_limite: effHoraLimite,
          sin_horario_limite: effSinLimite,
          puntualidad:
            match.puntualidad && match.puntualidad !== 'Pendiente'
              ? match.puntualidad
              : calcularPuntualidadEnvio(
                  match.estatus,
                  match.hora_completada,
                  effHoraLimite,
                  effSinLimite
                ),
        };
      }

      return {
        id: deterministicId,
        sucursal_id: sucursal.id,
        sucursal_nombre: sucursal.nombre,
        sucursal: sucursal.nombre,
        cajera_id: cajeraContext?.id,
        cajera_nombre: cajeraContext?.nombre || sucursal.responsable_caja,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion || '',
        categoria: tarea.categoria,
        responsable: cajeraContext?.nombre || sucursal.responsable_caja,
        fecha: fechaStr,
        dias_semana: tarea.dias_semana,
        hora_limite: resolvedHorario.sin_horario_limite
          ? null
          : resolvedHorario.hora_limite ?? null,
        sin_horario_limite: Boolean(resolvedHorario.sin_horario_limite),
        hora_completada: null,
        estatus: 'Pendiente',
        puntualidad: 'Pendiente',
        validacion_admin: 'Pendiente',
        evidencia_url: null,
        observaciones: '',
      };
    }
  );

  // Include standalone branch-specific records in actividades_diarias that aren't deleted catalog orphans
  const extraStandalone = actividades.filter((a) => {
    if (a.sucursal_id !== sucursal.id) return false;
    if (usedRecordIds.has(a.id)) return false;
    const catId = extractCatalogTaskId(a.id);
    if (catId) {
      // If it came from a catalog task that is paused/deleted/not for this day, skip it
      return false;
    }
    if (
      a.dias_semana &&
      a.dias_semana.length > 0 &&
      !a.dias_semana.includes(diaActivo)
    ) {
      return false;
    }
    if (catalogTaskIdSet.size > 0 && a.fecha && a.fecha !== fechaStr) {
      return false;
    }
    return true;
  });

  const combined = [...resolvedFromCatalog, ...extraStandalone];
  return combined.sort((a, b) => {
    if (a.sin_horario_limite && !b.sin_horario_limite) return 1;
    if (!a.sin_horario_limite && b.sin_horario_limite) return -1;
    const ha = a.hora_limite || '23:59';
    const hb = b.hora_limite || '23:59';
    return ha.localeCompare(hb);
  });
}

export function evaluarVencimientoActividad(
  actividad: ActividadDiaria,
  horario: HorarioSucursalDia | undefined,
  horaActualReferencia = getCurrentLocalHHMM()
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

  if (actividad.estatus === 'Completada' || actividad.estatus === 'Observada') {
    if (
      actividad.puntualidad === 'A destiempo' ||
      (actividad.hora_completada && actividad.hora_completada > horaLimite)
    ) {
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

export interface BranchSummaryFilterOptions {
  monthPrefix?: string; // 'YYYY-MM' or 'YYYY' or 'todos'
  cajeraNombre?: string; // 'todas' or exact/partial name
}

export function computeBranchSummaries(
  sucursales: Sucursal[],
  llamadas: LlamadaSucursal[],
  actividades: ActividadDiaria[],
  gastosYRefrendos: GastoYRefrendo[],
  horarios: HorarioSucursalDia[],
  diaActivo: DiaSemana,
  metasSucursal: MetaSucursal[] = [],
  tareasCatalogo: TareaCatalogo[] = [],
  filterOptions?: BranchSummaryFilterOptions
): BranchMetricSummary[] {
  const activas = sucursales.filter((s) => s.activa);
  const todayStr = getTodayLocalYYYYMMDD();
  const monthPrefix =
    filterOptions?.monthPrefix && filterOptions.monthPrefix !== 'todos'
      ? filterOptions.monthPrefix
      : '';
  const cajeraFilter =
    filterOptions?.cajeraNombre && filterOptions.cajeraNombre !== 'todas'
      ? filterOptions.cajeraNombre.trim().toLowerCase()
      : '';

  const filteredByCajeraSucursales = cajeraFilter
    ? activas.filter(
        (s) =>
          s.responsable_caja.trim().toLowerCase() === cajeraFilter ||
          llamadas.some(
            (l) =>
              l.sucursal_id === s.id &&
              l.cajera_nombre.trim().toLowerCase() === cajeraFilter
          )
      )
    : activas;

  return filteredByCajeraSucursales.map((sucursal) => {
    const metaConfig = metasSucursal.find((m) => m.sucursal_id === sucursal.id);

    const llamadasSuc = llamadas.filter((l) => {
      if (l.sucursal_id !== sucursal.id) return false;
      if (monthPrefix && !getLlamadaLocalDate(l).startsWith(monthPrefix)) {
        return false;
      }
      if (
        cajeraFilter &&
        l.cajera_nombre.trim().toLowerCase() !== cajeraFilter &&
        sucursal.responsable_caja.trim().toLowerCase() !== cajeraFilter
      ) {
        return false;
      }
      return true;
    });
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

    const actividadesSuc = resolveDailyTasksForBranch(
      sucursal,
      tareasCatalogo,
      actividades,
      diaActivo,
      todayStr
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

    const gastosSuc = gastosYRefrendos.filter((g) => {
      if (g.sucursal_id !== sucursal.id || g.tipo !== 'Gasto') return false;
      if (monthPrefix && !(g.fecha || '').startsWith(monthPrefix)) return false;
      if (
        cajeraFilter &&
        g.responsable.trim().toLowerCase() !== cajeraFilter &&
        sucursal.responsable_caja.trim().toLowerCase() !== cajeraFilter
      ) {
        return false;
      }
      return true;
    });
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

    const refrendosSuc = gastosYRefrendos.filter((g) => {
      if (g.sucursal_id !== sucursal.id || g.tipo !== 'Refrendo') return false;
      if (monthPrefix && !(g.fecha || '').startsWith(monthPrefix)) return false;
      if (
        cajeraFilter &&
        g.responsable.trim().toLowerCase() !== cajeraFilter &&
        sucursal.responsable_caja.trim().toLowerCase() !== cajeraFilter
      ) {
        return false;
      }
      return true;
    });
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
