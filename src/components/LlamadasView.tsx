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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  EstatusAuditoriaLlamada,
  EstatusVencimiento,
  LlamadaSucursal,
  ReporteCajeraOpcion,
  RolUsuario,
  Sucursal,
} from '../types/controlops';
import {
  addDaysYYYYMMDD,
  extractLlamadaBatchInfo,
  formatCurrencyClean,
  getDailyBatchSummaryForBranch,
  getLlamadaLocalDate,
  getTodayLocalYYYYMMDD,
  parseMoneyInput,
  sanitizePhoneForWhatsApp,
  toLocalYYYYMMDD,
} from '../utils/calculations';
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
  onUpdateLlamada: (updated: LlamadaSucursal) => Promise<ServiceResult | void>;
  onCreateLlamada: (nueva: LlamadaSucursal) => Promise<void>;
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

export const LlamadasView: React.FC<LlamadasViewProps> = ({
  llamadas,
  sucursales,
  selectedSucursalId,
  userRole,
  currentUserId,
  currentUserName,
  opcionesReporte,
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
  const dropdownOpciones: ReporteCajeraOpcion[] = [
    'Sin reporte',
    ...opcionesReporte,
  ];
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAuditoria, setFilterAuditoria] = useState<string>('todos');
  const [filterVencimiento, setFilterVencimiento] = useState<string>('todos');
  const [filterMonto, setFilterMonto] = useState<string>('todos');
  const [sortBy, setSortBy] = useState<string>('recientes');
  const [draftObs, setDraftObs] = useState<Record<string, string>>({});
  const [savedToastId, setSavedToastId] = useState<string | null>(null);
  const [registeringRowId, setRegisteringRowId] = useState<string | null>(null);
  const [rowRegisterToastId, setRowRegisterToastId] = useState<string | null>(
    null
  );
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
    return llamadas.filter((l) => l.sucursal_id === selectedSucursalId);
  }, [llamadas, selectedSucursalId]);

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
      getDailyBatchSummaryForBranch(llamadas, activeBranchForBatch, todayStr),
    [llamadas, activeBranchForBatch, todayStr]
  );

  const todayAllBranchesStats = useMemo(() => {
    const todayScoped = scopedLlamadas.filter(
      (l) => getLlamadaLocalDate(l) === todayStr
    );
    return {
      totalHoyClientes: todayScoped.length,
      totalHoyRegistradas: todayScoped.filter((l) => l.llamada_registrada).length,
    };
  }, [scopedLlamadas, todayStr]);

  const metrics = useMemo(() => {
    const registradas = scopedLlamadas.filter((l) => l.llamada_registrada).length;
    const pendientes = scopedLlamadas.filter((l) => !l.llamada_registrada).length;
    const verificadas = scopedLlamadas.filter(
      (l) => l.estatus_auditoria === 'Verificada'
    ).length;
    const falsas = scopedLlamadas.filter(
      (l) => l.estatus_auditoria === 'Falsa'
    ).length;
    const sinAuditar = scopedLlamadas.filter(
      (l) => l.estatus_auditoria === 'Sin auditar'
    ).length;

    const metaDiaria =
      selectedSucursalId === 'todas'
        ? sucursales.reduce((acc, s) => acc + (s.meta_llamadas_diarias || 30), 0)
        : sucursales.find((s) => s.id === selectedSucursalId)
            ?.meta_llamadas_diarias || 30;

    const pct = metaDiaria > 0 ? Math.min(100, (registradas / metaDiaria) * 100) : 0;
    return {
      registradas,
      pendientes,
      verificadas,
      falsas,
      sinAuditar,
      metaDiaria,
      pct,
    };
  }, [scopedLlamadas, selectedSucursalId, sucursales]);

  const filteredLlamadas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = scopedLlamadas.filter((item) => {
      if (q) {
        const matchText =
          (item.cliente_nombre || '').toLowerCase().includes(q) ||
          (item.contrato || '').toLowerCase().includes(q) ||
          (item.telefono || '').toLowerCase().includes(q);
        if (!matchText) return false;
      }

      if (filterAuditoria !== 'todos') {
        if (filterAuditoria === 'pendiente_marcar') {
          if (item.llamada_registrada) return false;
        } else if (filterAuditoria === 'marcadas') {
          if (!item.llamada_registrada) return false;
        } else if (canAuditCalls && item.estatus_auditoria !== filterAuditoria) {
          return false;
        }
      }

      if (
        filterVencimiento !== 'todos' &&
        item.estatus_vencimiento !== filterVencimiento
      ) {
        return false;
      }

      if (filterMonto === 'menor_5k' && item.monto_prestamo >= 5000) return false;
      if (
        filterMonto === 'entre_5k_15k' &&
        (item.monto_prestamo < 5000 || item.monto_prestamo > 15000)
      ) {
        return false;
      }
      if (filterMonto === 'mayor_15k' && item.monto_prestamo <= 15000) return false;

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'mayor_monto') return b.monto_prestamo - a.monto_prestamo;
      if (sortBy === 'menor_monto') return a.monto_prestamo - b.monto_prestamo;
      if (sortBy === 'vencimiento') {
        return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
      }
      return b.fecha_registro.localeCompare(a.fecha_registro);
    });

    return list;
  }, [
    scopedLlamadas,
    searchQuery,
    filterAuditoria,
    filterVencimiento,
    filterMonto,
    sortBy,
  ]);

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
      monto_prestamo: parseMoneyInput(newForm.monto_prestamo),
      estatus_vencimiento: newForm.estatus_vencimiento,
      fecha_vencimiento: todayStr,
      reporte_cajera: newForm.reporte_cajera,
      estatus_auditoria: 'Sin auditar',
      observaciones_admin: isCajera ? '' : newForm.observaciones_admin.trim(),
      cajera_nombre: currentUserName || suc.responsable_caja,
      cajera_id: currentUserId || '',
      llamada_registrada: true,
      fecha_registro: new Date().toISOString(),
    };

    await onCreateLlamada(nueva);
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
        const montoRaw = String(
          normalized.monto_prestamo ?? normalized.monto ?? '0'
        ).replace(/[^0-9.]/g, '');
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
          monto_prestamo: Number(montoRaw) || 0,
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
            <div className="flex items-center justify-between max-w-2xl">
              <h2 className="font-display text-base font-bold text-[#1F172B]">
                Avance diario de marcación
              </h2>
              <span className="font-mono-num text-sm font-bold text-[#5B21B6]">
                {metrics.registradas} / {metrics.metaDiaria} llamadas (
                {metrics.pct.toFixed(0)}%)
              </span>
            </div>
            <div className="h-3 w-full max-w-2xl rounded-full bg-[#F3ECFC] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] transition-all duration-300"
                style={{ width: `${Math.max(2, metrics.pct)}%` }}
              />
            </div>
            <p className="text-xs text-[#7A6B93] pt-0.5">
              Meta diaria operativa: 30 llamadas por sucursal · Faltan{' '}
              <span className="font-mono-num font-semibold text-[#1F172B]">
                {Math.max(0, metrics.metaDiaria - metrics.registradas)}
              </span>{' '}
              para completar la meta del día.
            </p>
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

      {/* Search & Multi-Filters */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-4 md:p-5 space-y-3">
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${
            canFilterBranch && onSelectSucursal ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
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
          ) : (
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
          )}

          <select
            aria-label="Filtrar por vencimiento"
            value={filterVencimiento}
            onChange={(e) => setFilterVencimiento(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#8B5CF6]"
          >
            <option value="todos">Vencimiento: Todos</option>
            <option value="Vencido">Vencido</option>
            <option value="Por vencer">Por vencer</option>
            <option value="Al corriente">Al corriente</option>
          </select>

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Filtrar por monto"
              value={filterMonto}
              onChange={(e) => setFilterMonto(e.target.value)}
              className="px-2.5 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="todos">Monto: Todos</option>
              <option value="menor_5k">&lt; $5,000</option>
              <option value="entre_5k_15k">$5k - $15k</option>
              <option value="mayor_15k">&gt; $15,000</option>
            </select>

            <select
              aria-label="Ordenar lista"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2.5 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="recientes">Recientes</option>
              <option value="mayor_monto">Mayor monto</option>
              <option value="menor_monto">Menor monto</option>
              <option value="vencimiento">Vencimiento</option>
            </select>
          </div>
        </div>
      </section>

      {/* Client Calls Table / Cards */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F1ECF9] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#55476E]">
            Mostrando {filteredLlamadas.length} cliente(s)
          </span>
          {(searchQuery ||
            filterAuditoria !== 'todos' ||
            filterVencimiento !== 'todos' ||
            filterMonto !== 'todos') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterAuditoria('todos');
                setFilterVencimiento('todos');
                setFilterMonto('todos');
              }}
              className="text-xs font-medium text-[#DB2777] hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {filteredLlamadas.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-[#1F172B]">
              No hay clientes que coincidan con tu búsqueda
            </p>
            <p className="text-xs text-[#7A6B93]">
              Ajusta los filtros de monto, vencimiento o registra una nueva
              llamada.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F1ECF9]">
            {filteredLlamadas.map((item) => {
              const currentObs =
                draftObs[item.id] !== undefined
                  ? draftObs[item.id]
                  : item.observaciones_admin;
              const obsModified =
                draftObs[item.id] !== undefined &&
                draftObs[item.id] !== item.observaciones_admin;
              const batchInfo = extractLlamadaBatchInfo(item);

              return (
                <div
                  key={item.id}
                  className="p-4 md:p-5 hover:bg-[#FCFAFE] transition-colors grid grid-cols-1 xl:grid-cols-12 gap-4 items-start"
                >
                  {/* Client Info */}
                  <div
                    className={`${
                      canAuditCalls ? 'xl:col-span-3' : 'xl:col-span-4'
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
                      {formatCurrencyClean(item.monto_prestamo)}
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
                    } flex flex-wrap items-center gap-2`}
                  >
                    {isCajera ? (
                      <>
                        <button
                          type="button"
                          disabled={registeringRowId === item.id}
                          onClick={async () => {
                            if (item.llamada_registrada) return;
                            setRegisteringRowId(item.id);
                            await onUpdateLlamada({
                              ...item,
                              sucursal: item.sucursal || item.sucursal_nombre,
                              cajera_nombre:
                                currentUserName || item.cajera_nombre,
                              cajera_id: currentUserId || item.cajera_id,
                              llamada_registrada: true,
                              fecha_registro:
                                item.fecha_registro || new Date().toISOString(),
                            });
                            setRegisteringRowId(null);
                            setRowRegisterToastId(item.id);
                            setTimeout(
                              () =>
                                setRowRegisterToastId((prev) =>
                                  prev === item.id ? null : prev
                                ),
                              2000
                            );
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                            item.llamada_registrada
                              ? 'bg-[#ECFDF5] text-[#15803D] border border-[#A7F3D0] cursor-default'
                              : 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-xs disabled:opacity-60'
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {registeringRowId === item.id
                            ? 'Guardando...'
                            : item.llamada_registrada
                              ? rowRegisterToastId === item.id
                                ? 'Guardada'
                                : 'Llamada registrada'
                              : 'Registrar llamada'}
                        </button>
                        <a
                          href={`tel:${item.telefono}`}
                          onClick={() => {
                            if (!item.llamada_registrada) {
                              void onUpdateLlamada({
                                ...item,
                                sucursal:
                                  item.sucursal || item.sucursal_nombre,
                                cajera_nombre:
                                  currentUserName || item.cajera_nombre,
                                cajera_id: currentUserId || item.cajera_id,
                                llamada_registrada: true,
                              });
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#F3ECFC] hover:bg-[#E7DAFA] text-[#5B21B6] transition-colors whitespace-nowrap"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Llamar
                        </a>
                        <a
                          href={`https://wa.me/${sanitizePhoneForWhatsApp(item.telefono)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            if (!item.llamada_registrada) {
                              void onUpdateLlamada({
                                ...item,
                                sucursal:
                                  item.sucursal || item.sucursal_nombre,
                                cajera_nombre:
                                  currentUserName || item.cajera_nombre,
                                cajera_id: currentUserId || item.cajera_id,
                                llamada_registrada: true,
                              });
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#FDF2F8] hover:bg-[#FCE7F3] text-[#BE185D] border border-[#FBCFE8] transition-colors whitespace-nowrap"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      </>
                    ) : (
                      <div className="text-xs text-[#6E5F87] space-y-0.5">
                        <div className="font-medium text-[#1F172B]">
                          {item.llamada_registrada
                            ? 'Marcación registrada'
                            : 'Sin marcar'}
                        </div>
                        <div className="font-mono-num text-[11px]">
                          Tel. {item.telefono}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cashier Report Dropdown (Editable only by Cajera) */}
                  <div
                    className={
                      canAuditCalls ? 'xl:col-span-2' : 'xl:col-span-3 space-y-1.5'
                    }
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-[11px] font-medium text-[#7A6B93]">
                        Reporte de cajera
                      </label>
                      {!canAuditCalls && (
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            item.llamada_registrada
                              ? 'bg-[#ECFDF5] text-[#15803D]'
                              : 'bg-[#FEF9C3] text-[#A16207]'
                          }`}
                        >
                          {item.llamada_registrada ? 'Marcada' : 'Pendiente'}
                        </span>
                      )}
                    </div>
                    {isCajera ? (
                      <select
                        value={item.reporte_cajera}
                        onChange={(e) =>
                          onUpdateLlamada({
                            ...item,
                            sucursal: item.sucursal || item.sucursal_nombre,
                            cajera_nombre:
                              currentUserName || item.cajera_nombre,
                            cajera_id: currentUserId || item.cajera_id,
                            reporte_cajera: e.target
                              .value as ReporteCajeraOpcion,
                            llamada_registrada:
                              e.target.value !== 'Sin reporte'
                                ? true
                                : item.llamada_registrada,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] bg-white text-xs font-medium text-[#1F172B] focus:outline-none focus:border-[#7C3AED]"
                      >
                        {dropdownOpciones.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="px-3 py-2 rounded-xl border border-[#F1ECF9] bg-[#FAF8FC] text-xs font-semibold text-[#1F172B]">
                        {item.reporte_cajera}
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
                    { col: 'monto_prestamo', ex: '12500 (solo número)' },
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
                              {formatCurrencyClean(row.monto_prestamo)}
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
