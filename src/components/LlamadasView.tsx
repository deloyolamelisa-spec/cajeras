import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import {
  EstatusAuditoriaLlamada,
  EstatusVencimiento,
  LlamadaSucursal,
  ReporteCajeraOpcion,
  RolUsuario,
  Sucursal,
} from '../types/controlops';
import { formatMXN, sanitizePhoneForWhatsApp } from '../utils/calculations';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface LlamadasViewProps {
  llamadas: LlamadaSucursal[];
  sucursales: Sucursal[];
  selectedSucursalId: string;
  userRole: RolUsuario;
  opcionesReporte: string[];
  onUpdateLlamada: (updated: LlamadaSucursal) => Promise<void>;
  onCreateLlamada: (nueva: LlamadaSucursal) => Promise<void>;
  onDeleteLlamada: (id: string) => Promise<void>;
  openCreateModalExternal?: boolean;
  onCloseCreateModalExternal?: () => void;
}

export const LlamadasView: React.FC<LlamadasViewProps> = ({
  llamadas,
  sucursales,
  selectedSucursalId,
  userRole,
  opcionesReporte,
  onUpdateLlamada,
  onCreateLlamada,
  onDeleteLlamada,
  openCreateModalExternal = false,
  onCloseCreateModalExternal,
}) => {
  const isCajera = userRole === 'cajera';
  const isCreador = userRole === 'creador';
  const canAudit = userRole === 'supervisor' || userRole === 'creador';
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
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LlamadaSucursal | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

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

  const scopedLlamadas = useMemo(() => {
    if (selectedSucursalId === 'todas') return llamadas;
    return llamadas.filter((l) => l.sucursal_id === selectedSucursalId);
  }, [llamadas, selectedSucursalId]);

  const metrics = useMemo(() => {
    const registradas = scopedLlamadas.filter((l) => l.llamada_registrada).length;
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

    const pct = Math.min(100, (registradas / metaDiaria) * 100);
    return {
      registradas,
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
          item.cliente_nombre.toLowerCase().includes(q) ||
          item.contrato.toLowerCase().includes(q) ||
          item.telefono.toLowerCase().includes(q);
        if (!matchText) return false;
      }

      if (filterAuditoria !== 'todos') {
        if (filterAuditoria === 'pendiente_marcar') {
          if (item.llamada_registrada) return false;
        } else if (item.estatus_auditoria !== filterAuditoria) {
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
      cliente_nombre: newForm.cliente_nombre.trim(),
      contrato:
        newForm.contrato.trim() ||
        `${suc.codigo.split('-')[0]}-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      telefono: newForm.telefono.replace(/\D/g, ''),
      monto_prestamo: Number(newForm.monto_prestamo) || 0,
      estatus_vencimiento: newForm.estatus_vencimiento,
      fecha_vencimiento: new Date().toISOString().slice(0, 10),
      reporte_cajera: newForm.reporte_cajera,
      estatus_auditoria: 'Sin auditar',
      observaciones_admin: newForm.observaciones_admin.trim(),
      cajera_nombre: suc.responsable_caja,
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

          {isCajera ? (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Registrar llamada
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#FAF7FE] text-[#6D28D9] border border-[#EAE3F5] shrink-0">
              {isCreador ? 'Modo Control y Auditoría' : 'Modo Auditoría'}
            </span>
          )}
        </div>
      </section>

      {/* 4 Metric Cards */}
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

      {/* Search & Multi-Filters */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-4 md:p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
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

              return (
                <div
                  key={item.id}
                  className="p-4 md:p-5 hover:bg-[#FCFAFE] transition-colors grid grid-cols-1 xl:grid-cols-12 gap-4 items-start"
                >
                  {/* Client Info */}
                  <div className="xl:col-span-3 space-y-1">
                    <div className="font-semibold text-sm text-[#1F172B]">
                      {item.cliente_nombre}
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
                      {formatMXN(item.monto_prestamo)}
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

                  {/* Quick Call & WhatsApp Actions (Cajera) or Contact Info (Audit) */}
                  <div className="xl:col-span-2 flex flex-wrap items-center gap-2">
                    {isCajera ? (
                      <>
                        <a
                          href={`tel:${item.telefono}`}
                          onClick={() => {
                            if (!item.llamada_registrada) {
                              onUpdateLlamada({
                                ...item,
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
                              onUpdateLlamada({
                                ...item,
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
                  <div className="xl:col-span-2">
                    <label className="block text-[11px] font-medium text-[#7A6B93] mb-1">
                      Reporte de cajera
                    </label>
                    {isCajera ? (
                      <select
                        value={item.reporte_cajera}
                        onChange={(e) =>
                          onUpdateLlamada({
                            ...item,
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

                  {/* Admin Audit & Observations */}
                  <div className="xl:col-span-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[#7A6B93]">
                        Auditoría administración
                      </span>
                      {canAudit ? (
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
                      ) : (
                        <span
                          className={`text-[11px] font-semibold ${
                            item.estatus_auditoria === 'Verificada'
                              ? 'text-[#15803D]'
                              : item.estatus_auditoria === 'Falsa'
                                ? 'text-[#BE123C]'
                                : 'text-[#B45309]'
                          }`}
                        >
                          {item.estatus_auditoria}
                        </span>
                      )}
                    </div>

                    {canAudit ? (
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
                        {isCreador && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            title="Eliminar registro de llamada"
                            aria-label="Eliminar llamada"
                            className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2] border border-transparent hover:border-[#FECDD3] transition-colors shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#6E5F87] bg-[#FAF8FC] rounded-lg px-3 py-1.5 border border-[#F1ECF9]">
                        {item.observaciones_admin || 'Sin observaciones de supervisión'}
                      </p>
                    )}
                  </div>
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
