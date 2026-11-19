import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Image as ImageIcon,
  X,
  Upload,
} from 'lucide-react';
import {
  ActividadDiaria,
  DiaSemana,
  EstatusActividad,
  HorarioSucursalDia,
  RolUsuario,
  Sucursal,
  TareaCatalogo,
} from '../types/controlops';
import { DIAS_SEMANA } from '../data/mockData';
import { evaluarVencimientoActividad } from '../utils/calculations';
import { uploadEvidenciaFoto } from '../services/controlOpsService';

interface ActividadesViewProps {
  actividades: ActividadDiaria[];
  sucursales: Sucursal[];
  horarios: HorarioSucursalDia[];
  selectedSucursalId: string;
  diaActivo: DiaSemana;
  userRole: RolUsuario;
  tareasCatalogo: TareaCatalogo[];
  onChangeDiaActivo: (dia: DiaSemana) => void;
  onUpdateActividad: (updated: ActividadDiaria) => Promise<void>;
  onCreateActividad: (nueva: ActividadDiaria) => Promise<void>;
  onGoToHorarios: () => void;
  openCreateModalExternal?: boolean;
  onCloseCreateModalExternal?: () => void;
}

export const ActividadesView: React.FC<ActividadesViewProps> = ({
  actividades,
  sucursales,
  horarios,
  selectedSucursalId,
  diaActivo,
  userRole,
  tareasCatalogo,
  onChangeDiaActivo,
  onUpdateActividad,
  onCreateActividad,
  onGoToHorarios,
  openCreateModalExternal = false,
  onCloseCreateModalExternal,
}) => {
  const [filterEstatus, setFilterEstatus] = useState<string>('todas');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetActivityRef = useRef<ActividadDiaria | null>(null);

  const defaultSucursal =
    selectedSucursalId === 'todas'
      ? sucursales[0]?.id || 'suc-centro'
      : selectedSucursalId;

  const [newForm, setNewForm] = useState({
    sucursal_id: defaultSucursal,
    titulo: '',
    categoria: 'Caja' as ActividadDiaria['categoria'],
    observaciones: '',
    estatus: 'Completada' as EstatusActividad,
  });
  const [newFile, setNewFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const isModalOpen = showNewModal || openCreateModalExternal;
  const closeModal = () => {
    setShowNewModal(false);
    onCloseCreateModalExternal?.();
  };

  const scopedActividades = useMemo(() => {
    return actividades.filter((a) => {
      if (selectedSucursalId !== 'todas' && a.sucursal_id !== selectedSucursalId) {
        return false;
      }
      if (filterEstatus !== 'todas' && a.estatus !== filterEstatus) {
        return false;
      }
      return true;
    });
  }, [actividades, selectedSucursalId, filterEstatus]);

  const stats = useMemo(() => {
    const base =
      selectedSucursalId === 'todas'
        ? actividades
        : actividades.filter((a) => a.sucursal_id === selectedSucursalId);

    const completadas = base.filter((a) => a.estatus === 'Completada').length;
    const pendientes = base.filter((a) => a.estatus === 'Pendiente').length;
    const vencidas = base.filter((a) => {
      const h = horarios.find(
        (hor) => hor.sucursal_id === a.sucursal_id && hor.dia === diaActivo
      );
      return evaluarVencimientoActividad(a, h).vencidaPorHora;
    }).length;
    const conEvidencia = base.filter((a) => Boolean(a.evidencia_url)).length;

    return {
      total: base.length,
      completadas,
      pendientes,
      vencidas,
      conEvidencia,
    };
  }, [actividades, selectedSucursalId, horarios, diaActivo]);

  const activeHorarioBanner = useMemo(() => {
    if (selectedSucursalId === 'todas') {
      const sinLimiteCount = horarios.filter(
        (h) => h.dia === diaActivo && h.sin_horario_limite
      ).length;
      return {
        mode: 'todas' as const,
        sinLimiteCount,
      };
    }
    const h = horarios.find(
      (hor) => hor.sucursal_id === selectedSucursalId && hor.dia === diaActivo
    );
    return {
      mode: 'single' as const,
      horario: h,
    };
  }, [horarios, selectedSucursalId, diaActivo]);

  const triggerPhotoUpload = (actividad: ActividadDiaria) => {
    targetActivityRef.current = actividad;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = targetActivityRef.current;
    e.target.value = '';
    if (!file || !target) return;

    setUploadingId(target.id);
    setUploadNotice(null);
    try {
      const res = await uploadEvidenciaFoto(
        file,
        'actividades',
        target.sucursal_id
      );
      const nowTime = new Date().toTimeString().slice(0, 5);
      await onUpdateActividad({
        ...target,
        evidencia_url: res.url,
        estatus: 'Completada',
        hora_completada: target.hora_completada || nowTime,
      });
      setUploadNotice(
        res.uploadedToSupabase
          ? 'Fotografía subida correctamente al bucket evidencias_controlops.'
          : res.error ||
              'Fotografía adjuntada en vista local (conecta Supabase para guardarla en evidencias_controlops).'
      );
    } finally {
      setUploadingId(null);
      targetActivityRef.current = null;
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.titulo.trim()) return;
    setCreating(true);
    try {
      const targetSucId =
        userRole === 'cajera' ? selectedSucursalId : newForm.sucursal_id;
      const suc =
        sucursales.find((s) => s.id === targetSucId) || sucursales[0];
      let evidenciaUrl: string | null = null;
      if (newFile) {
        const res = await uploadEvidenciaFoto(newFile, 'actividades', suc.id);
        evidenciaUrl = res.url;
      }

      const nowTime = new Date().toTimeString().slice(0, 5);
      const nueva: ActividadDiaria = {
        id: `act-${Date.now()}`,
        sucursal_id: suc.id,
        sucursal_nombre: suc.nombre,
        titulo: newForm.titulo.trim(),
        categoria: newForm.categoria,
        responsable: suc.responsable_caja,
        fecha: new Date().toISOString().slice(0, 10),
        hora_completada: newForm.estatus === 'Completada' ? nowTime : null,
        estatus: newForm.estatus,
        evidencia_url: evidenciaUrl,
        observaciones: newForm.observaciones.trim(),
      };
      await onCreateActividad(nueva);
      setNewForm({
        sucursal_id: defaultSucursal,
        titulo: '',
        categoria: 'Caja',
        observaciones: '',
        estatus: 'Completada',
      });
      setNewFile(null);
      closeModal();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden shared file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Schedule Rule Strip */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold text-[#1F172B]">
              Control de actividades diarias y evidencias
            </h2>
            <span className="text-xs text-[#7A6B93]">·</span>
            <select
              aria-label="Día evaluado"
              value={diaActivo}
              onChange={(e) => onChangeDiaActivo(e.target.value as DiaSemana)}
              className="px-2.5 py-1 rounded-lg border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#5B21B6]"
            >
              {DIAS_SEMANA.map((d) => (
                <option key={d.key} value={d.key}>
                  Regla de {d.label}
                </option>
              ))}
            </select>
          </div>

          {activeHorarioBanner.mode === 'single' ? (
            <p className="text-xs text-[#6E5F87]">
              {activeHorarioBanner.horario?.sin_horario_limite ? (
                <span className="font-semibold text-[#6D28D9]">
                  Sin horario límite activado para este día: no se marcan
                  vencimientos por hora.
                </span>
              ) : (
                <>
                  Límite actividades:{' '}
                  <span className="font-mono-num font-semibold text-[#1F172B]">
                    {activeHorarioBanner.horario?.hora_limite_actividad || '09:00'}
                  </span>{' '}
                  · Límite corte:{' '}
                  <span className="font-mono-num font-semibold text-[#1F172B]">
                    {activeHorarioBanner.horario?.hora_limite_corte || '18:30'}
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="text-xs text-[#6E5F87]">
              Evaluando vencimientos por hora según configuración de cada
              sucursal ({activeHorarioBanner.sinLimiteCount} sucursal(es) sin
              horario límite este día).
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onGoToHorarios}
            className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#FAF7FE] hover:bg-[#F3ECFC] text-[#5B21B6] border border-[#E6DDF5] transition-colors whitespace-nowrap"
          >
            Ajustar horarios límite
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Nueva actividad
          </button>
        </div>
      </section>

      {uploadNotice && (
        <div className="rounded-xl px-4 py-3 bg-[#FAF5FF] border border-[#DDD6FE] text-xs font-medium text-[#5B21B6] flex items-center justify-between">
          <span>{uploadNotice}</span>
          <button
            type="button"
            onClick={() => setUploadNotice(null)}
            className="text-[#7C3AED] hover:underline ml-3"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
          <p className="text-xs text-[#7A6B93]">Completadas</p>
          <p className="font-display text-2xl font-bold text-[#15803D] mt-1 tabular-nums">
            {stats.completadas}
            <span className="text-sm font-normal text-[#8B7CA5]">
              /{stats.total}
            </span>
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
          <p className="text-xs text-[#7A6B93]">Pendientes</p>
          <p className="font-display text-2xl font-bold text-[#B45309] mt-1 tabular-nums">
            {stats.pendientes}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
          <p className="text-xs text-[#7A6B93]">Vencidas por horario</p>
          <p
            className={`font-display text-2xl font-bold mt-1 tabular-nums ${
              stats.vencidas > 0 ? 'text-[#BE123C]' : 'text-[#1F172B]'
            }`}
          >
            {stats.vencidas}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-4">
          <p className="text-xs text-[#7A6B93]">Con evidencia fotográfica</p>
          <p className="font-display text-2xl font-bold text-[#6D28D9] mt-1 tabular-nums">
            {stats.conEvidencia}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-white border border-[#EAE3F5] rounded-xl">
          {(['todas', 'Pendiente', 'Completada', 'Observada'] as const).map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterEstatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  filterEstatus === st
                    ? 'bg-[#F3ECFC] text-[#5B21B6]'
                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                }`}
              >
                {st === 'todas' ? 'Todas' : st}
              </button>
            )
          )}
        </div>
        <span className="text-xs text-[#7A6B93]">
          Bucket de almacenamiento: <code className="font-mono">evidencias_controlops</code>
        </span>
      </div>

      {/* Activities List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scopedActividades.map((act) => {
          const horarioSuc = horarios.find(
            (h) => h.sucursal_id === act.sucursal_id && h.dia === diaActivo
          );
          const evalHorario = evaluarVencimientoActividad(act, horarioSuc);
          const isUploading = uploadingId === act.id;

          return (
            <article
              key={act.id}
              className="bg-white rounded-2xl border border-[#EAE3F5] p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-[#7A6B93]">
                      {act.sucursal_nombre} · {act.categoria} ·{' '}
                      {act.responsable}
                    </div>
                    <h3 className="font-display text-sm font-bold text-[#1F172B] mt-1">
                      {act.titulo}
                    </h3>
                  </div>

                  <select
                    aria-label="Estatus de actividad"
                    value={act.estatus}
                    onChange={(e) => {
                      const nextStatus = e.target.value as EstatusActividad;
                      onUpdateActividad({
                        ...act,
                        estatus: nextStatus,
                        hora_completada:
                          nextStatus === 'Completada'
                            ? act.hora_completada ||
                              new Date().toTimeString().slice(0, 5)
                            : act.hora_completada,
                      });
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border focus:outline-none shrink-0 ${
                      act.estatus === 'Completada'
                        ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                        : act.estatus === 'Observada'
                          ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
                          : 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]'
                    }`}
                  >
                    <option value="Pendiente">Pendiente</option>
                    <option value="Completada">Completada</option>
                    <option value="Observada">Observada</option>
                  </select>
                </div>

                {/* Deadline evaluation */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {evalHorario.etiqueta === 'Sin horario límite' ? (
                    <span className="inline-flex items-center gap-1 text-[#6D28D9] font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      Sin horario límite hoy
                    </span>
                  ) : evalHorario.etiqueta === 'Vencida' ? (
                    <span className="inline-flex items-center gap-1 text-[#BE123C] font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Vencida (límite {evalHorario.horaLimite})
                    </span>
                  ) : evalHorario.etiqueta === 'Completada con retraso' ? (
                    <span className="inline-flex items-center gap-1 text-[#B45309] font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      Completada {act.hora_completada} (límite{' '}
                      {evalHorario.horaLimite})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#15803D] font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {act.hora_completada
                        ? `Completada ${act.hora_completada} · Límite ${evalHorario.horaLimite}`
                        : `En tiempo · Límite ${evalHorario.horaLimite}`}
                    </span>
                  )}
                </div>

                {act.observaciones && (
                  <p className="text-xs text-[#55476E] bg-[#FAF8FC] rounded-xl px-3 py-2 border border-[#F1ECF9]">
                    {act.observaciones}
                  </p>
                )}
              </div>

              {/* Evidence Photo Footer */}
              <div className="pt-3 border-t border-[#F1ECF9] flex items-center justify-between gap-3">
                {act.evidencia_url ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewImage({
                        url: act.evidencia_url!,
                        title: `${act.sucursal_nombre} — ${act.titulo}`,
                      })
                    }
                    className="inline-flex items-center gap-2 text-xs font-semibold text-[#5B21B6] hover:text-[#DB2777] transition-colors"
                  >
                    <img
                      src={act.evidencia_url}
                      alt={`Evidencia de ${act.titulo}`}
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 rounded-lg object-cover border border-[#E6DDF5]"
                    />
                    <span>Ver fotografía adjunta</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#8B7CA5]">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Sin fotografía adjunta
                  </span>
                )}

                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => triggerPhotoUpload(act)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#FDF2F8] hover:bg-[#FCE7F3] text-[#BE185D] border border-[#FBCFE8] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {isUploading
                    ? 'Subiendo...'
                    : act.evidencia_url
                      ? 'Reemplazar foto'
                      : 'Subir evidencia'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Preview Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/65 backdrop-blur-[2px]"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#E6DDF5]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F1ECF9]">
              <p className="text-sm font-semibold text-[#1F172B] truncate">
                {previewImage.title}
              </p>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 bg-[#FAF8FC] flex items-center justify-center">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Activity + Photo Evidence */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E6DDF5] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1ECF9]">
              <h3 className="font-display text-base font-bold text-[#1F172B]">
                Registrar actividad con evidencia
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
                    Categoría
                  </label>
                  <select
                    value={newForm.categoria}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        categoria: e.target
                          .value as ActividadDiaria['categoria'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                  >
                    <option value="Caja">Caja</option>
                    <option value="Corte">Corte</option>
                    <option value="Expedientes">Expedientes</option>
                    <option value="Auditoría">Auditoría</option>
                  </select>
                </div>
              </div>

              {tareasCatalogo.filter((t) => t.activa).length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Elegir del catálogo de tareas obligatorias (opcional)
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const found = tareasCatalogo.find(
                        (t) => t.id === e.target.value
                      );
                      if (found) {
                        setNewForm({
                          ...newForm,
                          titulo: found.titulo,
                          categoria: found.categoria,
                        });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs"
                  >
                    <option value="">
                      -- Seleccionar tarea del catálogo --
                    </option>
                    {tareasCatalogo
                      .filter((t) => t.activa)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          [{t.categoria}] {t.titulo}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Descripción de la actividad *
                </label>
                <input
                  type="text"
                  required
                  value={newForm.titulo}
                  onChange={(e) =>
                    setNewForm({ ...newForm, titulo: e.target.value })
                  }
                  placeholder="Ej. Envío de corte vespertino y ticket de terminal"
                  className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Observaciones de caja
                </label>
                <input
                  type="text"
                  value={newForm.observaciones}
                  onChange={(e) =>
                    setNewForm({ ...newForm, observaciones: e.target.value })
                  }
                  placeholder="Notas adicionales..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Fotografía de evidencia (bucket evidencias_controlops)
                </label>
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#C4B5FD] bg-[#FAF7FE] hover:bg-[#F3ECFC] cursor-pointer text-xs font-medium text-[#5B21B6]">
                  <Upload className="h-4 w-4" />
                  <span>
                    {newFile
                      ? newFile.name
                      : 'Seleccionar fotografía (JPG, PNG, WEBP)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                  />
                </label>
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
                  disabled={creating}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
                >
                  {creating ? 'Guardando...' : 'Guardar actividad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
