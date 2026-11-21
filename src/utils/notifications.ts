import type { MutableRefObject } from 'react';
import { ActividadDiaria, FraseMotivacional } from '../types/controlops';
import { DEFAULT_FRASES_MOTIVACIONALES } from '../data/mockData';
import { extractCatalogTaskId, formatHora12h } from './calculations';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface NotificationPermissionRecord {
  userId: string;
  permission: NotificationPermissionState;
  registeredAt: string;
  source: 'init' | 'prompt' | 'permissions_api' | 'sync';
}

export interface DailyLuckyTaskRecord {
  taskKey: string;
  taskId: string;
  taskTitle: string;
  pickedAt: string;
}

export interface DailyTriggeredMotivation {
  taskKey: string;
  taskId: string;
  taskTitle: string;
  phrase: string;
  triggeredAt: string;
}

const PERMISSION_RECORD_PREFIX = 'controlops_notif_permission_v1_';
const PERMISSION_REGISTRY_KEY = 'controlops_notif_permissions_registry_v1';
const LUCKY_TASK_PREFIX = 'controlops_lucky_task_v1_';
const LUCKY_TRIGGERED_PREFIX = 'controlops_lucky_triggered_v1_';

export function getBrowserNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function registerNotificationPermissionRecord(
  userId: string,
  permission: NotificationPermissionState,
  source: NotificationPermissionRecord['source'] = 'sync'
): NotificationPermissionRecord {
  const safeUserId = (userId || 'anon').trim() || 'anon';
  const record: NotificationPermissionRecord = {
    userId: safeUserId,
    permission,
    registeredAt: new Date().toISOString(),
    source,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        `${PERMISSION_RECORD_PREFIX}${safeUserId}`,
        JSON.stringify(record)
      );
      const rawRegistry = window.localStorage.getItem(PERMISSION_REGISTRY_KEY);
      const registry: Record<string, NotificationPermissionRecord> =
        rawRegistry ? JSON.parse(rawRegistry) : {};
      registry[safeUserId] = record;
      window.localStorage.setItem(
        PERMISSION_REGISTRY_KEY,
        JSON.stringify(registry)
      );
    } catch {
      // Ignore storage quota / private mode errors
    }
  }

  return record;
}

export function getRegisteredNotificationPermission(
  userId: string
): NotificationPermissionRecord | null {
  if (typeof window === 'undefined') return null;
  const safeUserId = (userId || 'anon').trim() || 'anon';
  try {
    const raw = window.localStorage.getItem(
      `${PERMISSION_RECORD_PREFIX}${safeUserId}`
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NotificationPermissionRecord;
    if (parsed && parsed.permission) return parsed;
  } catch {
    // Ignore parse errors
  }
  return null;
}

export async function requestAndRegisterNotificationPermission(
  userId: string
): Promise<{
  permission: NotificationPermissionState;
  record: NotificationPermissionRecord;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    const record = registerNotificationPermissionRecord(
      userId,
      'unsupported',
      'prompt'
    );
    return { permission: 'unsupported', record };
  }

  let result: NotificationPermission = Notification.permission;
  try {
    result = await Notification.requestPermission();
  } catch {
    result = Notification.permission;
  }

  const record = registerNotificationPermissionRecord(userId, result, 'prompt');

  if (result === 'granted') {
    try {
      new Notification('Notificaciones activadas · ControlOps', {
        body: 'Recibirás avisos automáticos 10 minutos antes de que venza cada actividad pendiente del día.',
        tag: `controlops_notif_welcome_${userId}`,
      });
    } catch {
      // Ignore environments restricting direct Notification constructor
    }
  }

  return { permission: result, record };
}

export function sendTestBrowserNotification(userId: string): boolean {
  if (getBrowserNotificationPermission() !== 'granted') {
    return false;
  }
  try {
    new Notification('Prueba de aviso · ControlOps', {
      body: 'Tu permiso de notificaciones está registrado. Te avisaremos 10 min antes del vencimiento de cada tarea pendiente.',
      tag: `controlops_notif_test_${userId}_${Date.now()}`,
    });
    registerNotificationPermissionRecord(userId, 'granted', 'sync');
    return true;
  } catch {
    return false;
  }
}

export function subscribeNotificationPermissionChanges(
  userId: string,
  onChange: (
    permission: NotificationPermissionState,
    record: NotificationPermissionRecord
  ) => void
): () => void {
  const initialPerm = getBrowserNotificationPermission();
  const initialRecord = registerNotificationPermissionRecord(
    userId,
    initialPerm,
    'init'
  );
  onChange(initialPerm, initialRecord);

  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    typeof navigator === 'undefined' ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return () => {};
  }

  let active = true;
  let permStatus: PermissionStatus | null = null;

  const mapState = (state: PermissionState): NotificationPermissionState => {
    if (state === 'granted') return 'granted';
    if (state === 'denied') return 'denied';
    return 'default';
  };

  navigator.permissions
    .query({ name: 'notifications' as PermissionName })
    .then((status) => {
      if (!active) return;
      permStatus = status;
      const currentBrowserPerm = getBrowserNotificationPermission();
      const mapped =
        currentBrowserPerm !== 'unsupported'
          ? currentBrowserPerm
          : mapState(status.state);
      const rec = registerNotificationPermissionRecord(
        userId,
        mapped,
        'permissions_api'
      );
      onChange(mapped, rec);

      status.onchange = () => {
        if (!active) return;
        const livePerm =
          getBrowserNotificationPermission() !== 'unsupported'
            ? getBrowserNotificationPermission()
            : mapState(status.state);
        const updatedRec = registerNotificationPermissionRecord(
          userId,
          livePerm,
          'permissions_api'
        );
        onChange(livePerm, updatedRec);
      };
    })
    .catch(() => {
      // Some browsers reject navigator.permissions.query({ name: 'notifications' })
    });

  return () => {
    active = false;
    if (permStatus) {
      permStatus.onchange = null;
    }
  };
}

export function sendActivityDeadlineNotificationOnce(params: {
  userId: string;
  todayStr: string;
  actividadId: string;
  titulo: string;
  horaLimite: string;
  minsLeft: number;
  notifiedRef: MutableRefObject<Set<string>>;
}): boolean {
  if (getBrowserNotificationPermission() !== 'granted') return false;

  const storageKey = `controlops_notif_${params.todayStr}_${params.userId}_${params.actividadId}`;
  if (params.notifiedRef.current.has(storageKey)) return false;

  let alreadySent = false;
  try {
    alreadySent = window.sessionStorage.getItem(storageKey) === '1';
  } catch {
    alreadySent = false;
  }
  if (alreadySent) {
    params.notifiedRef.current.add(storageKey);
    return false;
  }

  try {
    new Notification('Recordatorio de actividad · ControlOps', {
      body: `"${params.titulo}" vence en ${params.minsLeft} min (${formatHora12h(params.horaLimite)}). Sube tu evidencia a tiempo.`,
      tag: storageKey,
    });
    params.notifiedRef.current.add(storageKey);
    try {
      window.sessionStorage.setItem(storageKey, '1');
    } catch {
      // Ignore storage errors
    }
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// 1-Random-Activity-Per-Day Motivational Congratulation Helper
// ============================================================

export function getActivityStableKey(
  act: Pick<ActividadDiaria, 'id' | 'titulo'>
): string {
  const catId = extractCatalogTaskId(act.id);
  if (catId) return `cat:${catId}`;
  const cleanTitle = (act.titulo || '').trim().toLowerCase();
  if (cleanTitle) return `title:${cleanTitle}`;
  return `id:${act.id}`;
}

export function pickRandomMotivationalPhrase(
  frases?: FraseMotivacional[]
): string {
  const customActive = (frases || []).filter(
    (f) => f.activa && f.texto.trim().length > 0
  );
  const pool =
    customActive.length > 0
      ? customActive
      : DEFAULT_FRASES_MOTIVACIONALES.filter(
          (f) => f.activa && f.texto.trim().length > 0
        );
  const safePool = pool.length > 0 ? pool : DEFAULT_FRASES_MOTIVACIONALES;
  const idx = Math.floor(Math.random() * safePool.length);
  return (
    safePool[idx]?.texto ||
    '¡Excelente trabajo hoy! Tu constancia marca la diferencia en la sucursal.'
  );
}

export function getTodayTriggeredMotivation(
  todayStr: string,
  userId: string
): DailyTriggeredMotivation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(
      `${LUCKY_TRIGGERED_PREFIX}${todayStr}_${userId}`
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyTriggeredMotivation;
    if (parsed && parsed.phrase && parsed.taskTitle) return parsed;
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function ensureDailyLuckyTask(
  todayStr: string,
  userId: string,
  tasks: Pick<ActividadDiaria, 'id' | 'titulo' | 'estatus'>[]
): DailyLuckyTaskRecord | null {
  if (typeof window === 'undefined') return null;
  if (getTodayTriggeredMotivation(todayStr, userId)) {
    return null;
  }

  const pendingTasks = tasks.filter((t) => t.estatus !== 'Completada');
  if (pendingTasks.length === 0) return null;

  const storageKey = `${LUCKY_TASK_PREFIX}${todayStr}_${userId}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const existing = JSON.parse(raw) as DailyLuckyTaskRecord;
      if (existing && existing.taskKey) {
        const stillPending = pendingTasks.find(
          (t) =>
            getActivityStableKey(t) === existing.taskKey ||
            t.id === existing.taskId
        );
        if (stillPending) {
          return existing;
        }
      }
    }
  } catch {
    // Re-pick below if corrupt
  }

  const chosen = pendingTasks[Math.floor(Math.random() * pendingTasks.length)];
  const record: DailyLuckyTaskRecord = {
    taskKey: getActivityStableKey(chosen),
    taskId: chosen.id,
    taskTitle: chosen.titulo,
    pickedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Ignore storage errors
  }
  return record;
}

export function evaluateLuckyMotivationOnTaskCompleted(params: {
  todayStr: string;
  userId: string;
  completedTask: Pick<ActividadDiaria, 'id' | 'titulo'>;
  tasksBeforeCompletion: Pick<ActividadDiaria, 'id' | 'titulo' | 'estatus'>[];
  frases?: FraseMotivacional[];
}): DailyTriggeredMotivation | null {
  const { todayStr, userId, completedTask, tasksBeforeCompletion, frases } =
    params;

  // Strictly at most 1 random activity per day receives the motivational message
  if (getTodayTriggeredMotivation(todayStr, userId)) {
    return null;
  }

  const completedKey = getActivityStableKey(completedTask);

  // Ensure completedTask is treated as a candidate from the pending pool
  const candidatePool = tasksBeforeCompletion.map((t) =>
    getActivityStableKey(t) === completedKey || t.id === completedTask.id
      ? { ...t, estatus: 'Pendiente' as const }
      : t
  );
  if (
    !candidatePool.some(
      (t) =>
        getActivityStableKey(t) === completedKey || t.id === completedTask.id
    )
  ) {
    candidatePool.push({
      id: completedTask.id,
      titulo: completedTask.titulo,
      estatus: 'Pendiente',
    });
  }

  const lucky = ensureDailyLuckyTask(todayStr, userId, candidatePool);
  if (!lucky) return null;

  const isLuckyMatch =
    lucky.taskKey === completedKey || lucky.taskId === completedTask.id;

  if (!isLuckyMatch) {
    return null;
  }

  const triggered: DailyTriggeredMotivation = {
    taskKey: completedKey,
    taskId: completedTask.id,
    taskTitle: completedTask.titulo,
    phrase: pickRandomMotivationalPhrase(frases),
    triggeredAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        `${LUCKY_TRIGGERED_PREFIX}${todayStr}_${userId}`,
        JSON.stringify(triggered)
      );
    } catch {
      // Ignore storage errors
    }
  }

  return triggered;
}
