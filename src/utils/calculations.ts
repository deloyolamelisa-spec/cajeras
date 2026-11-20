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

export const MEXICO_TIMEZONE = 'America/Mexico_City';

export function roundMoney2(value: unknown): number {
  const num =
    typeof value === 'string'
      ? Number(value.replace(/[$,\s]/g, ''))
      : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function parseMoneyInput(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? Math.round((value + Number.EPSILON) * 100) / 100
      : 0;
  }
  const cleaned = String(value ?? '')
    .replace(/[$,\s]/g, '')
    .trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function formatMXN(amount: number, decimals = 0): string {
  const safe = roundMoney2(amount);
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
}

export function formatCurrencyClean(amount: number): string {
  const rounded = roundMoney2(amount);
  const hasCents = Math.abs(rounded - Math.trunc(rounded)) > 0.0001;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: hasCents ? 2 : 0,
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

export function getMexicoNowParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  yyyyMmDd: string;
  monthPrefix: string;
  hhmm: string;
  diaSemana: DiaSemana;
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: MEXICO_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value || '';
    const yStr = get('year');
    const mStr = get('month');
    const dStr = get('day');
    let hStr = get('hour');
    const minStr = get('minute');
    if (hStr === '24') hStr = '00';
    const yyyyMmDd = `${yStr}-${mStr}-${dStr}`;
    return {
      year: Number(yStr) || date.getFullYear(),
      month: Number(mStr) || date.getMonth() + 1,
      day: Number(dStr) || date.getDate(),
      yyyyMmDd,
      monthPrefix: `${yStr}-${mStr}`,
      hhmm: `${hStr.padStart(2, '0')}:${minStr.padStart(2, '0')}`,
      diaSemana: getDiaSemanaFromDate(yyyyMmDd),
    };
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const yyyyMmDd = `${y}-${m}-${d}`;
    return {
      year: y,
      month: Number(m),
      day: Number(d),
      yyyyMmDd,
      monthPrefix: `${y}-${m}`,
      hhmm: `${hh}:${mm}`,
      diaSemana: getDiaSemanaFromDate(yyyyMmDd),
    };
  }
}

export function getDiaSemanaFromDate(yyyyMmDd: string): DiaSemana {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0));
  const map: Record<number, DiaSemana> = {
    0: 'domingo',
    1: 'lunes',
    2: 'martes',
    3: 'miercoles',
    4: 'jueves',
    5: 'viernes',
    6: 'sabado',
  };
  return map[dateObj.getUTCDay()] ?? 'lunes';
}

export function formatMexicoDateLabel(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0));
  const raw = dateObj.toLocaleDateString('es-MX', {
    timeZone: MEXICO_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

export function formatMexicoMonthYearUpper(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0));
  return dateObj
    .toLocaleDateString('es-MX', {
      timeZone: MEXICO_TIMEZONE,
      month: 'long',
      year: 'numeric',
    })
    .replace(' de ', ' ')
    .toUpperCase();
}

export function addDaysYYYYMMDD(yyyyMmDd: string, offsetDays: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function sanitizePhoneForWhatsApp(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('52') && digits.length >= 12) {
    return digits;
  }
  if (digits.length === 10) {
    return `52${digits}`;
  }
  return `52${digits}`;
}

export function formatAmountPlain(amount: number): string {
  const rounded = roundMoney2(amount);
  const hasCents = Math.abs(rounded - Math.trunc(rounded)) > 0.001;
  return rounded.toLocaleString('es-MX', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function renderWhatsAppTemplate(
  template: string,
  item: Pick<
    LlamadaSucursal,
    | 'cliente_nombre'
    | 'contrato'
    | 'monto_prestamo'
    | 'fecha_vencimiento'
    | 'sucursal_nombre'
    | 'sucursal'
    | 'telefono'
  >
): string {
  const cliente = (item.cliente_nombre || 'Cliente').trim();
  const contrato = (item.contrato || 'S/N').trim();
  const monto = formatAmountPlain(item.monto_prestamo);
  const fechaVenc = (item.fecha_vencimiento || '').trim();
  const sucursal = (item.sucursal_nombre || item.sucursal || 'Sucursal').trim();
  const telefono = (item.telefono || '').trim();

  return String(template || '')
    .replace(/\{cliente\}/gi, cliente)
    .replace(/\{contrato\}/gi, contrato)
    .replace(/\{monto\}/gi, monto)
    .replace(/\{fecha_vencimiento\}/gi, fechaVenc)
    .replace(/\{sucursal\}/gi, sucursal)
    .replace(/\{telefono\}/gi, telefono);
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = sanitizePhoneForWhatsApp(phone);
  const base = `https://wa.me/${cleanPhone}`;
  const trimmedMsg = message.trim();
  if (!trimmedMsg) return base;
  return `${base}?text=${encodeURIComponent(trimmedMsg)}`;
}

export function getTodayDiaSemana(): DiaSemana {
  return getMexicoNowParts().diaSemana;
}

export function getCurrentLocalHHMM(): string {
  return getMexicoNowParts().hhmm;
}

export function getTodayLocalYYYYMMDD(): string {
  return getMexicoNowParts().yyyyMmDd;
}

export function toLocalYYYYMMDD(dateInput?: string | Date | null): string {
  if (!dateInput) return getTodayLocalYYYYMMDD();
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return getMexicoNowParts(parsed).yyyyMmDd;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    return getMexicoNowParts(dateInput).yyyyMmDd;
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
  fechaDesde?: string; // 'YYYY-MM-DD'
  fechaHasta?: string; // 'YYYY-MM-DD'
}

function enumerateDateRange(start: string, end: string, maxDays = 366): string[] {
  if (!start || !end || start > end) return [];
  const dates: string[] = [];
  let cursor = start;
  for (let i = 0; i < maxDays; i++) {
    dates.push(cursor);
    if (cursor >= end) break;
    cursor = addDaysYYYYMMDD(cursor, 1);
  }
  return dates;
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
  const currentMonthPrefix = todayStr.slice(0, 7);
  const monthPrefix =
    filterOptions?.monthPrefix && filterOptions.monthPrefix !== 'todos'
      ? filterOptions.monthPrefix
      : '';
  const rawDesde = (filterOptions?.fechaDesde || '').trim();
  const rawHasta = (filterOptions?.fechaHasta || '').trim();
  const hasRange = Boolean(rawDesde || rawHasta);
  const rangeStart =
    rawDesde && rawHasta && rawDesde > rawHasta ? rawHasta : rawDesde;
  const rangeEnd =
    rawDesde && rawHasta && rawDesde > rawHasta ? rawDesde : rawHasta;

  const matchesRange = (dateStr: string): boolean => {
    if (!dateStr) return false;
    if (rangeStart && dateStr < rangeStart) return false;
    if (rangeEnd && dateStr > rangeEnd) return false;
    return true;
  };

  const matchesLlamadaDate = (dateStr: string): boolean => {
    if (hasRange) return matchesRange(dateStr);
    if (monthPrefix) return Boolean(dateStr && dateStr.startsWith(monthPrefix));
    return dateStr === todayStr;
  };

  const matchesFinanceDate = (dateStr: string): boolean => {
    if (hasRange) return matchesRange(dateStr);
    if (monthPrefix) return Boolean(dateStr && dateStr.startsWith(monthPrefix));
    return Boolean(dateStr && dateStr.startsWith(currentMonthPrefix));
  };

  const activityDates: string[] = (() => {
    if (!hasRange) return [todayStr];
    if (rangeStart && rangeEnd) {
      const capEnd = rangeEnd > todayStr && rangeStart <= todayStr ? todayStr : rangeEnd;
      const list = enumerateDateRange(rangeStart, capEnd);
      return list.length > 0 ? list : [rangeStart];
    }
    return [rangeStart || rangeEnd || todayStr];
  })();

  const rangeDaysCount = Math.max(1, activityDates.length);

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
      if (!matchesLlamadaDate(getLlamadaLocalDate(l))) return false;
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
    const metaDiariaLlamadas =
      metaConfig?.meta_llamadas_diarias || sucursal.meta_llamadas_diarias || 30;
    let metaLlamadas = metaDiariaLlamadas;
    if (hasRange && rangeDaysCount > 1) {
      metaLlamadas = metaDiariaLlamadas * rangeDaysCount;
    } else if (!hasRange && monthPrefix.length === 7) {
      const [yy, mm] = monthPrefix.split('-').map(Number);
      const daysInMo =
        yy && mm ? new Date(Date.UTC(yy, mm, 0)).getUTCDate() : 30;
      metaLlamadas = metaDiariaLlamadas * daysInMo;
    }
    const pctLlamadas =
      metaLlamadas > 0
        ? Math.min(100, (llamadasRegistradas / metaLlamadas) * 100)
        : 0;

    let actividadesCompletadas = 0;
    let actividadesTotal = 0;
    let actividadesVencidas = 0;

    for (const targetDate of activityDates) {
      const diaTarget = hasRange ? getDiaSemanaFromDate(targetDate) : diaActivo;
      const actividadesSuc = resolveDailyTasksForBranch(
        sucursal,
        tareasCatalogo,
        actividades,
        diaTarget,
        targetDate
      );
      const horarioDia = horarios.find(
        (h) => h.sucursal_id === sucursal.id && h.dia === diaTarget
      );
      actividadesTotal += actividadesSuc.length;
      actividadesCompletadas += actividadesSuc.filter(
        (a) => a.estatus === 'Completada'
      ).length;
      actividadesVencidas += actividadesSuc.filter((a) => {
        if (targetDate < todayStr) {
          return a.estatus !== 'Completada' && !a.sin_horario_limite;
        }
        if (targetDate > todayStr) {
          return false;
        }
        return evaluarVencimientoActividad(a, horarioDia).vencidaPorHora;
      }).length;
    }

    const pctActividades =
      actividadesTotal > 0 ? (actividadesCompletadas / actividadesTotal) * 100 : 0;

    const gastosSuc = gastosYRefrendos.filter((g) => {
      if (g.sucursal_id !== sucursal.id || g.tipo !== 'Gasto') return false;
      if (!matchesFinanceDate(g.fecha || '')) return false;
      if (
        cajeraFilter &&
        g.responsable.trim().toLowerCase() !== cajeraFilter &&
        sucursal.responsable_caja.trim().toLowerCase() !== cajeraFilter
      ) {
        return false;
      }
      return true;
    });
    const gastoRealTotal = roundMoney2(
      gastosSuc.reduce((acc, g) => acc + (Number(g.monto_real) || 0), 0)
    );
    const sumaTechosGasto = roundMoney2(
      gastosSuc.reduce((acc, g) => acc + (Number(g.presupuesto_limite) || 0), 0)
    );
    const gastoPresupuestoTotal = roundMoney2(
      metaConfig?.techo_gasto_mensual ??
        sucursal.techo_gasto_mensual ??
        sumaTechosGasto
    );
    const gastoCalc = calcularExcesoPresupuesto(
      gastoRealTotal,
      gastoPresupuestoTotal
    );

    const refrendosSuc = gastosYRefrendos.filter((g) => {
      if (g.sucursal_id !== sucursal.id || g.tipo !== 'Refrendo') return false;
      if (!matchesFinanceDate(g.fecha || '')) return false;
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
      (acc, r) => acc + (Number(r.cantidad_refrendos) || 0),
      0
    );
    const refrendosMetaRaw =
      metaConfig?.meta_refrendos_mensual ??
      sucursal.meta_refrendos_mensual ??
      (refrendosSuc.reduce((acc, r) => acc + (Number(r.meta_refrendos) || 0), 0) ||
        40);
    const refrendosMeta = roundMoney2(refrendosMetaRaw);
    const montoRefrendos = roundMoney2(
      refrendosSuc.reduce((acc, r) => acc + (Number(r.monto_real) || 0), 0)
    );
    const pctRefrendos =
      refrendosMeta > 0
        ? refrendosMeta >= 500
          ? (montoRefrendos / refrendosMeta) * 100
          : (refrendosRealizados / refrendosMeta) * 100
        : 0;

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
      excesoDinero: roundMoney2(gastoCalc.excesoDinero),
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
