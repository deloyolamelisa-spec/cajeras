import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Plus,
  TrendingUp,
  Upload,
  X,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  BranchMetricSummary,
  GastoYRefrendo,
  RolUsuario,
  Sucursal,
} from '../types/controlops';
import {
  formatCurrencyClean,
  formatMXN,
  formatPercent,
  getTodayLocalYYYYMMDD,
  parseMoneyInput,
  roundMoney2,
} from '../utils/calculations';
import { ServiceResult, uploadEvidenciaFoto } from '../services/controlOpsService';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface GastosRefrendosViewProps {
  registros: GastoYRefrendo[];
  summaries: BranchMetricSummary[];
  sucursales: Sucursal[];
  selectedSucursalId: string;
  userRole: RolUsuario;
  currentUserId?: string;
  currentUserName?: string;
  fixedTab?: 'gastos' | 'refrendos';
  onCreateRegistro: (nuevo: GastoYRefrendo) => Promise<ServiceResult | void>;
  onUpdateRegistro?: (updated: GastoYRefrendo) => Promise<ServiceResult | void>;
  onDeleteRegistro: (registro: GastoYRefrendo) => Promise<void>;
  onDeleteEvidenciaRegistro: (registro: GastoYRefrendo) => Promise<void>;
  openCreateModalExternal?: boolean;
  onCloseCreateModalExternal?: () => void;
}

export const GastosRefrendosView: React.FC<GastosRefrendosViewProps> = ({
  registros,
  summaries,
  sucursales,
  selectedSucursalId,
  userRole,
  currentUserId,
  currentUserName,
  fixedTab,
  onCreateRegistro,
  onUpdateRegistro,
  onDeleteRegistro,
  onDeleteEvidenciaRegistro,
  openCreateModalExternal = false,
  onCloseCreateModalExternal,
}) => {
  const isCajera = userRole === 'cajera';
  const isCreador = userRole === 'creador';
  const canMutateModal = isCajera || isCreador;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'gastos' | 'refrendos' | 'bitacora'>(
    fixedTab ?? 'gastos'
  );
  const activeTab = fixedTab ?? subTab;
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    mode: 'record' | 'photo';
    registro: GastoYRefrendo;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const [editingRegistro, setEditingRegistro] =
    useState<GastoYRefrendo | null>(null);

  const defaultSucursal =
    selectedSucursalId === 'todas'
      ? sucursales[0]?.id || 'suc-centro'
      : selectedSucursalId;

  const [form, setForm] = useState({
    sucursal_id: defaultSucursal,
    tipo: (fixedTab === 'refrendos' ? 'Refrendo' : 'Gasto') as
      | 'Gasto'
      | 'Refrendo',
    categoria: 'Operación de Sucursal',
    concepto: '',
    monto_real: '1200',
    presupuesto_limite: '1500',
    cantidad_refrendos: '5',
    meta_refrendos: '45',
    fecha: todayStr,
    notas: '',
  });

  const openCreateModal = () => {
    setEditingRegistro(null);
    const preferredTipo: 'Gasto' | 'Refrendo' =
      fixedTab === 'refrendos' || activeTab === 'refrendos'
        ? 'Refrendo'
        : 'Gasto';
    setForm((prev) => ({
      ...prev,
      sucursal_id:
        selectedSucursalId === 'todas'
          ? sucursales[0]?.id || 'suc-centro'
          : selectedSucursalId,
      tipo: preferredTipo,
      concepto: '',
      monto_real: '',
      presupuesto_limite: prev.presupuesto_limite || '0',
      cantidad_refrendos: preferredTipo === 'Refrendo' ? '1' : '0',
      fecha: getTodayLocalYYYYMMDD(),
      notas: '',
    }));
    setReceiptFile(null);
    setShowNewModal(true);
  };

  const openEditModal = (registro: GastoYRefrendo) => {
    if (!isCreador) return;
    setEditingRegistro(registro);
    setForm({
      sucursal_id: registro.sucursal_id,
      tipo: registro.tipo,
      categoria: registro.categoria || 'Operación de Sucursal',
      concepto: registro.concepto,
      monto_real: String(registro.monto_real ?? 0),
      presupuesto_limite: String(registro.presupuesto_limite ?? 0),
      cantidad_refrendos: String(registro.cantidad_refrendos ?? 0),
      meta_refrendos: String(registro.meta_refrendos ?? 0),
      fecha: registro.fecha || getTodayLocalYYYYMMDD(),
      notas: registro.notas || '',
    });
    setReceiptFile(null);
    setShowNewModal(true);
  };

  const isModalOpen = canMutateModal && (showNewModal || openCreateModalExternal);
  const closeModal = () => {
    setShowNewModal(false);
    setEditingRegistro(null);
    onCloseCreateModalExternal?.();
  };

  const visibleSummaries = useMemo(() => {
    if (selectedSucursalId === 'todas') return summaries;
    return summaries.filter((s) => s.sucursal.id === selectedSucursalId);
  }, [summaries, selectedSucursalId]);

  const excedidas = useMemo(
    () => visibleSummaries.filter((s) => s.excedioPresupuesto),
    [visibleSummaries]
  );

  const scopedRegistros = useMemo(() => {
    if (selectedSucursalId === 'todas') return registros;
    return registros.filter((r) => r.sucursal_id === selectedSucursalId);
  }, [registros, selectedSucursalId]);

  const periodRollup = useMemo(() => {
    const monthPrefix = todayStr.slice(0, 7);
    const gastosHoy = roundMoney2(
      scopedRegistros
        .filter((r) => r.tipo === 'Gasto' && r.fecha === todayStr)
        .reduce((acc, r) => acc + (Number(r.monto_real) || 0), 0)
    );
    const gastosMes = roundMoney2(
      scopedRegistros
        .filter((r) => r.tipo === 'Gasto' && r.fecha?.startsWith(monthPrefix))
        .reduce((acc, r) => acc + (Number(r.monto_real) || 0), 0)
    );
    const refrendosHoy = roundMoney2(
      scopedRegistros
        .filter((r) => r.tipo === 'Refrendo' && r.fecha === todayStr)
        .reduce((acc, r) => acc + (Number(r.monto_real) || 0), 0)
    );
    const refrendosMes = roundMoney2(
      scopedRegistros
        .filter((r) => r.tipo === 'Refrendo' && r.fecha?.startsWith(monthPrefix))
        .reduce((acc, r) => acc + (Number(r.monto_real) || 0), 0)
    );
    return {
      gastosHoy,
      gastosMes,
      refrendosHoy,
      refrendosMes,
      monthPrefix,
    };
  }, [scopedRegistros, todayStr]);

  const maxChartCeiling = useMemo(() => {
    const vals = visibleSummaries.flatMap((s) => [
      s.gastoRealTotal,
      s.gastoPresupuestoTotal,
    ]);
    return Math.max(1000, ...vals) * 1.15;
  }, [visibleSummaries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.concepto.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const targetSucId =
        userRole === 'cajera' ? selectedSucursalId : form.sucursal_id;
      const suc =
        sucursales.find((s) => s.id === targetSucId) || sucursales[0];
      const safeSucursalNombre = (suc?.nombre || 'Sucursal').trim() || 'Sucursal';
      let evidenciaUrl: string | null = editingRegistro?.evidencia_url ?? null;
      if (receiptFile) {
        const res = await uploadEvidenciaFoto(
          receiptFile,
          'gastos',
          suc?.id || targetSucId
        );
        if (!res.uploadedToSupabase || !res.url) {
          setSaveError(
            res.error ||
              'No se pudo subir la foto del comprobante a Supabase Storage.'
          );
          return;
        }
        evidenciaUrl = res.url;
      }

      const safeFecha = isCreador
        ? form.fecha || getTodayLocalYYYYMMDD()
        : getTodayLocalYYYYMMDD();

      if (editingRegistro && onUpdateRegistro) {
        const updated: GastoYRefrendo = {
          ...editingRegistro,
          sucursal_id: suc?.id || targetSucId,
          sucursal_nombre: safeSucursalNombre,
          sucursal: safeSucursalNombre,
          tipo: form.tipo,
          categoria: form.categoria,
          concepto: form.concepto.trim(),
          monto_real: parseMoneyInput(form.monto_real),
          presupuesto_limite:
            form.tipo === 'Gasto' ? parseMoneyInput(form.presupuesto_limite) : 0,
          cantidad_refrendos:
            form.tipo === 'Refrendo' ? Number(form.cantidad_refrendos) || 0 : 0,
          meta_refrendos:
            form.tipo === 'Refrendo' ? parseMoneyInput(form.meta_refrendos) : 0,
          fecha: safeFecha,
          evidencia_url: evidenciaUrl,
          notas: form.notas.trim(),
        };
        const updRes = await onUpdateRegistro(updated);
        if (updRes && updRes.ok === false) {
          setSaveError(
            updRes.error || 'No se pudo actualizar el registro en Supabase.'
          );
          return;
        }
        setReceiptFile(null);
        closeModal();
        return;
      }

      const nuevo: GastoYRefrendo = {
        id: `gr-${Date.now()}`,
        sucursal_id: suc?.id || targetSucId,
        sucursal_nombre: safeSucursalNombre,
        sucursal: safeSucursalNombre,
        cajera_id: currentUserId || '',
        cajera_nombre: currentUserName || suc?.responsable_caja || '',
        tipo: form.tipo,
        categoria: form.categoria,
        concepto: form.concepto.trim(),
        monto_real: parseMoneyInput(form.monto_real),
        presupuesto_limite:
          form.tipo === 'Gasto' ? parseMoneyInput(form.presupuesto_limite) : 0,
        cantidad_refrendos:
          form.tipo === 'Refrendo' ? Number(form.cantidad_refrendos) || 0 : 0,
        meta_refrendos:
          form.tipo === 'Refrendo' ? parseMoneyInput(form.meta_refrendos) : 0,
        fecha: safeFecha,
        responsable:
          (isCajera && currentUserName) ||
          currentUserName ||
          suc?.responsable_caja ||
          '',
        evidencia_url: evidenciaUrl,
        notas: form.notas.trim(),
      };
      const saveRes = await onCreateRegistro(nuevo);
      if (saveRes && saveRes.ok === false) {
        setSaveError(
          saveRes.error || 'No se pudo guardar el registro en Supabase.'
        );
        return;
      }
      setForm({
        ...form,
        concepto: '',
        notas: '',
      });
      setReceiptFile(null);
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {saveError && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] px-4 py-3 text-xs sm:text-sm font-medium text-[#BE123C] flex items-center justify-between gap-3"
        >
          <span>{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="font-bold underline shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {!fixedTab ? (
          <div className="flex items-center gap-1 p-1 bg-white border border-[#EAE3F5] rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setSubTab('gastos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'gastos'
                  ? 'bg-[#F3ECFC] text-[#5B21B6]'
                  : 'text-[#6E5F87] hover:text-[#1F172B]'
              }`}
            >
              Control de Gastos (Techo Máximo)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('refrendos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'refrendos'
                  ? 'bg-[#F3ECFC] text-[#5B21B6]'
                  : 'text-[#6E5F87] hover:text-[#1F172B]'
              }`}
            >
              Refrendos por Sucursal
            </button>
            <button
              type="button"
              onClick={() => setSubTab('bitacora')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'bitacora'
                  ? 'bg-[#F3ECFC] text-[#5B21B6]'
                  : 'text-[#6E5F87] hover:text-[#1F172B]'
              }`}
            >
              Bitácora ({scopedRegistros.length})
            </button>
          </div>
        ) : (
          <div>
            <h2 className="font-display text-lg font-bold text-[#1F172B]">
              {fixedTab === 'refrendos'
                ? 'Mis Refrendos'
                : 'Mis Gastos y Techo Máximo'}
            </h2>
            <p className="text-xs text-[#7A6B93]">
              {fixedTab === 'refrendos'
                ? 'Avance mensual de renovaciones y captura diaria de refrendos'
                : 'Control operativo de gastos dentro del techo autorizado'}
            </p>
          </div>
        )}

        {canMutateModal ? (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            {isCreador
              ? 'Agregar / Ajustar monto'
              : fixedTab === 'refrendos'
                ? 'Registrar refrendo'
                : fixedTab === 'gastos'
                  ? 'Registrar gasto'
                  : 'Registrar gasto o refrendo'}
          </button>
        ) : (
          <span className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#FAF7FE] text-[#6D28D9] border border-[#EAE3F5] w-fit">
            Modo Auditoría
          </span>
        )}
      </div>

      {activeTab === 'gastos' && (
        <div className="space-y-6">
          {/* Alert Banner for Over-Budget Branches */}
          {excedidas.length > 0 ? (
            <section className="rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-[#BE123C] shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-sm font-bold text-[#881337]">
                    Alerta de sobrecosto: {excedidas.length} sucursal(es)
                    superaron su techo máximo autorizado
                  </h3>
                  <p className="text-xs text-[#9F1239] mt-0.5">
                    El presupuesto funciona como límite superior estricto.
                    Cualquier gasto por encima representa un exceso financiero.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {excedidas.map((s) => (
                  <div
                    key={s.sucursal.id}
                    className="rounded-xl bg-white border border-[#FECDD3] px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#1F172B]">
                        {s.sucursal.nombre}
                      </p>
                      <p className="text-xs text-[#6E5F87] font-mono-num">
                        Real: {formatCurrencyClean(s.gastoRealTotal)} vs Límite:{' '}
                        {formatCurrencyClean(s.gastoPresupuestoTotal)}
                      </p>
                    </div>
                    <div className="text-right font-mono-num">
                      <p className="text-sm font-bold text-[#BE123C]">
                        +{formatCurrencyClean(s.excesoDinero)}
                      </p>
                      <p className="text-xs font-semibold text-[#E11D48]">
                        +{formatPercent(s.excesoPorcentaje)} excedido
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#15803D] shrink-0" />
              <p className="text-xs font-medium text-[#166534]">
                Todas las sucursales visibles operan dentro de su techo máximo
                de gasto autorizado.
              </p>
            </section>
          )}

          {/* Visual Chart: Techo Máximo vs Gasto Real */}
          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 md:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-[#1F172B]">
                  Gráfica comparativa: Gasto Real vs Techo Máximo
                </h2>
                <p className="text-xs text-[#7A6B93]">
                  Hoy ({todayStr}):{' '}
                  <span className="font-mono-num font-bold text-[#1F172B]">
                    {formatCurrencyClean(periodRollup.gastosHoy)}
                  </span>{' '}
                  · Acumulado del mes ({periodRollup.monthPrefix}):{' '}
                  <span className="font-mono-num font-bold text-[#5B21B6]">
                    {formatCurrencyClean(periodRollup.gastosMes)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#55476E]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#8B5CF6]" />
                  Dentro del límite
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#E11D48]" />
                  Techo excedido
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-0.5 bg-[#1F172B]" />
                  Techo máximo
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {visibleSummaries.map((s) => {
                const limitPct =
                  (s.gastoPresupuestoTotal / maxChartCeiling) * 100;
                const realPct = (s.gastoRealTotal / maxChartCeiling) * 100;

                return (
                  <div key={s.sucursal.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#1F172B]">
                        {s.sucursal.nombre}
                      </span>
                      <div className="font-mono-num flex items-center gap-3">
                        <span className="text-[#6E5F87]">
                          Techo: {formatCurrencyClean(s.gastoPresupuestoTotal)}
                        </span>
                        <span
                          className={`font-bold ${
                            s.excedioPresupuesto
                              ? 'text-[#BE123C]'
                              : 'text-[#15803D]'
                          }`}
                        >
                          Real: {formatCurrencyClean(s.gastoRealTotal)}
                          {s.excedioPresupuesto
                            ? ` (+${formatCurrencyClean(s.excesoDinero)} / +${formatPercent(s.excesoPorcentaje)})`
                            : ` (Margen ${formatCurrencyClean(s.gastoPresupuestoTotal - s.gastoRealTotal)})`}
                        </span>
                      </div>
                    </div>

                    <div className="relative h-7 w-full rounded-lg bg-[#F5F0FC] overflow-hidden">
                      {/* Real Spending Bar */}
                      <div
                        className={`h-full rounded-lg transition-all duration-300 ${
                          s.excedioPresupuesto
                            ? 'bg-gradient-to-r from-[#FB7185] to-[#E11D48]'
                            : 'bg-gradient-to-r from-[#A78BFA] to-[#7C3AED]'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(2, realPct))}%`,
                        }}
                      />
                      {/* Budget Ceiling Marker */}
                      <div
                        title={`Techo máximo: ${formatCurrencyClean(s.gastoPresupuestoTotal)}`}
                        className="absolute top-0 bottom-0 w-0.5 bg-[#1F172B] z-10"
                        style={{
                          left: `${Math.min(99, Math.max(1, limitPct))}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Detailed Budget Ceiling Table */}
          <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F1ECF9]">
              <h3 className="font-display text-sm font-bold text-[#1F172B]">
                Desglose numérico de sobrecostos y margen disponible
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#F1ECF9] bg-[#FAF8FC] text-[12px] font-semibold text-[#6E5F87]">
                    <th className="py-3 px-4">Sucursal</th>
                    <th className="py-3 px-4 text-right">Presupuesto Límite</th>
                    <th className="py-3 px-4 text-right">Monto Real</th>
                    <th className="py-3 px-4 text-right">Excedido / Margen ($)</th>
                    <th className="py-3 px-4 text-right">% Excedido / Uso</th>
                    <th className="py-3 px-4 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EEF9] text-sm">
                  {visibleSummaries.map((s) => {
                    const margen = s.gastoPresupuestoTotal - s.gastoRealTotal;
                    return (
                      <tr key={s.sucursal.id} className="hover:bg-[#FCFAFE]">
                        <td className="py-3.5 px-4 font-semibold text-[#1F172B]">
                          {s.sucursal.nombre}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-num text-[#55476E]">
                          {formatMXN(s.gastoPresupuestoTotal, 2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-num font-bold text-[#1F172B]">
                          {formatMXN(s.gastoRealTotal, 2)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono-num font-semibold ${
                            s.excedioPresupuesto
                              ? 'text-[#BE123C]'
                              : 'text-[#15803D]'
                          }`}
                        >
                          {s.excedioPresupuesto
                            ? `+${formatMXN(s.excesoDinero, 2)} excedido`
                            : `${formatMXN(margen, 2)} disponible`}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono-num font-semibold ${
                            s.excedioPresupuesto
                              ? 'text-[#BE123C]'
                              : 'text-[#5B21B6]'
                          }`}
                        >
                          {s.excedioPresupuesto
                            ? `+${formatPercent(s.excesoPorcentaje)}`
                            : `${formatPercent(s.pctUsoPresupuesto)} usado`}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {s.excedioPresupuesto ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#BE123C]">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Excedido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Dentro del límite
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Expense Movements & Receipts List */}
          <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F1ECF9] flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-[#1F172B]">
                  Movimientos de gasto capturados (
                  {scopedRegistros.filter((r) => r.tipo === 'Gasto').length})
                </h3>
                <p className="text-xs text-[#7A6B93]">
                  Revisión de comprobantes en evidencias_controlops y control de
                  capturas.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#F1ECF9] bg-[#FAF8FC] text-[12px] font-semibold text-[#6E5F87]">
                    <th className="py-3 px-4">Sucursal / Fecha</th>
                    <th className="py-3 px-4">Concepto</th>
                    <th className="py-3 px-4 text-right">Monto Real</th>
                    <th className="py-3 px-4">Comprobante</th>
                    {isCreador && (
                      <th className="py-3 px-4 text-right">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EEF9] text-sm">
                  {scopedRegistros
                    .filter((r) => r.tipo === 'Gasto')
                    .map((r) => (
                      <tr key={r.id} className="hover:bg-[#FCFAFE]">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#1F172B]">
                            {r.sucursal_nombre}
                          </div>
                          <div className="text-xs text-[#8B7CA5] font-mono-num">
                            {r.fecha} · {r.responsable}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1F172B]">
                            {r.concepto}
                          </div>
                          <div className="text-xs text-[#8B7CA5]">
                            {r.notas || r.categoria}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-bold text-[#1F172B]">
                          {formatMXN(r.monto_real, 2)}
                        </td>
                        <td className="py-3 px-4">
                          {r.evidencia_url ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewReceipt({
                                    url: r.evidencia_url!,
                                    title: `${r.sucursal_nombre} — ${r.concepto}`,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B21B6] hover:text-[#DB2777]"
                              >
                                <ImageIcon className="h-3.5 w-3.5" />
                                Ver ticket
                              </button>
                              {isCreador && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteTarget({
                                      mode: 'photo',
                                      registro: r,
                                    })
                                  }
                                  className="text-[11px] font-medium text-[#BE123C] hover:underline"
                                >
                                  Borrar foto
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-[#9D8FB5]">
                              Sin archivo
                            </span>
                          )}
                        </td>
                        {isCreador && (
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                            {onUpdateRegistro && (
                              <button
                                type="button"
                                onClick={() => openEditModal(r)}
                                title="Editar monto o datos"
                                aria-label="Editar registro"
                                className="p-1.5 rounded-lg text-[#5B21B6] hover:bg-[#F3ECFC]"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  mode: 'record',
                                  registro: r,
                                })
                              }
                              title="Eliminar registro de gasto"
                              aria-label="Eliminar registro"
                              className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'refrendos' && (
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 md:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-[#1F172B]">
                  Desempeño de refrendos por sucursal
                </h2>
                <p className="text-xs text-[#7A6B93]">
                  Hoy ({todayStr}):{' '}
                  <span className="font-mono-num font-bold text-[#15803D]">
                    {formatCurrencyClean(periodRollup.refrendosHoy)}
                  </span>{' '}
                  · Acumulado del mes ({periodRollup.monthPrefix}):{' '}
                  <span className="font-mono-num font-bold text-[#DB2777]">
                    {formatCurrencyClean(periodRollup.refrendosMes)}
                  </span>
                </p>
              </div>
              <TrendingUp className="h-5 w-5 text-[#DB2777]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleSummaries
                .slice()
                .sort((a, b) => b.pctRefrendos - a.pctRefrendos)
                .map((s) => {
                  const enMeta = s.pctRefrendos >= 100;
                  return (
                    <div
                      key={s.sucursal.id}
                      className="rounded-xl border border-[#EAE3F5] bg-[#FCFAFE] p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-[#1F172B]">
                            {s.sucursal.nombre}
                          </h3>
                          <p className="text-xs text-[#7A6B93]">
                            Responsable: {s.sucursal.responsable_caja}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            enMeta ? 'text-[#15803D]' : 'text-[#6D28D9]'
                          }`}
                        >
                          {enMeta
                            ? 'Meta superada'
                            : `${formatPercent(s.pctRefrendos)} de meta`}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between font-mono-num">
                        {s.refrendosMeta >= 500 ? (
                          <span className="text-base sm:text-lg font-bold text-[#1F172B]">
                            {formatCurrencyClean(s.montoRefrendos)}{' '}
                            <span className="text-xs font-normal text-[#8B7CA5]">
                              / {formatCurrencyClean(s.refrendosMeta)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-lg font-bold text-[#1F172B]">
                            {s.refrendosRealizados}{' '}
                            <span className="text-xs font-normal text-[#8B7CA5]">
                              / {s.refrendosMeta} refrendos
                            </span>
                          </span>
                        )}
                        <span className="text-sm font-semibold text-[#BE185D]">
                          {s.refrendosMeta >= 500
                            ? `${s.refrendosRealizados} op.`
                            : formatCurrencyClean(s.montoRefrendos)}
                        </span>
                      </div>

                      <div className="h-2.5 w-full rounded-full bg-[#EFE9F8] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            enMeta
                              ? 'bg-[#16A34A]'
                              : 'bg-gradient-to-r from-[#8B5CF6] to-[#EC4899]'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(4, s.pctRefrendos))}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F1ECF9]">
              <h3 className="font-display text-sm font-bold text-[#1F172B]">
                Movimientos de refrendos capturados (
                {scopedRegistros.filter((r) => r.tipo === 'Refrendo').length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#F1ECF9] bg-[#FAF8FC] text-[12px] font-semibold text-[#6E5F87]">
                    <th className="py-3 px-4">Fecha / Sucursal</th>
                    <th className="py-3 px-4">Concepto</th>
                    <th className="py-3 px-4 text-right">Cantidad</th>
                    <th className="py-3 px-4 text-right">Monto ($)</th>
                    {isCreador && (
                      <th className="py-3 px-4 text-right">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EEF9] text-sm">
                  {scopedRegistros
                    .filter((r) => r.tipo === 'Refrendo')
                    .map((r) => (
                      <tr key={r.id} className="hover:bg-[#FCFAFE]">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#1F172B]">
                            {r.sucursal_nombre}
                          </div>
                          <div className="text-xs text-[#8B7CA5] font-mono-num">
                            {r.fecha} · {r.responsable}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1F172B]">
                            {r.concepto}
                          </div>
                          <div className="text-xs text-[#8B7CA5]">
                            {r.notas || r.categoria}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-semibold text-[#5B21B6]">
                          {r.cantidad_refrendos}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-bold text-[#1F172B]">
                          {formatMXN(r.monto_real, 2)}
                        </td>
                        {isCreador && (
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                            {onUpdateRegistro && (
                              <button
                                type="button"
                                onClick={() => openEditModal(r)}
                                title="Editar monto o datos"
                                aria-label="Editar refrendo"
                                className="p-1.5 rounded-lg text-[#5B21B6] hover:bg-[#F3ECFC]"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  mode: 'record',
                                  registro: r,
                                })
                              }
                              title="Eliminar registro de refrendo"
                              aria-label="Eliminar refrendo"
                              className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'bitacora' && (
        <section className="bg-white rounded-2xl border border-[#EAE3F5] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F1ECF9]">
            <h2 className="font-display text-sm font-bold text-[#1F172B]">
              Movimientos registrados (tabla gastos_y_refrendos)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F1ECF9] bg-[#FAF8FC] text-[12px] font-semibold text-[#6E5F87]">
                  <th className="py-3 px-4">Fecha / Sucursal</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Concepto</th>
                  <th className="py-3 px-4 text-right">Monto Real</th>
                  <th className="py-3 px-4 text-right">Techo / Meta</th>
                  <th className="py-3 px-4">Evidencia</th>
                  <th className="py-3 px-4">Notas</th>
                  {isCreador && (
                    <th className="py-3 px-4 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3EEF9] text-sm">
                {scopedRegistros.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FCFAFE]">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#1F172B]">
                        {r.sucursal_nombre}
                      </div>
                      <div className="text-xs text-[#8B7CA5] font-mono-num">
                        {r.fecha} · {r.responsable}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          r.tipo === 'Gasto'
                            ? 'text-[#6D28D9]'
                            : 'text-[#BE185D]'
                        }`}
                      >
                        {r.tipo}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#1F172B]">
                        {r.concepto}
                      </div>
                      <div className="text-xs text-[#8B7CA5]">{r.categoria}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-bold text-[#1F172B]">
                      {formatMXN(r.monto_real, 2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-xs text-[#6E5F87]">
                      {r.tipo === 'Gasto'
                        ? `Techo ${formatCurrencyClean(r.presupuesto_limite)}`
                        : `${r.cantidad_refrendos}/${formatCurrencyClean(r.meta_refrendos)}`}
                    </td>
                    <td className="py-3 px-4">
                      {r.evidencia_url ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewReceipt({
                                url: r.evidencia_url!,
                                title: `${r.sucursal_nombre} — ${r.concepto}`,
                              })
                            }
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B21B6] hover:text-[#DB2777] whitespace-nowrap"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            Ver foto
                          </button>
                          {isCreador && (
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  mode: 'photo',
                                  registro: r,
                                })
                              }
                              className="text-[11px] font-medium text-[#BE123C] hover:underline whitespace-nowrap"
                            >
                              Borrar foto
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[#9D8FB5]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#55476E] max-w-xs truncate">
                      {r.notas || '—'}
                    </td>
                    {isCreador && (
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                        {onUpdateRegistro && (
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            title="Editar registro"
                            aria-label="Editar registro"
                            className="p-1.5 rounded-lg text-[#5B21B6] hover:bg-[#F3ECFC]"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              mode: 'record',
                              registro: r,
                            })
                          }
                          title="Eliminar registro"
                          aria-label="Eliminar registro"
                          className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal: Register Gasto or Refrendo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E6DDF5] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1ECF9]">
              <h3 className="font-display text-base font-bold text-[#1F172B]">
                {editingRegistro
                  ? 'Editar monto / registro en gastos_y_refrendos'
                  : 'Registrar movimiento en gastos_y_refrendos'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className={`grid gap-3 ${isCreador ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Tipo de movimiento
                  </label>
                  <select
                    value={form.tipo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tipo: e.target.value as 'Gasto' | 'Refrendo',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-medium"
                  >
                    <option value="Gasto">Gasto operativo</option>
                    <option value="Refrendo">Refrendo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Sucursal
                  </label>
                  <select
                    disabled={userRole === 'cajera'}
                    value={
                      userRole === 'cajera'
                        ? selectedSucursalId
                        : form.sucursal_id
                    }
                    onChange={(e) =>
                      setForm({ ...form, sucursal_id: e.target.value })
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

                {isCreador && (
                  <div>
                    <label className="block text-xs font-medium text-[#55476E] mb-1">
                      Fecha (MX)
                    </label>
                    <input
                      type="date"
                      required
                      value={form.fecha}
                      onChange={(e) =>
                        setForm({ ...form, fecha: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Concepto *
                </label>
                <input
                  type="text"
                  required
                  value={form.concepto}
                  onChange={(e) =>
                    setForm({ ...form, concepto: e.target.value })
                  }
                  placeholder={
                    form.tipo === 'Gasto'
                      ? 'Ej. Compra de papelería y tóner'
                      : 'Ej. Corte de refrendos vespertino'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Monto real ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="Ej. 1808484.55"
                    value={form.monto_real}
                    onChange={(e) =>
                      setForm({ ...form, monto_real: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                  />
                </div>

                {form.tipo === 'Gasto' ? (
                  <div>
                    <label className="block text-xs font-medium text-[#55476E] mb-1">
                      Techo máximo autorizado ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="Ej. 294878.63"
                      value={form.presupuesto_limite}
                      onChange={(e) =>
                        setForm({ ...form, presupuesto_limite: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-[#55476E] mb-1">
                      Cantidad de refrendos
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={form.cantidad_refrendos}
                      onChange={(e) =>
                        setForm({ ...form, cantidad_refrendos: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Comprobante / ticket (opcional · bucket evidencias_controlops)
                </label>
                <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#C4B5FD] bg-[#FAF7FE] hover:bg-[#F3ECFC] cursor-pointer text-xs font-medium text-[#5B21B6]">
                  <Upload className="h-4 w-4" />
                  <span>
                    {receiptFile
                      ? receiptFile.name
                      : 'Adjuntar foto de recibo o ticket'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      setReceiptFile(e.target.files?.[0] || null)
                    }
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Notas
                </label>
                <input
                  type="text"
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Observaciones adicionales..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                />
              </div>

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
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Receipt Lightbox */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/65 backdrop-blur-[2px]"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            className="max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#E6DDF5]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F1ECF9]">
              <p className="text-sm font-semibold text-[#1F172B] truncate">
                {previewReceipt.title}
              </p>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 bg-[#FAF8FC] flex items-center justify-center">
              <img
                src={previewReceipt.url}
                alt={previewReceipt.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal (Creador only) */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="¿Seguro que deseas eliminar este registro?"
        detail={
          deleteTarget?.mode === 'photo'
            ? `Se eliminará la fotografía de comprobante de "${deleteTarget.registro.concepto}" del bucket evidencias_controlops.`
            : deleteTarget
              ? `Se eliminará el ${deleteTarget.registro.tipo.toLowerCase()} "${deleteTarget.registro.concepto}" (${deleteTarget.registro.sucursal_nombre}) y su archivo adjunto si existe.`
              : undefined
        }
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            if (deleteTarget.mode === 'photo') {
              await onDeleteEvidenciaRegistro(deleteTarget.registro);
            } else {
              await onDeleteRegistro(deleteTarget.registro);
            }
            setDeleteTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
