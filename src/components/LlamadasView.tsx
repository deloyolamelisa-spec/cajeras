import React, { useEffect, useMemo, useState } from 'react';
import {
  Phone,
  MessageCircle,
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  X,
  Trash2,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  Pencil,
  RotateCcw,
  Star,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  EstatusAuditoriaLlamada,
  EstatusVencimiento,
  LlamadaSucursal,
  PlantillaWhatsApp,
  ReporteCajeraOpcion,
  RolUsuario,
  Sucursal,
} from '../types/controlops';
import {
  addDaysYYYYMMDD,
  buildWhatsAppUrl,
  extractLlamadaBatchInfo,
  formatCurrencyClean,
  getDailyBatchSummaryForBranch,
  getLlamadaLocalDate,
  getMexicoNowParts,
  getTodayLocalYYYYMMDD,
  isLlamadaRealizadaRecord,
  matchesSucursalRecord,
  MEXICO_TIMEZONE,
  parseMoneyInput,
  renderWhatsAppTemplate,
  toLocalYYYYMMDD,
} from '../utils/calculations';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../data/mockData';
import { ServiceResult } from '../services/controlOpsService';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface LlamadasViewProps {
  llamadas: LlamadaSucursal[];
  sucursales: Sucursal[];
  selectedSucursalId: string;
  userRole: RolUsuario;
  currentUserId?: string;
  currentUserName?: string;
  opcionesReporte: string[];
  plantillasWhatsApp?: PlantillaWhatsApp[];
  onSavePlantillasWhatsApp?: (
    plantillas: PlantillaWhatsApp[]
  ) => Promise<ServiceResult>;
  onUpdateLlamada: (updated: LlamadaSucursal) => Promise<ServiceResult | void>;
  onCreateLlamada: (
    nueva: LlamadaSucursal
  ) => Promise<ServiceResult | void>;
  onImportLlamadas: (nuevas: LlamadaSucursal[]) => Promise<ServiceResult | void>;
  onDeleteLlamada: (id: string) => Promise<void>;
  onSelectSucursal?: (id: string) => void;
  openCreateModalExternal?: boolean;
  onCloseCreateModalExternal?: () => void;
}

function normalizeText(val: string): string {
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseExcelOrStringDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return toLocalYYYYMMDD(raw);
  }
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const str = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return getTodayLocalYYYYMMDD();
}

function computeVencimientoFromDate(fechaVenc: string): EstatusVencimiento {
  const todayStr = getTodayLocalYYYYMMDD();
  if (fechaVenc < todayStr) return 'Vencido';
  const today = new Date(`${todayStr}T00:00:00`);
  const due = new Date(`${fechaVenc}T00:00:00`);
  const diffDays = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) return 'Por vencer';
  return 'Al corriente';
}

const REQUIRED_CALL_RESPONSES = [
  'Promesa de pago',
  'No contesta / Buzón',
  'Número equivocado',
  'Ya pagó',
  'Mensaje dejado',
];

function getMexicoExactTimeHHMMSS(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: MEXICO_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return getMexicoNowParts(date).hhmm;
  }
}

function getDisplayCallTime(item: LlamadaSucursal): string {
  if (item.hora_llamada && item.hora_llamada.trim()) {
    return item.hora_llamada.trim();
  }
  if (!item.fecha_registro) return '';
  const dt = new Date(item.fecha_registro);
  if (Number.isNaN(dt.getTime())) return '';
  return getMexicoExactTimeHHMMSS(dt);
}

function getItemLoanAmount(item: LlamadaSucursal): number {
  return parseMoneyInput(item.monto_prestamo ?? item.monto ?? 0);
}

export const LlamadasView: React.FC<LlamadasViewProps> = ({
  llamadas,
  sucursales,
  selectedSucursalId,
  userRole,
  currentUserId,
  currentUserName,
  opcionesReporte,
  plantillasWhatsApp,
  onSavePlantillasWhatsApp,
  onUpdateLlamada,
  onCreateLlamada,
  onImportLlamadas,
  onDeleteLlamada,
  onSelectSucursal,
  openCreateModalExternal = false,
  onCloseCreateModalExternal,
}) => {
  const isCajera = userRole === 'cajera';
  const isCreador = userRole === 'creador';
  const canAuditCalls = isCreador;
  const canImport = isCajera || isCreador;
  const canFilterBranch = !isCajera;
  const quickResponseOptions = useMemo(() => {
    const merged = new Set<string>(REQUIRED_CALL_RESPONSES);
    for (const op of opcionesReporte) {
      if (op && op !== 'Sin reporte') merged.add(op);
    }
    return Array.from(merged);
  }, [opcionesReporte]);
  const dropdownOpciones: ReporteCajeraOpcion[] = [
    'Sin reporte',
    ...quickResponseOptions,
  ];
  const [cajeraTab, setCajeraTab] = useState<'pendientes' | 'realizadas'>(
    'pendientes'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAuditoria, setFilterAuditoria] = useState<string>('todos');
  const [filterFecha, setFilterFecha] = useState<'hoy' | 'todos'>(() =>
    isCajera ? 'hoy' : 'todos'
  );
  const [filterVencimiento, setFilterVencimiento] = useState<string>('todos');
  const [venceDesde, setVenceDesde] = useState<string>('');
  const [venceHasta, setVenceHasta] = useState<string>('');
  const [montoMin, setMontoMin] = useState<string>('');
  const [montoMax, setMontoMax] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('recientes');
  const [draftObs, setDraftObs] = useState<Record<string, string>>({});
  const [rowRespuestaDrafts, setRowRespuestaDrafts] = useState<
    Record<string, string>
  >({});
  const [rowNotaDrafts, setRowNotaDrafts] = useState<Record<string, string>>(
    {}
  );
  const [savedToastId, setSavedToastId] = useState<string | null>(null);
  const [registeringRowId, setRegisteringRowId] = useState<string | null>(null);
  const [rowErrorToast, setRowErrorToast] = useState<string | null>(null);
  const [callActionToast, setCallActionToast] = useState<string | null>(null);

  // WhatsApp Templates & Row Personalization state
  const effectiveTemplates: PlantillaWhatsApp[] = useMemo(() => {
    if (plantillasWhatsApp && plantillasWhatsApp.length > 0) {
      return plantillasWhatsApp;
    }
    return DEFAULT_WHATSAPP_TEMPLATES;
  }, [plantillasWhatsApp]);

  const officialTemplate = useMemo(
    () =>
      effectiveTemplates.find((t) => t.es_oficial) || effectiveTemplates[0],
    [effectiveTemplates]
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    () => officialTemplate?.id || 'wa-oficial'
  );
  useEffect(() => {
    if (!effectiveTemplates.some((t) => t.id === selectedTemplateId)) {
      setSelectedTemplateId(officialTemplate?.id || effectiveTemplates[0]?.id || 'wa-oficial');
    }
  }, [effectiveTemplates, officialTemplate, selectedTemplateId]);

  const activeTemplate = useMemo(
    () =>
      effectiveTemplates.find((t) => t.id === selectedTemplateId) ||
      officialTemplate,
    [effectiveTemplates, selectedTemplateId, officialTemplate]
  );

  const [showWaEditor, setShowWaEditor] = useState(false);
  const [waTemplatesDraft, setWaTemplatesDraft] = useState<PlantillaWhatsApp[]>(
    effectiveTemplates
  );
  const [editingWaTemplateId, setEditingWaTemplateId] = useState<string>(
    officialTemplate?.id || effectiveTemplates[0]?.id || 'wa-oficial'
  );
  const [savingWaTemplates, setSavingWaTemplates] = useState(false);
  const [waSaveFeedback, setWaSaveFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [openRowWaId, setOpenRowWaId] = useState<string | null>(null);
  const [rowWaDrafts, setRowWaDrafts] = useState<Record<string, string>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LlamadaSucursal | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  // Import cartera modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [parsedImportRows, setParsedImportRows] = useState<LlamadaSucursal[]>(
    []
  );
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);

  // Form state for new call
  const defaultSucursal =
    selectedSucursalId === 'todas'
      ? sucursales[0]?.id || 'suc-centro'
      : selectedSucursalId;

  const [newForm, setNewForm] = useState({
    sucursal_id: defaultSucursal,
    cliente_nombre: '',
    contrato: '',
    telefono: '',
    monto_prestamo: '8500',
    estatus_vencimiento: 'Por vencer' as EstatusVencimiento,
    reporte_cajera: 'Promesa de pago' as ReporteCajeraOpcion,
    observaciones_admin: '',
  });

  const isModalOpen = isCajera && (showNewModal || openCreateModalExternal);
  const closeModal = () => {
    setShowNewModal(false);
    onCloseCreateModalExternal?.();
  };

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

  const scopedLlamadas = useMemo(() => {
    if (selectedSucursalId === 'todas') return llamadas;
    const targetSuc = sucursales.find((s) => s.id === selectedSucursalId);
    return llamadas.filter((l) =>
      matchesSucursalRecord(l, targetSuc || selectedSucursalId)
    );
  }, [llamadas, sucursales, selectedSucursalId]);

  const activeBranchForBatch =
    selectedSucursalId !== 'todas'
      ? selectedSucursalId
      : sucursales.find((s) => s.activa)?.id || sucursales[0]?.id || 'suc-centro';

  const activeBranchObj = useMemo(
    () => sucursales.find((s) => s.id === activeBranchForBatch) || sucursales[0],
    [sucursales, activeBranchForBatch]
  );

  const dailyBatchSummary = useMemo(
    () =>
      getDailyBatchSummaryForBranch(
        llamadas,
        activeBranchObj || activeBranchForBatch,
        todayStr
      ),
    [llamadas, activeBranchObj, activeBranchForBatch, todayStr]
  );

  const todayAllBranchesStats = useMemo(() => {
    const todayScoped = scopedLlamadas.filter(
      (l) => getLlamadaLocalDate(l) === todayStr
    );
    return {
      totalHoyClientes: todayScoped.length,
      totalHoyRegistradas: todayScoped.filter((l) =>
        isLlamadaRealizadaRecord(l)
      ).length,
    };
  }, [scopedLlamadas, todayStr]);

  const metrics = useMemo(() => {
    const todayScoped = scopedLlamadas.filter(
      (l) => getLlamadaLocalDate(l) === todayStr
    );
    const currentMonthPrefix = todayStr.slice(0, 7);
    const totalBaseHoy = todayScoped.length;
    const registradas = todayScoped.filter((l) =>
      isLlamadaRealizadaRecord(l)
    ).length;
    const pendientes = todayScoped.filter(
      (l) => !isLlamadaRealizadaRecord(l)
    ).length;
    const verificadas = todayScoped.filter(
      (l) => l.estatus_auditoria === 'Verificada'
    ).length;
    const falsas = todayScoped.filter(
      (l) => l.estatus_auditoria === 'Falsa'
    ).length;
    const sinAuditar = todayScoped.filter(
      (l) => l.estatus_auditoria === 'Sin auditar'
    ).length;
    const registradasMes = scopedLlamadas.filter(
      (l) =>
        isLlamadaRealizadaRecord(l) &&
        getLlamadaLocalDate(l).startsWith(currentMonthPrefix)
    ).length;

    const metaDiaria =
      selectedSucursalId === 'todas'
        ? sucursales.reduce((acc, s) => acc + (s.meta_llamadas_diarias || 30), 0)
        : sucursales.find((s) => s.id === selectedSucursalId)
            ?.meta_llamadas_diarias || 30;

    const pct = metaDiaria > 0 ? Math.min(100, (registradas / metaDiaria) * 100) : 0;
    const pctBaseHoy =
      totalBaseHoy > 0 ? Math.min(100, (registradas / totalBaseHoy) * 100) : 0;
    return {
      totalBaseHoy,
      registradas,
      pendientes,
      verificadas,
      falsas,
      sinAuditar,
      registradasMes,
      metaDiaria,
      pct,
      pctBaseHoy,
    };
  }, [scopedLlamadas, selectedSucursalId, sucursales, todayStr]);

  const filteredLlamadas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const soonLimit = addDaysYYYYMMDD(todayStr, 3);
    const hasMinMonto = montoMin.trim() !== '';
    const hasMaxMonto = montoMax.trim() !== '';
    const minVal = hasMinMonto ? parseMoneyInput(montoMin) : 0;
    const maxVal = hasMaxMonto ? parseMoneyInput(montoMax) : Number.POSITIVE_INFINITY;
    const rawVDesde = venceDesde.trim();
    const rawVHasta = venceHasta.trim();
    const vStart =
      rawVDesde && rawVHasta && rawVDesde > rawVHasta ? rawVHasta : rawVDesde;
    const vEnd =
      rawVDesde && rawVHasta && rawVDesde > rawVHasta ? rawVDesde : rawVHasta;

    const list = scopedLlamadas.filter((item) => {
      if (filterFecha === 'hoy' && getLlamadaLocalDate(item) !== todayStr) {
        return false;
      }
      if (q) {
        const matchText =
          (item.cliente_nombre || '').toLowerCase().includes(q) ||
          (item.contrato || '').toLowerCase().includes(q) ||
          (item.telefono || '').toLowerCase().includes(q);
        if (!matchText) return false;
      }

      if (filterAuditoria !== 'todos') {
        if (filterAuditoria === 'pendiente_marcar') {
          if (isLlamadaRealizadaRecord(item)) return false;
        } else if (filterAuditoria === 'marcadas') {
          if (!isLlamadaRealizadaRecord(item)) return false;
        } else if (canAuditCalls && item.estatus_auditoria !== filterAuditoria) {
          return false;
        }
      }

      if (filterVencimiento !== 'todos') {
        const fv = (item.fecha_vencimiento || '').slice(0, 10);
        if (filterVencimiento === 'Vencido') {
          if (!(fv < todayStr || item.estatus_vencimiento === 'Vencido')) {
            return false;
          }
        } else if (filterVencimiento === 'vencen_hoy') {
          if (fv !== todayStr) return false;
        } else if (filterVencimiento === 'Por vencer') {
          const isSoonByDate = Boolean(fv && fv > todayStr && fv <= soonLimit);
          if (!isSoonByDate && item.estatus_vencimiento !== 'Por vencer') {
            return false;
          }
        } else if (filterVencimiento === 'Al corriente') {
          if (item.estatus_vencimiento !== 'Al corriente' && !(fv > soonLimit)) {
            return false;
          }
        }
      }

      if (vStart || vEnd) {
        const fv = (item.fecha_vencimiento || '').slice(0, 10);
        if (!fv) return false;
        if (vStart && fv < vStart) return false;
        if (vEnd && fv > vEnd) return false;
      }

      const monto = getItemLoanAmount(item);
      if (hasMinMonto && monto < minVal) return false;
      if (hasMaxMonto && monto > maxVal) return false;

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'mayor_monto') {
        return getItemLoanAmount(b) - getItemLoanAmount(a);
      }
      if (sortBy === 'menor_monto') {
        return getItemLoanAmount(a) - getItemLoanAmount(b);
      }
      if (sortBy === 'vencimiento') {
        return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
      }
      return b.fecha_registro.localeCompare(a.fecha_registro);
    });

    return list;
  }, [
    scopedLlamadas,
    filterFecha,
    todayStr,
    searchQuery,
    filterAuditoria,
    filterVencimiento,
    venceDesde,
    venceHasta,
    montoMin,
    montoMax,
    sortBy,
    canAuditCalls,
  ]);

  const cajeraPendientes = useMemo(
    () => filteredLlamadas.filter((item) => !isLlamadaRealizadaRecord(item)),
    [filteredLlamadas]
  );

  const cajeraRealizadas = useMemo(
    () => filteredLlamadas.filter((item) => isLlamadaRealizadaRecord(item)),
    [filteredLlamadas]
  );

  const displayedLlamadas = useMemo(() => {
    if (!isCajera) return filteredLlamadas;
    return cajeraTab === 'pendientes' ? cajeraPendientes : cajeraRealizadas;
  }, [isCajera, cajeraTab, filteredLlamadas, cajeraPendientes, cajeraRealizadas]);

  const hasActiveFilters = Boolean(
    searchQuery ||
      filterAuditoria !== 'todos' ||
      filterVencimiento !== 'todos' ||
      venceDesde ||
      venceHasta ||
      montoMin.trim() !== '' ||
      montoMax.trim() !== ''
  );

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterAuditoria('todos');
    setFilterVencimiento('todos');
    setVenceDesde('');
    setVenceHasta('');
    setMontoMin('');
    setMontoMax('');
  };

  const openCreatorWaEditor = () => {
    setWaTemplatesDraft(effectiveTemplates.map((t) => ({ ...t })));
    setEditingWaTemplateId(activeTemplate?.id || effectiveTemplates[0]?.id || 'wa-oficial');
    setWaSaveFeedback(null);
    setShowWaEditor((prev) => !prev);
  };

  const handleSaveCreatorWaTemplates = async () => {
    if (!onSavePlantillasWhatsApp) return;
    const cleaned = waTemplatesDraft
      .map((t) => ({
        ...t,
        nombre: t.nombre.trim() || 'Plantilla WhatsApp',
        mensaje: t.mensaje.trim(),
      }))
      .filter((t) => t.mensaje.length > 0);
    if (cleaned.length === 0) {
      setWaSaveFeedback({
        type: 'error',
        message: 'Escribe al menos una plantilla de mensaje con texto válido.',
      });
      return;
    }
    if (!cleaned.some((t) => t.es_oficial)) {
      cleaned[0] = { ...cleaned[0], es_oficial: true };
    }
    setSavingWaTemplates(true);
    setWaSaveFeedback(null);
    try {
      const res = await onSavePlantillasWhatsApp(cleaned);
      if (!res.ok) {
        setWaSaveFeedback({
          type: 'error',
          message: res.error || 'No se pudieron guardar las plantillas en Supabase.',
        });
        return;
      }
      setWaTemplatesDraft(cleaned);
      setWaSaveFeedback({
        type: 'success',
        message:
          'Plantilla oficial y opciones guardadas en Supabase para todas las sucursales.',
      });
    } finally {
      setSavingWaTemplates(false);
    }
  };

  const handleSaveObservation = async (item: LlamadaSucursal) => {
    const obs =
      draftObs[item.id] !== undefined
        ? draftObs[item.id]
        : item.observaciones_admin;
    await onUpdateLlamada({
      ...item,
      observaciones_admin: obs,
    });
    setSavedToastId(item.id);
    setTimeout(() => setSavedToastId(null), 1600);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.cliente_nombre.trim() || !newForm.telefono.trim()) return;
    const targetSucId =
      userRole === 'cajera' ? selectedSucursalId : newForm.sucursal_id;
    const suc =
      sucursales.find((s) => s.id === targetSucId) || sucursales[0];
    const now = new Date();
    const parsedMonto = parseMoneyInput(newForm.monto_prestamo);
    const nueva: LlamadaSucursal = {
      id: `ll-${Date.now()}`,
      sucursal_id: suc.id,
      sucursal_nombre: suc.nombre,
      sucursal: suc.nombre,
      cliente_nombre: newForm.cliente_nombre.trim(),
      contrato:
        newForm.contrato.trim() ||
        `${suc.codigo.split('-')[0]}-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      telefono: newForm.telefono.replace(/\D/g, ''),
      monto_prestamo: parsedMonto,
      monto: parsedMonto,
      estatus_vencimiento: newForm.estatus_vencimiento,
      fecha_vencimiento: todayStr,
      reporte_cajera: newForm.reporte_cajera,
      respuesta: newForm.reporte_cajera,
      estatus_auditoria: 'Sin auditar',
      observaciones_admin: newForm.observaciones_admin.trim(),
      cajera_nombre: currentUserName || suc.responsable_caja,
      cajera_id: currentUserId || '',
      llamada_registrada: true,
      realizada: true,
      estatus: 'Realizada',
      estado: 'Realizada',
      hora_llamada: getMexicoExactTimeHHMMSS(now),
      fecha_llamada: todayStr,
      fecha_registro: now.toISOString(),
    };

    const res = await onCreateLlamada(nueva);
    if (res && res.ok === false) {
      setRowErrorToast(
        res.error || 'No se pudo registrar la llamada en Supabase.'
      );
      return;
    }
    setRowErrorToast(null);
    setNewForm({
      sucursal_id: defaultSucursal,
      cliente_nombre: '',
      contrato: '',
      telefono: '',
      monto_prestamo: '8500',
      estatus_vencimiento: 'Por vencer',
      reporte_cajera: 'Promesa de pago',
      observaciones_admin: '',
    });
    closeModal();
  };

  const handleDownloadTemplateCSV = () => {
    const sampleBranches = sucursales.filter((s) => s.activa).slice(0, 3);
    const ownName = activeBranchObj?.nombre || 'Sucursal Centro';
    const b1 = isCajera ? ownName : sampleBranches[0]?.nombre || 'Sucursal Centro';
    const b2 = isCajera ? ownName : sampleBranches[1]?.nombre || 'Sucursal Norte';
    const b3 = isCajera ? ownName : sampleBranches[2]?.nombre || 'Sucursal Sur';
    const fmt = (offsetDays: number) => addDaysYYYYMMDD(todayStr, offsetDays);
    const rows = [
      ['sucursal', 'cliente', 'contrato', 'telefono', 'monto_prestamo', 'fecha_vencimiento'],
      [b1, 'María Fernanda López', 'CTR-2026-8801', '5512345678', '12500', fmt(-2)],
      [b2, 'José Luis Hernández', 'NOR-2026-8802', '5587654321', '7400', fmt(1)],
      [b3, 'Ana Karen Ramírez', 'SUR-2026-8803', '5544332211', '18900', fmt(6)],
    ];
    const csvContent =
      '\uFEFF' +
      rows
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_llamadas_controlops.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const matchSucursalByInput = (raw: string): Sucursal | undefined => {
    const clean = normalizeText(raw);
    if (!clean) return undefined;
    const active = sucursales.filter((s) => s.activa);
    return (
      active.find((s) => normalizeText(s.id) === clean) ||
      active.find((s) => normalizeText(s.codigo) === clean) ||
      active.find((s) => normalizeText(s.nombre) === clean) ||
      active.find((s) =>
        normalizeText(s.nombre).replace(/^sucursal\s+/, '') ===
        clean.replace(/^sucursal\s+/, '')
      ) ||
      active.find((s) => normalizeText(s.nombre).includes(clean))
    );
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportFileName(file.name);
    setImportWarnings([]);
    setImportError(null);
    setParsedImportRows([]);

    if (isCajera && dailyBatchSummary.limitReached) {
      setImportError(
        'Has alcanzado el límite diario de 3 bases cargadas hoy (3 de 3). Ya no se permite una cuarta carga hoy.'
      );
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        firstSheet,
        { defval: '' }
      );

      if (rawRows.length === 0) {
        setImportWarnings([
          'El archivo no contiene filas de datos debajo de los encabezados.',
        ]);
        return;
      }

      const warnings: string[] = [];
      const built: LlamadaSucursal[] = [];
      const nowIso = new Date().toISOString();
      const batchStamp = Date.now().toString(36);
      const branchBatchCache = new Map<string, number>();

      rawRows.forEach((raw, idx) => {
        const normalized: Record<string, unknown> = {};
        Object.entries(raw).forEach(([k, v]) => {
          normalized[normalizeText(k).replace(/\s+/g, '_')] = v;
        });

        const sucursalText = String(
          normalized.sucursal ??
            normalized.sucursal_nombre ??
            normalized.sucursal_id ??
            normalized.tienda ??
            ''
        ).trim();
        const cliente = String(
          normalized.cliente ??
            normalized.cliente_nombre ??
            normalized.nombre ??
            ''
        ).trim();
        const contrato = String(normalized.contrato ?? '').trim();
        const telefonoRaw = String(
          normalized.telefono ?? normalized.celular ?? normalized.tel ?? ''
        ).replace(/\D/g, '');
        const rawMontoVal =
          normalized.monto_prestamo ??
          normalized.monto ??
          normalized.prestamo ??
          normalized.importe ??
          normalized.saldo ??
          normalized.monto_del_prestamo ??
          normalized.cantidad ??
          0;
        const parsedMonto = parseMoneyInput(rawMontoVal);
        const fechaVenc = parseExcelOrStringDate(
          normalized.fecha_vencimiento ?? normalized.vencimiento ?? ''
        );
        const estatusRaw = normalizeText(
          String(normalized.estatus_vencimiento ?? '')
        );

        if (!cliente || !telefonoRaw) {
          warnings.push(
            `Fila ${idx + 2}: omitida porque falta "cliente" o "telefono".`
          );
          return;
        }

        let matchedSuc: Sucursal | undefined;
        if (isCajera) {
          const ownSuc = activeBranchObj;
          if (sucursalText) {
            const explicitSuc = matchSucursalByInput(sucursalText);
            if (explicitSuc && ownSuc && explicitSuc.id !== ownSuc.id) {
              warnings.push(
                `Fila ${idx + 2} (${cliente}): omitida porque pertenece a "${explicitSuc.nombre}" y tu perfil solo carga en "${ownSuc.nombre}".`
              );
              return;
            }
          }
          matchedSuc = ownSuc;
        } else {
          matchedSuc =
            matchSucursalByInput(sucursalText) ||
            (selectedSucursalId !== 'todas'
              ? sucursales.find((s) => s.id === selectedSucursalId)
              : undefined);
        }

        if (!matchedSuc) {
          warnings.push(
            `Fila ${idx + 2} (${cliente}): no se encontró la sucursal "${sucursalText || 'vacía'}".`
          );
          return;
        }

        let loteNum = branchBatchCache.get(matchedSuc.id);
        if (!loteNum) {
          const branchBatches = getDailyBatchSummaryForBranch(
            llamadas,
            matchedSuc.id,
            todayStr
          );
          loteNum = branchBatches.count + 1;
          branchBatchCache.set(matchedSuc.id, loteNum);
        }

        const estatusVenc: EstatusVencimiento =
          estatusRaw === 'vencido'
            ? 'Vencido'
            : estatusRaw === 'por vencer'
              ? 'Por vencer'
              : estatusRaw === 'al corriente'
                ? 'Al corriente'
                : computeVencimientoFromDate(fechaVenc);

        built.push({
          id: `ll-lote-${loteNum}__${todayStr}__${matchedSuc.id}__${batchStamp}-${idx}`,
          sucursal_id: matchedSuc.id,
          sucursal_nombre: matchedSuc.nombre,
          sucursal: matchedSuc.nombre,
          cliente_nombre: cliente,
          contrato:
            contrato ||
            `${matchedSuc.codigo.split('-')[0]}-2026-${Math.floor(1000 + Math.random() * 9000)}`,
          telefono: telefonoRaw,
          monto_prestamo: parsedMonto,
          monto: parsedMonto,
          estatus_vencimiento: estatusVenc,
          fecha_vencimiento: fechaVenc,
          reporte_cajera: 'Sin reporte',
          estatus_auditoria: 'Sin auditar',
          observaciones_admin: '',
          cajera_nombre: isCajera
            ? currentUserName || matchedSuc.responsable_caja
            : matchedSuc.responsable_caja,
          cajera_id: isCajera ? currentUserId || '' : '',
          llamada_registrada: false,
          estatus: 'Pendiente',
          estado: 'Pendiente',
          fecha_registro: nowIso,
        });
      });

      setParsedImportRows(built);
      setImportWarnings(warnings);
    } catch (err) {
      setImportWarnings([
        err instanceof Error
          ? `No se pudo leer el archivo: ${err.message}`
          : 'Formato de archivo inválido. Usa .csv o .xlsx.',
      ]);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedImportRows.length === 0) return;
    if (isCajera && dailyBatchSummary.limitReached) {
      setImportError(
        'Has alcanzado el límite diario de 3 bases cargadas hoy (3 de 3).'
      );
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const res = await onImportLlamadas(parsedImportRows);
      if (res && res.ok === false) {
        setImportError(
          res.error || 'No se pudo guardar la base en Supabase. Intenta de nuevo.'
        );
        return;
      }
      const loteLabel = isCajera
        ? ` (Base ${dailyBatchSummary.nextLoteNum} de 3 del día)`
        : '';
      const countSaved = res?.insertedCount ?? parsedImportRows.length;
      const warnSuffix = res?.warning ? ` · Aviso: ${res.warning}` : '';
      setImportToast(
        `${countSaved} registro(s) sumados y guardados en llamadas_sucursal${loteLabel}.${warnSuffix}`
      );
      setShowImportModal(false);
      setParsedImportRows([]);
      setImportWarnings([]);
      setImportFileName('');
      setTimeout(() => setImportToast(null), 6000);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Daily Goal Progress & Action Header */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between gap-2 max-w-2xl">
              <h2 className="font-display text-base font-bold text-[#1F172B]">
                {isCajera
                  ? 'Avance de tus bases de hoy'
                  : 'Avance diario de marcación'}
              </h2>
              {isCajera ? (
                <span className="font-mono-num text-sm font-bold text-[#5B21B6]">
                  {metrics.registradas} de {metrics.totalBaseHoy} llamadas de tu
                  base de hoy ({metrics.pctBaseHoy.toFixed(1)}%)
                </span>
              ) : (
                <span className="font-mono-num text-sm font-bold text-[#5B21B6]">
                  {metrics.registradas} / {metrics.metaDiaria} llamadas (
                  {metrics.pct.toFixed(0)}%)
                </span>
              )}
            </div>
            <div className="h-3 w-full max-w-2xl rounded-full bg-[#F3ECFC] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] transition-all duration-300"
                style={{
                  width: `${
                    isCajera
                      ? metrics.registradas > 0
                        ? Math.max(2, metrics.pctBaseHoy)
                        : 0
                      : Math.max(2, metrics.pct)
                  }%`,
                }}
              />
            </div>
            {isCajera ? (
              <p className="text-xs text-[#7A6B93] pt-0.5">
                Hoy ({todayStr}):{' '}
                <span className="font-mono-num font-semibold text-[#15803D]">
                  {metrics.registradas} realizada(s)
                </span>{' '}
                ·{' '}
                <span className="font-mono-num font-semibold text-[#B45309]">
                  {metrics.pendientes} pendiente(s)
                </span>{' '}
                de {metrics.totalBaseHoy} registro(s) en tus bases subidas ·
                Acumulado del mes:{' '}
                <span className="font-mono-num font-semibold text-[#5B21B6]">
                  {metrics.registradasMes} llamadas
                </span>
              </p>
            ) : (
              <p className="text-xs text-[#7A6B93] pt-0.5">
                Meta diaria ({todayStr}): {metrics.metaDiaria} llamadas · Faltan{' '}
                <span className="font-mono-num font-semibold text-[#1F172B]">
                  {Math.max(0, metrics.metaDiaria - metrics.registradas)}
                </span>{' '}
                hoy · Acumulado del mes:{' '}
                <span className="font-mono-num font-semibold text-[#5B21B6]">
                  {metrics.registradasMes} llamadas
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canImport && (
              <button
                type="button"
                disabled={isCajera && dailyBatchSummary.limitReached}
                onClick={() => {
                  setParsedImportRows([]);
                  setImportWarnings([]);
                  setImportError(null);
                  setImportFileName('');
                  setShowImportModal(true);
                }}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                  isCajera && dailyBatchSummary.limitReached
                    ? 'bg-[#F5F0FC] text-[#9D8FB5] border-[#E6DDF5] cursor-not-allowed'
                    : 'bg-[#FAF7FE] hover:bg-[#F3ECFC] text-[#5B21B6] border-[#C4B5FD]'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4 text-[#DB2777]" />
                {isCajera
                  ? dailyBatchSummary.limitReached
                    ? 'Límite diario alcanzado (3 de 3)'
                    : `Subir base de llamadas (${dailyBatchSummary.nextLoteNum} de 3)`
                  : 'Importar cartera (.csv / .xlsx)'}
              </button>
            )}

            {isCajera ? (
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Registrar llamada
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#FAF7FE] text-[#6D28D9] border border-[#EAE3F5]">
                {isCreador ? 'Modo Control y Auditoría' : 'Modo Supervisión Operativa'}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Cumulative Daily Batch Counter Banner (Cajera) */}
      {isCajera && (
        <section className="bg-white rounded-2xl border border-[#EAE3F5] p-4 md:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold text-[#1F172B]">
                Bases cargadas hoy: {dailyBatchSummary.count} de {dailyBatchSummary.maxBases}
              </h3>
              <p className="text-xs text-[#7A6B93]">
                Cada carga del día se suma automáticamente en Supabase sin borrar ni sobrescribir las bases anteriores ni tu avance.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FAF7FE] border border-[#EAE3F5] text-xs font-semibold text-[#5B21B6] shrink-0">
              <span>Total acumulado hoy:</span>
              <span className="font-mono-num font-bold text-[#1F172B]">
                {dailyBatchSummary.totalHoyClientes} cliente(s) · {dailyBatchSummary.totalHoyRegistradas} marcadas
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {dailyBatchSummary.slots.map((slot) => (
              <div
                key={slot.slot}
                className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-2 ${
                  slot.loaded
                    ? 'bg-[#FAF5FF] border-[#DDD6FE]'
                    : 'bg-[#FCFAFE] border-[#EFE9F8]'
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-[#1F172B]">
                    Base {slot.slot} de 3
                  </p>
                  <p className="text-[11px] text-[#7A6B93]">
                    {slot.loaded
                      ? `${slot.totalRegistros} clientes · ${slot.llamadasRealizadas} llamadas`
                      : 'Disponible para subir hoy'}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                    slot.loaded
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-[#F3ECFC] text-[#8B7CA5]'
                  }`}
                >
                  {slot.loaded ? 'Cargada' : 'Libre'}
                </span>
              </div>
            ))}
          </div>

          {dailyBatchSummary.limitReached && (
            <div
              role="status"
              className="rounded-xl px-4 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] text-xs font-semibold text-[#92400E] flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-[#D97706]" />
              <span>
                Límite diario alcanzado: ya cargaste 3 de 3 bases permitidas para hoy ({todayStr}). No se puede subir una cuarta base hoy; las cargas anteriores siguen acumuladas y listas para marcar.
              </span>
            </div>
          )}
        </section>
      )}

      {importToast && (
        <div className="rounded-xl px-4 py-3 bg-[#F0FDF4] border border-[#BBF7D0] text-xs font-semibold text-[#15803D] flex items-center justify-between">
          <span>{importToast}</span>
          <button
            type="button"
            onClick={() => setImportToast(null)}
            className="underline ml-3"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* 4 Metric Cards (Audit cards hidden from Cajeras and Supervisors) */}
      {canAuditCalls ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
            <p className="text-xs text-[#7A6B93]">Llamadas registradas</p>
            <p className="font-display text-2xl font-bold text-[#1F172B] mt-1 tabular-nums">
              {metrics.registradas}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
            <p className="text-xs text-[#15803D] font-medium">Verificadas</p>
            <p className="font-display text-2xl font-bold text-[#15803D] mt-1 tabular-nums">
              {metrics.verificadas}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
            <p className="text-xs text-[#BE123C] font-medium">Falsas</p>
            <p className="font-display text-2xl font-bold text-[#BE123C] mt-1 tabular-nums">
              {metrics.falsas}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
            <p className="text-xs text-[#B45309] font-medium">Sin auditar</p>
            <p className="font-display text-2xl font-bold text-[#B45309] mt-1 tabular-nums">
              {metrics.sinAuditar}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
            <p className="text-xs text-[#7A6B93]">
              {isCajera ? 'Bases cargadas hoy' : 'Clientes cargados hoy'}
            </p>
            <p className="font-display text-2xl font-bold text-[#5B21B6] mt-1 tabular-nums">
              {isCajera
                ? `${dailyBatchSummary.count} / ${dailyBatchSummary.maxBases}`
                : todayAllBranchesStats.totalHoyClientes}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
            <p className="text-xs text-[#7A6B93]">Acumulado de hoy</p>
            <p className="font-display text-2xl font-bold text-[#1F172B] mt-1 tabular-nums">
              {isCajera
                ? dailyBatchSummary.totalHoyClientes
                : todayAllBranchesStats.totalHoyRegistradas}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
            <p className="text-xs text-[#15803D] font-medium">Llamadas realizadas</p>
            <p className="font-display text-2xl font-bold text-[#15803D] mt-1 tabular-nums">
              {metrics.registradas}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
            <p className="text-xs text-[#B45309] font-medium">Pendientes por marcar</p>
            <p className="font-display text-2xl font-bold text-[#B45309] mt-1 tabular-nums">
              {metrics.pendientes}
            </p>
          </div>
        </div>
      )}

      {/* Search & Multi-Filters (Advanced Expiration & Loan Amount Filters) */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-4 md:p-5 space-y-3.5">
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${
            canFilterBranch && onSelectSucursal
              ? 'xl:grid-cols-6'
              : isCajera
                ? 'xl:grid-cols-4'
                : 'xl:grid-cols-5'
          }`}
        >
          <div className="xl:col-span-2 relative">
            <Search className="h-4 w-4 text-[#8B7CA5] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, contrato o teléfono..."
              className="w-full pl-10 pr-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-sm text-[#1F172B] placeholder:text-[#9D8FB5] focus:outline-none focus:border-[#8B5CF6] focus:bg-white"
            />
          </div>

          {canFilterBranch && onSelectSucursal && (
            <select
              aria-label="Filtrar llamadas por sucursal"
              value={selectedSucursalId}
              onChange={(e) => onSelectSucursal(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#5B21B6] focus:outline-none focus:border-[#8B5CF6]"
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
          )}

          {canAuditCalls ? (
            <select
              aria-label="Filtrar por estatus de llamada"
              value={filterAuditoria}
              onChange={(e) => setFilterAuditoria(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="todos">Estatus: Todos</option>
              <option value="Verificada">Verificada</option>
              <option value="Falsa">Falsa</option>
              <option value="Sin auditar">Sin auditar</option>
              <option value="pendiente_marcar">Pendiente de marcar</option>
            </select>
          ) : !isCajera ? (
            <select
              aria-label="Filtrar por estado de marcación"
              value={filterAuditoria}
              onChange={(e) => setFilterAuditoria(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="todos">Marcación: Todas</option>
              <option value="marcadas">Marcadas / Realizadas</option>
              <option value="pendiente_marcar">Pendientes por marcar</option>
            </select>
          ) : null}

          <select
            aria-label="Filtrar por fecha"
            value={filterFecha}
            onChange={(e) => setFilterFecha(e.target.value as 'hoy' | 'todos')}
            className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#5B21B6] focus:outline-none focus:border-[#8B5CF6]"
          >
            <option value="hoy">Fecha: Solo hoy ({todayStr})</option>
            <option value="todos">Fecha: Todo el historial</option>
          </select>

          <select
            aria-label="Ordenar lista"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#8B5CF6]"
          >
            <option value="recientes">Orden: Recientes</option>
            <option value="mayor_monto">Mayor monto</option>
            <option value="menor_monto">Menor monto</option>
            <option value="vencimiento">Próximo vencimiento</option>
          </select>
        </div>

        {/* Advanced Expiration Date Range & Custom Loan Amount Range */}
        <div className="pt-3 border-t border-[#F1ECF9] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#6E5F87] mr-1">
              Vencimiento:
            </span>
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'Vencido', label: 'Vencidos' },
                { id: 'vencen_hoy', label: 'Vencen hoy' },
                { id: 'Por vencer', label: 'Próximos a vencer' },
                { id: 'Al corriente', label: 'Al corriente' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterVencimiento(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  filterVencimiento === opt.id
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-[#FAF8FC] text-[#55476E] border border-[#E6DDF5] hover:bg-[#F3ECFC]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#6E5F87]">
              <span>Vence desde</span>
              <input
                type="date"
                aria-label="Vence desde"
                value={venceDesde}
                onChange={(e) => setVenceDesde(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#6E5F87]">
              <span>Vence hasta</span>
              <input
                type="date"
                aria-label="Vence hasta"
                value={venceHasta}
                onChange={(e) => setVenceHasta(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#6E5F87]">
              <span>Monto mín. ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label="Monto mínimo"
                placeholder="Ej. 1000"
                value={montoMin}
                onChange={(e) => setMontoMin(e.target.value)}
                className="w-24 px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#6E5F87]">
              <span>Monto máx. ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label="Monto máximo"
                placeholder="Ej. 5000"
                value={montoMax}
                onChange={(e) => setMontoMax(e.target.value)}
                className="w-24 px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
              />
            </label>
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#FBCFE8] bg-[#FDF2F8] hover:bg-[#FCE7F3] text-[11px] font-semibold text-[#BE185D] disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Limpiar filtros
            </button>
          </div>
        </div>
      </section>

      {/* Dynamic WhatsApp Message Template Bar & Creator Editor */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-4 md:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-[#FDF2F8] text-[#DB2777] flex items-center justify-center shrink-0">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-[#1F172B]">
                  Plantilla de WhatsApp activa:
                </span>
                <select
                  aria-label="Seleccionar plantilla de WhatsApp"
                  value={activeTemplate?.id || ''}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#5B21B6] focus:outline-none focus:border-[#7C3AED]"
                >
                  {effectiveTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.nombre}
                      {tpl.es_oficial ? ' (Oficial)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-[#7A6B93] truncate max-w-2xl mt-0.5">
                {activeTemplate?.mensaje}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isCreador ? (
              <button
                type="button"
                onClick={openCreatorWaEditor}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#FAF7FE] hover:bg-[#F3ECFC] text-[#5B21B6] border border-[#DDD6FE] transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-[#DB2777]" />
                {showWaEditor
                  ? 'Ocultar editor oficial'
                  : 'Configurar plantilla oficial (WhatsApp)'}
              </button>
            ) : (
              <span className="text-[11px] text-[#7A6B93]">
                Puedes personalizar el mensaje directo en cada cliente antes de enviar.
              </span>
            )}
          </div>
        </div>

        {isCreador && showWaEditor && (
          <div className="pt-3 border-t border-[#F1ECF9] space-y-4">
            {waSaveFeedback && (
              <div
                role="status"
                className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold border ${
                  waSaveFeedback.type === 'success'
                    ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                    : 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
                }`}
              >
                {waSaveFeedback.message}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {waTemplatesDraft.map((tpl) => {
                  const isEditing = tpl.id === editingWaTemplateId;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setEditingWaTemplateId(tpl.id)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        isEditing
                          ? 'bg-[#7C3AED] text-white'
                          : 'bg-[#FAF8FC] text-[#55476E] border border-[#E6DDF5] hover:bg-[#F3ECFC]'
                      }`}
                    >
                      {tpl.es_oficial && (
                        <Star className="h-3 w-3 fill-current" />
                      )}
                      {tpl.nombre}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    const newId = `wa-${Date.now()}`;
                    const nextTpl: PlantillaWhatsApp = {
                      id: newId,
                      nombre: `Opción ${waTemplatesDraft.length + 1}`,
                      mensaje:
                        'Hola {cliente}, te recordamos tu contrato {contrato} por ${monto} con fecha de vencimiento {fecha_vencimiento}.',
                      es_oficial: false,
                    };
                    setWaTemplatesDraft((prev) => [...prev, nextTpl]);
                    setEditingWaTemplateId(newId);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#FDF2F8] text-[#BE185D] border border-[#FBCFE8] hover:bg-[#FCE7F3]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nueva opción
                </button>
              </div>

              <button
                type="button"
                disabled={savingWaTemplates}
                onClick={handleSaveCreatorWaTemplates}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {savingWaTemplates
                  ? 'Guardando...'
                  : 'Guardar plantillas en Supabase'}
              </button>
            </div>

            {(() => {
              const currentDraft =
                waTemplatesDraft.find((t) => t.id === editingWaTemplateId) ||
                waTemplatesDraft[0];
              if (!currentDraft) return null;
              const sampleClient = filteredLlamadas[0] ||
                scopedLlamadas[0] || {
                  cliente_nombre: 'Laura Patricia Mendoza',
                  contrato: 'CTR-2026-5010',
                  monto_prestamo: 8500,
                  fecha_vencimiento: todayStr,
                  sucursal_nombre: activeBranchObj?.nombre || 'Sucursal Centro',
                  sucursal: activeBranchObj?.nombre || 'Sucursal Centro',
                  telefono: '5512345678',
                };
              const updateCurrentDraft = (patch: Partial<PlantillaWhatsApp>) => {
                setWaTemplatesDraft((prev) =>
                  prev.map((t) =>
                    t.id === currentDraft.id ? { ...t, ...patch } : t
                  )
                );
              };

              return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-[#FAF8FC] border border-[#EAE3F5] rounded-xl p-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={currentDraft.nombre}
                        onChange={(e) =>
                          updateCurrentDraft({ nombre: e.target.value })
                        }
                        placeholder="Nombre de la plantilla"
                        className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-[#E6DDF5] bg-white text-xs font-semibold text-[#1F172B]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setWaTemplatesDraft((prev) =>
                            prev.map((t) => ({
                              ...t,
                              es_oficial: t.id === currentDraft.id,
                            }))
                          )
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${
                          currentDraft.es_oficial
                            ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]'
                            : 'bg-white border-[#E6DDF5] text-[#6E5F87] hover:bg-[#F3ECFC]'
                        }`}
                      >
                        <Star className="h-3 w-3" />
                        {currentDraft.es_oficial
                          ? 'Plantilla oficial'
                          : 'Marcar oficial'}
                      </button>
                      {waTemplatesDraft.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const remaining = waTemplatesDraft.filter(
                              (t) => t.id !== currentDraft.id
                            );
                            if (
                              currentDraft.es_oficial &&
                              remaining.length > 0
                            ) {
                              remaining[0] = {
                                ...remaining[0],
                                es_oficial: true,
                              };
                            }
                            setWaTemplatesDraft(remaining);
                            if (remaining[0]) {
                              setEditingWaTemplateId(remaining[0].id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                          title="Eliminar esta opción"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[#6E5F87]">
                        Variables:
                      </span>
                      {[
                        '{cliente}',
                        '{contrato}',
                        '{monto}',
                        '{fecha_vencimiento}',
                        '{sucursal}',
                      ].map((variable) => (
                        <button
                          key={variable}
                          type="button"
                          onClick={() =>
                            updateCurrentDraft({
                              mensaje: `${currentDraft.mensaje}${currentDraft.mensaje.endsWith(' ') || currentDraft.mensaje === '' ? '' : ' '}${variable}`,
                            })
                          }
                          className="px-2 py-0.5 rounded-md bg-white border border-[#DDD6FE] text-[11px] font-mono-num font-semibold text-[#5B21B6] hover:bg-[#F3ECFC]"
                        >
                          + {variable}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={3}
                      value={currentDraft.mensaje}
                      onChange={(e) =>
                        updateCurrentDraft({ mensaje: e.target.value })
                      }
                      placeholder="Redacta el mensaje oficial usando {cliente}, {contrato}, {monto}, {fecha_vencimiento}..."
                      className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
                    />
                  </div>

                  <div className="rounded-xl bg-white border border-[#EAE3F5] p-3.5 space-y-2">
                    <div className="text-[11px] font-bold text-[#5B21B6] uppercase tracking-wider">
                      Vista previa en vivo ({sampleClient.cliente_nombre})
                    </div>
                    <p className="text-xs text-[#1F172B] whitespace-pre-wrap leading-relaxed bg-[#F8F6FB] rounded-lg p-3 border border-[#F1ECF9]">
                      {renderWhatsAppTemplate(currentDraft.mensaje, sampleClient)}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* Client Calls Table / Cards */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F1ECF9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {isCajera ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCajeraTab('pendientes')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  cajeraTab === 'pendientes'
                    ? 'bg-[#7C3AED] text-white shadow-xs'
                    : 'bg-[#FAF8FC] text-[#55476E] border border-[#E6DDF5] hover:bg-[#F3ECFC]'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Llamadas pendientes
                <span
                  className={`px-2 py-0.5 rounded-md font-mono-num text-[11px] ${
                    cajeraTab === 'pendientes'
                      ? 'bg-white/20 text-white'
                      : 'bg-[#FEF3C7] text-[#B45309]'
                  }`}
                >
                  {cajeraPendientes.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCajeraTab('realizadas')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  cajeraTab === 'realizadas'
                    ? 'bg-[#15803D] text-white shadow-xs'
                    : 'bg-[#FAF8FC] text-[#55476E] border border-[#E6DDF5] hover:bg-[#ECFDF5]'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Llamadas realizadas
                <span
                  className={`px-2 py-0.5 rounded-md font-mono-num text-[11px] ${
                    cajeraTab === 'realizadas'
                      ? 'bg-white/20 text-white'
                      : 'bg-[#DCFCE7] text-[#15803D]'
                  }`}
                >
                  {cajeraRealizadas.length}
                </span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-semibold text-[#55476E]">
              Mostrando {displayedLlamadas.length} cliente(s)
            </span>
          )}

          <div className="flex items-center gap-3">
            {isCajera && (
              <span className="text-xs font-semibold text-[#55476E]">
                Mostrando {displayedLlamadas.length} cliente(s)
              </span>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs font-medium text-[#DB2777] hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {rowErrorToast && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-xl px-4 py-2.5 bg-[#FFF1F2] border border-[#FECDD3] text-xs font-semibold text-[#BE123C] flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{rowErrorToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setRowErrorToast(null)}
              className="underline shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {callActionToast && (
          <div
            role="status"
            className="mx-5 mt-3 rounded-xl px-4 py-2.5 bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-semibold text-[#065F46] flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
              <span>{callActionToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setCallActionToast(null)}
              className="underline shrink-0"
            >
              Ocultar
            </button>
          </div>
        )}

        {displayedLlamadas.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-[#1F172B]">
              {isCajera
                ? cajeraTab === 'pendientes'
                  ? 'No tienes llamadas pendientes en esta vista'
                  : 'Aún no hay llamadas realizadas registradas en esta vista'
                : 'No hay clientes que coincidan con tu búsqueda'}
            </p>
            <p className="text-xs text-[#7A6B93]">
              {isCajera
                ? cajeraTab === 'pendientes'
                  ? 'Revisa la pestaña "Llamadas realizadas" o sube una nueva base de llamadas.'
                  : 'Selecciona una respuesta en "Llamadas pendientes" y presiona "Registrar llamada".'
                : 'Ajusta los filtros de monto, vencimiento o registra una nueva llamada.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F1ECF9]">
            {displayedLlamadas.map((item) => {
              const currentObs =
                draftObs[item.id] !== undefined
                  ? draftObs[item.id]
                  : item.observaciones_admin;
              const obsModified =
                draftObs[item.id] !== undefined &&
                draftObs[item.id] !== item.observaciones_admin;
              const batchInfo = extractLlamadaBatchInfo(item);
              const loanAmount = getItemLoanAmount(item);
              const selectedResponse =
                rowRespuestaDrafts[item.id] ??
                (item.reporte_cajera && item.reporte_cajera !== 'Sin reporte'
                  ? item.reporte_cajera
                  : quickResponseOptions[0] || 'Promesa de pago');
              const freeNoteValue =
                rowNotaDrafts[item.id] !== undefined
                  ? rowNotaDrafts[item.id]
                  : item.observaciones_admin || '';
              const callTimeDisplay = getDisplayCallTime(item);

              return (
                <div
                  key={item.id}
                  className="p-4 md:p-5 hover:bg-[#FCFAFE] transition-colors grid grid-cols-1 xl:grid-cols-12 gap-4 items-start"
                >
                  {/* Client Info */}
                  <div
                    className={`${
                      canAuditCalls ? 'xl:col-span-3' : 'xl:col-span-3'
                    } space-y-1`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-[#1F172B]">
                        {item.cliente_nombre}
                      </span>
                      {batchInfo?.loteNum && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#F3ECFC] text-[#5B21B6]">
                          Base {batchInfo.loteNum}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#6E5F87] font-mono-num">
                      {item.contrato} · {item.telefono}
                    </div>
                    <div className="text-xs text-[#8B7CA5]">
                      {item.sucursal_nombre} · Cajera: {item.cajera_nombre}
                    </div>
                  </div>

                  {/* Loan & Expiration */}
                  <div className="xl:col-span-2 space-y-1">
                    <div className="font-mono-num text-sm font-bold text-[#1F172B]">
                      {formatCurrencyClean(loanAmount)}
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        item.estatus_vencimiento === 'Vencido'
                          ? 'text-[#BE123C]'
                          : item.estatus_vencimiento === 'Por vencer'
                            ? 'text-[#B45309]'
                            : 'text-[#15803D]'
                      }`}
                    >
                      {item.estatus_vencimiento}
                      <span className="font-normal text-[#8B7CA5] ml-1.5 font-mono-num">
                        {item.fecha_vencimiento}
                      </span>
                    </div>
                  </div>

                  {/* Quick Call & WhatsApp Actions (Cajera) or Contact Info (Audit/Supervision) */}
                  <div
                    className={`${
                      canAuditCalls ? 'xl:col-span-2' : 'xl:col-span-3'
                    } space-y-2`}
                  >
                    {isCajera ? (
                      <>
                        {(() => {
                          const defaultRendered = renderWhatsAppTemplate(
                            activeTemplate?.mensaje || '',
                            { ...item, monto_prestamo: loanAmount }
                          );
                          const effectiveWaMsg =
                            rowWaDrafts[item.id] !== undefined
                              ? rowWaDrafts[item.id]
                              : defaultRendered;
                          const waHref = buildWhatsAppUrl(
                            item.telefono,
                            effectiveWaMsg
                          );
                          const isEditingRowWa = openRowWaId === item.id;

                          return (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <a
                                  href={`tel:${item.telefono}`}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#F3ECFC] hover:bg-[#E7DAFA] text-[#5B21B6] transition-colors whitespace-nowrap"
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                  Llamar
                                </a>
                                <a
                                  href={waHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#FDF2F8] hover:bg-[#FCE7F3] text-[#BE185D] border border-[#FBCFE8] transition-colors whitespace-nowrap"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  WhatsApp
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditingRowWa) {
                                      setOpenRowWaId(null);
                                    } else {
                                      if (rowWaDrafts[item.id] === undefined) {
                                        setRowWaDrafts((prev) => ({
                                          ...prev,
                                          [item.id]: defaultRendered,
                                        }));
                                      }
                                      setOpenRowWaId(item.id);
                                    }
                                  }}
                                  title="Editar mensaje de WhatsApp antes de enviar"
                                  className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                                    isEditingRowWa
                                      ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                                      : 'bg-white text-[#5B21B6] border-[#E6DDF5] hover:bg-[#FAF7FE]'
                                  }`}
                                >
                                  <Pencil className="h-3 w-3" />
                                  Editar mensaje
                                </button>
                              </div>

                              {isEditingRowWa && (
                                <div className="rounded-xl border border-[#DDD6FE] bg-[#FAF7FE] p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-[#5B21B6]">
                                      Personalizar WhatsApp para{' '}
                                      {item.cliente_nombre}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRowWaDrafts((prev) => ({
                                          ...prev,
                                          [item.id]: defaultRendered,
                                        }))
                                      }
                                      className="text-[11px] font-semibold text-[#6E5F87] hover:underline"
                                    >
                                      Restablecer plantilla
                                    </button>
                                  </div>
                                  <textarea
                                    rows={3}
                                    value={effectiveWaMsg}
                                    onChange={(e) =>
                                      setRowWaDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full px-2.5 py-2 rounded-lg border border-[#E6DDF5] bg-white text-xs text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setOpenRowWaId(null)}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#6E5F87] hover:bg-white"
                                    >
                                      Cerrar
                                    </button>
                                    <a
                                      href={waHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#DB2777] hover:bg-[#BE185D] text-white"
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" />
                                      Enviar WhatsApp
                                    </a>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      <div className="text-xs text-[#6E5F87] space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5 font-medium text-[#1F172B]">
                          <span>
                            {isLlamadaRealizadaRecord(item)
                              ? 'Realizada'
                              : 'Pendiente'}
                          </span>
                          {isLlamadaRealizadaRecord(item) && callTimeDisplay && (
                            <span className="font-mono-num text-[11px] text-[#5B21B6] bg-[#F3ECFC] px-1.5 py-0.5 rounded">
                              {callTimeDisplay}
                            </span>
                          )}
                        </div>
                        <div className="font-mono-num text-[11px]">
                          Tel. {item.telefono}
                        </div>
                        <a
                          href={buildWhatsAppUrl(
                            item.telefono,
                            renderWhatsAppTemplate(
                              activeTemplate?.mensaje || '',
                              { ...item, monto_prestamo: loanAmount }
                            )
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#FDF2F8] hover:bg-[#FCE7F3] text-[#BE185D] border border-[#FBCFE8] transition-colors"
                        >
                          <MessageCircle className="h-3 w-3" />
                          WhatsApp
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Cashier Response Capture & Register Call (Cajera) or Read-only Response (Admin/Supervisor) */}
                  <div
                    className={
                      canAuditCalls ? 'xl:col-span-2 space-y-1.5' : 'xl:col-span-4 space-y-2'
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-[11px] font-medium text-[#7A6B93]">
                        Respuesta obtenida
                      </label>
                      {!canAuditCalls && (
                        <div className="flex items-center gap-1.5">
                          {isLlamadaRealizadaRecord(item) && callTimeDisplay && (
                            <span className="font-mono-num text-[11px] font-semibold text-[#5B21B6]">
                              {callTimeDisplay}
                            </span>
                          )}
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                              isLlamadaRealizadaRecord(item)
                                ? 'bg-[#ECFDF5] text-[#15803D]'
                                : 'bg-[#FEF9C3] text-[#A16207]'
                            }`}
                          >
                            {isLlamadaRealizadaRecord(item)
                              ? 'Realizada'
                              : 'Pendiente'}
                          </span>
                        </div>
                      )}
                    </div>

                    {isCajera ? (
                      !isLlamadaRealizadaRecord(item) ? (
                        <div className="space-y-2">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <select
                              aria-label={`Respuesta para ${item.cliente_nombre}`}
                              value={selectedResponse}
                              onChange={(e) =>
                                setRowRespuestaDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className="flex-1 px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
                            >
                              {quickResponseOptions.map((op) => (
                                <option key={op} value={op}>
                                  {op}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              disabled={registeringRowId === item.id}
                              onClick={async () => {
                                setRegisteringRowId(item.id);
                                setRowErrorToast(null);
                                try {
                                  const now = new Date();
                                  const exactTime =
                                    getMexicoExactTimeHHMMSS(now);
                                  const res = await onUpdateLlamada({
                                    ...item,
                                    monto_prestamo: loanAmount,
                                    monto: loanAmount,
                                    sucursal_id:
                                      item.sucursal_id ||
                                      activeBranchObj?.id ||
                                      selectedSucursalId,
                                    sucursal_nombre:
                                      item.sucursal_nombre ||
                                      item.sucursal ||
                                      activeBranchObj?.nombre ||
                                      '',
                                    sucursal:
                                      item.sucursal ||
                                      item.sucursal_nombre ||
                                      activeBranchObj?.nombre ||
                                      '',
                                    cajera_nombre:
                                      currentUserName || item.cajera_nombre,
                                    cajera_id:
                                      currentUserId || item.cajera_id,
                                    reporte_cajera: selectedResponse,
                                    respuesta: selectedResponse,
                                    observaciones_admin: freeNoteValue.trim(),
                                    llamada_registrada: true,
                                    realizada: true,
                                    estatus: 'Realizada',
                                    estado: 'Realizada',
                                    hora_llamada: exactTime,
                                    fecha_llamada: todayStr,
                                    fecha_registro: now.toISOString(),
                                  });

                                  if (res && res.ok === false) {
                                    setRowErrorToast(
                                      res.error ||
                                        'Error al guardar la llamada en Supabase.'
                                    );
                                    return;
                                  }

                                  setRowRespuestaDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[item.id];
                                    return next;
                                  });
                                  setRowNotaDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[item.id];
                                    return next;
                                  });
                                  setCallActionToast(
                                    `Llamada de ${item.cliente_nombre} guardada (${selectedResponse} · ${exactTime}) y movida a Llamadas realizadas.`
                                  );
                                  window.setTimeout(() => {
                                    setCallActionToast((prev) =>
                                      prev &&
                                      prev.includes(item.cliente_nombre)
                                        ? null
                                        : prev
                                    );
                                  }, 4000);
                                } finally {
                                  setRegisteringRowId(null);
                                }
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-xs disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {registeringRowId === item.id
                                ? 'Guardando...'
                                : 'Registrar llamada'}
                            </button>
                          </div>

                          <input
                            type="text"
                            aria-label={`Observación libre para ${item.cliente_nombre}`}
                            value={freeNoteValue}
                            onChange={(e) =>
                              setRowNotaDrafts((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            placeholder="Observación libre (opcional)..."
                            className="w-full px-3 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs text-[#1F172B] placeholder:text-[#9D8FB5] focus:outline-none focus:border-[#7C3AED] focus:bg-white"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-3 py-1.5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] text-xs font-semibold text-[#15803D]">
                              {item.reporte_cajera}
                            </span>
                            {item.observaciones_admin && (
                              <span className="text-xs text-[#55476E] bg-[#FAF8FC] border border-[#E6DDF5] px-2.5 py-1 rounded-xl">
                                {item.observaciones_admin}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="space-y-1">
                        <div className="px-3 py-2 rounded-xl border border-[#F1ECF9] bg-[#FAF8FC] text-xs font-semibold text-[#1F172B]">
                          {item.reporte_cajera}
                        </div>
                        {!canAuditCalls && item.observaciones_admin && (
                          <p className="text-[11px] text-[#6E5F87]">
                            Nota: {item.observaciones_admin}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Admin Audit & Observations (Strictly Creador / Administrador only) */}
                  {canAuditCalls && (
                    <div className="xl:col-span-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[#7A6B93]">
                          Auditoría administración
                        </span>
                        <div className="flex items-center gap-1 bg-[#F5F0FC] p-0.5 rounded-lg">
                          {(
                            [
                              {
                                val: 'Verificada',
                                icon: CheckCircle2,
                                activeClass:
                                  'bg-white text-[#15803D] shadow-xs',
                              },
                              {
                                val: 'Falsa',
                                icon: XCircle,
                                activeClass:
                                  'bg-white text-[#BE123C] shadow-xs',
                              },
                              {
                                val: 'Sin auditar',
                                icon: Clock,
                                activeClass:
                                  'bg-white text-[#B45309] shadow-xs',
                              },
                            ] as const
                          ).map((st) => {
                            const Icon = st.icon;
                            const isActive = item.estatus_auditoria === st.val;
                            return (
                              <button
                                key={st.val}
                                type="button"
                                onClick={() =>
                                  onUpdateLlamada({
                                    ...item,
                                    estatus_auditoria:
                                      st.val as EstatusAuditoriaLlamada,
                                  })
                                }
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                  isActive
                                    ? st.activeClass
                                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                                }`}
                              >
                                <Icon className="h-3 w-3" />
                                {st.val === 'Sin auditar' ? 'Pend.' : st.val}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={currentObs}
                          onChange={(e) =>
                            setDraftObs((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveObservation(item);
                            }
                          }}
                          placeholder="Observaciones de auditoría..."
                          className="flex-1 px-3 py-1.5 rounded-lg border border-[#E6DDF5] bg-[#FAF8FC] text-xs text-[#1F172B] placeholder:text-[#9D8FB5] focus:outline-none focus:border-[#7C3AED] focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveObservation(item)}
                          title="Guardar observación"
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors shrink-0 ${
                            savedToastId === item.id
                              ? 'bg-[#DCFCE7] text-[#15803D]'
                              : obsModified
                                ? 'bg-[#7C3AED] text-white hover:bg-[#6D28D9]'
                                : 'bg-[#F3ECFC] text-[#5B21B6] hover:bg-[#E7DAFA]'
                          }`}
                        >
                          <Save className="h-3.5 w-3.5" />
                          {savedToastId === item.id ? 'Listo' : 'Guardar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          title="Eliminar registro de llamada"
                          aria-label="Eliminar llamada"
                          className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2] border border-transparent hover:border-[#FECDD3] transition-colors shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: New Call */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E6DDF5] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1ECF9]">
              <h3 className="font-display text-base font-bold text-[#1F172B]">
                Registrar nueva llamada de seguimiento
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Sucursal
                  </label>
                  <select
                    disabled={userRole === 'cajera'}
                    value={
                      userRole === 'cajera'
                        ? selectedSucursalId
                        : newForm.sucursal_id
                    }
                    onChange={(e) =>
                      setNewForm({ ...newForm, sucursal_id: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm disabled:opacity-60"
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

                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Estatus de vencimiento
                  </label>
                  <select
                    value={newForm.estatus_vencimiento}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        estatus_vencimiento: e.target.value as EstatusVencimiento,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                  >
                    <option value="Al corriente">Al corriente</option>
                    <option value="Por vencer">Por vencer</option>
                    <option value="Vencido">Vencido</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Nombre completo del cliente *
                </label>
                <input
                  type="text"
                  required
                  value={newForm.cliente_nombre}
                  onChange={(e) =>
                    setNewForm({ ...newForm, cliente_nombre: e.target.value })
                  }
                  placeholder="Ej. Laura Patricia Mendoza"
                  className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Contrato
                  </label>
                  <input
                    type="text"
                    value={newForm.contrato}
                    onChange={(e) =>
                      setNewForm({ ...newForm, contrato: e.target.value })
                    }
                    placeholder="CTR-2026-5010"
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Teléfono (10 dígitos) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={newForm.telefono}
                    onChange={(e) =>
                      setNewForm({ ...newForm, telefono: e.target.value })
                    }
                    placeholder="5512345678"
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Monto préstamo ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newForm.monto_prestamo}
                    onChange={(e) =>
                      setNewForm({ ...newForm, monto_prestamo: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Reporte inicial de cajera
                </label>
                <select
                  value={newForm.reporte_cajera}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      reporte_cajera: e.target.value as ReporteCajeraOpcion,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                >
                  {dropdownOpciones.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>

              {!isCajera && (
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Observaciones
                  </label>
                  <input
                    type="text"
                    value={newForm.observaciones_admin}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        observaciones_admin: e.target.value,
                      })
                    }
                    placeholder="Acuerdo o nota para auditoría..."
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#6E5F87] hover:bg-[#FAF8FC]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                >
                  Guardar llamada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Import Cartera Modal (.csv / .xlsx) */}
      {canImport && showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/45 backdrop-blur-[2px]">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-[#E6DDF5] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1ECF9]">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 text-[#7C3AED]" />
                <div>
                  <h3 className="font-display text-base font-bold text-[#1F172B]">
                    {isCajera
                      ? `Subir base de llamadas (${dailyBatchSummary.nextLoteNum} de 3 hoy)`
                      : 'Importar base de llamadas (.csv o Excel .xlsx)'}
                  </h3>
                  <p className="text-xs text-[#7A6B93]">
                    {isCajera
                      ? `Se sumará a tus ${dailyBatchSummary.totalHoyClientes} registros acumulados hoy en ${activeBranchObj?.nombre || 'tu sucursal'} sin borrar cargas previas.`
                      : 'Los registros se asignarán automáticamente a su sucursal en Supabase.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {importError && (
                <div
                  role="alert"
                  className="rounded-xl px-4 py-3 bg-[#FFF1F2] border border-[#FECDD3] text-xs font-semibold text-[#BE123C]"
                >
                  {importError}
                </div>
              )}

              {isCajera && dailyBatchSummary.limitReached && (
                <div
                  role="alert"
                  className="rounded-xl px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A] text-xs font-semibold text-[#92400E]"
                >
                  Ya alcanzaste el máximo de 3 bases de datos cargadas hoy ({todayStr}). Podrás subir una nueva base mañana.
                </div>
              )}

              {/* Visual Required Headers Guide */}
              <div className="rounded-xl border border-[#DDD6FE] bg-[#FAF7FE] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#4C1D95]">
                      Guía de encabezados exactos requeridos
                    </h4>
                    <p className="text-[11px] text-[#6E5F87]">
                      {isCajera
                        ? `Incluye las columnas requeridas. Para tu sucursal (${activeBranchObj?.nombre || 'asignada'}), "sucursal" puede ir con tu sucursal o vacío.`
                        : 'La primera fila de tu archivo debe incluir estas 6 columnas exactas (opcional: estatus_vencimiento).'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplateCSV}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#F3ECFC] text-[#5B21B6] border border-[#C4B5FD] transition-colors shrink-0"
                  >
                    <Download className="h-3.5 w-3.5 text-[#DB2777]" />
                    Descargar plantilla de ejemplo (.csv)
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { col: 'sucursal', ex: isCajera ? activeBranchObj?.nombre || 'Tu sucursal' : 'Sucursal Centro o SUC-01' },
                    { col: 'cliente', ex: 'María Fernanda López' },
                    { col: 'contrato', ex: 'CTR-2026-8801' },
                    { col: 'telefono', ex: '5512345678 (10 dígitos)' },
                    { col: 'monto_prestamo', ex: '$2,000.00 o monto / préstamo' },
                    { col: 'fecha_vencimiento', ex: '2026-11-25 (AAAA-MM-DD)' },
                  ].map((item) => (
                    <div
                      key={item.col}
                      className="rounded-lg bg-white border border-[#EAE3F5] px-3 py-2"
                    >
                      <code className="text-xs font-bold text-[#DB2777]">
                        {item.col}
                      </code>
                      <p className="text-[11px] text-[#6E5F87] truncate mt-0.5">
                        Ej. {item.ex}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* File Picker */}
              <label
                className={`flex flex-col items-center justify-center gap-2 px-6 py-6 rounded-xl border-2 border-dashed transition-colors text-center ${
                  isCajera && dailyBatchSummary.limitReached
                    ? 'border-[#E6DDF5] bg-[#FAF8FC] opacity-60 cursor-not-allowed'
                    : 'border-[#C4B5FD] bg-[#FCFAFE] hover:bg-[#F3ECFC]/60 cursor-pointer'
                }`}
              >
                <Upload className="h-6 w-6 text-[#7C3AED]" />
                <div className="text-xs font-semibold text-[#1F172B]">
                  {importFileName
                    ? `Archivo seleccionado: ${importFileName}`
                    : 'Haz clic para seleccionar tu archivo .csv o .xlsx'}
                </div>
                <p className="text-[11px] text-[#7A6B93]">
                  Soporta libros de Excel (.xlsx, .xls) y archivos CSV separados por comas.
                </p>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  disabled={isCajera && dailyBatchSummary.limitReached}
                  className="hidden"
                  onChange={handleImportFileChange}
                />
              </label>

              {importWarnings.length > 0 && (
                <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#B45309]">
                    <AlertCircle className="h-4 w-4" />
                    Observaciones al leer el archivo ({importWarnings.length})
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-[#92400E] space-y-0.5 max-h-24 overflow-y-auto">
                    {importWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Table */}
              {parsedImportRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#15803D]">
                      Vista previa lista para importar: {parsedImportRows.length} cliente(s)
                    </span>
                  </div>
                  <div className="max-h-56 overflow-auto border border-[#EAE3F5] rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAF8FC] border-b border-[#F1ECF9] text-[#6E5F87]">
                          <th className="py-2 px-3">Sucursal</th>
                          <th className="py-2 px-3">Cliente</th>
                          <th className="py-2 px-3">Contrato</th>
                          <th className="py-2 px-3">Teléfono</th>
                          <th className="py-2 px-3 text-right">Monto</th>
                          <th className="py-2 px-3">Vencimiento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3EEF9]">
                        {parsedImportRows.slice(0, 50).map((row) => (
                          <tr key={row.id}>
                            <td className="py-2 px-3 font-medium text-[#5B21B6]">
                              {row.sucursal_nombre}
                            </td>
                            <td className="py-2 px-3 font-semibold text-[#1F172B]">
                              {row.cliente_nombre}
                            </td>
                            <td className="py-2 px-3 font-mono-num">
                              {row.contrato}
                            </td>
                            <td className="py-2 px-3 font-mono-num">
                              {row.telefono}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-num">
                              {formatCurrencyClean(getItemLoanAmount(row))}
                            </td>
                            <td className="py-2 px-3 font-mono-num">
                              {row.fecha_vencimiento} ({row.estatus_vencimiento})
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#F1ECF9] bg-[#FAF8FC]">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#6E5F87] hover:bg-white border border-[#E6DDF5]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={importing || parsedImportRows.length === 0}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {importing
                  ? 'Importando a Supabase...'
                  : `Importar ${parsedImportRows.length} llamada(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal (Creador only) */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="¿Seguro que deseas eliminar este registro?"
        detail={
          deleteTarget
            ? `Se eliminará la llamada de ${deleteTarget.cliente_nombre} (${deleteTarget.contrato} · ${deleteTarget.sucursal_nombre}) de llamadas_sucursal.`
            : undefined
        }
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await onDeleteLlamada(deleteTarget.id);
            setDeleteTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
