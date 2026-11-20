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
  Trash2,
  Pencil,
  RotateCcw,
  Save,
  Maximize2,
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
import {
  evaluarVencimientoActividad,
  extractCatalogTaskId,
  getTodayLocalYYYYMMDD,
  resolveDailyTasksForBranch,
} from '../utils/calculations';
import { ServiceResult, uploadEvidenciaFoto } from '../services/controlOpsService';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface ActividadesViewProps {
  actividades: ActividadDiaria[];
  sucursales: Sucursal[];
  horarios: HorarioSucursalDia[];
  selectedSucursalId: string;
  diaActivo: DiaSemana;
  userRole: RolUsuario;
  tareasCatalogo: TareaCatalogo[];
  onChangeDiaActivo: (dia: DiaSemana) => void;
  onSelectSucursal?: (id: string) => void;
  onUpdateActividad: (updated: ActividadDiaria) => Promise<unknown>;
  onCreateActividad: (nueva: ActividadDiaria) => Promise<unknown>;
  onCreateActividadesBatch: (nuevas: ActividadDiaria[]) => Promise<unknown>;
  onDeleteActividad: (actividad: ActividadDiaria) => Promise<unknown>;
  onSaveCatalogTask?: (
    tarea: TareaCatalogo,
    isNew?: boolean
  ) => Promise<ServiceResult>;
  onDeleteCatalogTask?: (taskId: string) => Promise<ServiceResult>;
  onDeleteEvidenciaActividad: (actividad: ActividadDiaria) => Promise<void>;
  onResetActividadPendiente: (actividad: ActividadDiaria) => Promise<void>;
  onGoToHorarios: () => void;
  openCreateModalExternal?: boolean;
  onCloseCreateModalExternal?: () => void;
}

const ALL_DIAS: DiaSemana[] = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
];

const DIA_SHORT: Record<DiaSemana, string> = {
  lunes: 'Lun',
  martes: 'Mar',
  miercoles: 'Mié',
  jueves: 'Jue',
  viernes: 'Vie',
  sabado: 'Sáb',
  domingo: 'Dom',
};

export const ActividadesView: React.FC<ActividadesViewProps> = ({
  actividades,
  sucursales,
  horarios,
  selectedSucursalId,
  diaActivo,
  userRole,
  tareasCatalogo,
  onChangeDiaActivo,
  onSelectSucursal,
  onUpdateActividad,
  onCreateActividad,
  onCreateActividadesBatch,
  onDeleteActividad,
  onSaveCatalogTask,
  onDeleteCatalogTask,
  onDeleteEvidenciaActividad,
  onResetActividadPendiente,
  onGoToHorarios,
  openCreateModalExternal = false,
  onCloseCreateModalExternal,
}) => {
  const isCajera = userRole === 'cajera';
  const isCreador = userRole === 'creador';
  const isSupervisor = userRole === 'supervisor';
  const isAuditor = isCreador || isSupervisor;

  const [filterEstatus, setFilterEstatus] = useState<string>('todas');
  const [filterFecha, setFilterFecha] = useState<string>('');
  const [draftObs, setDraftObs] = useState<Record<string, string>>({});
  const [savedObsId, setSavedObsId] = useState<string | null>(null);
  const [inlineTimeDrafts, setInlineTimeDrafts] = useState<
    Record<string, { hora_limite: string; sin_horario_limite: boolean }>
  >({});
  const [savedTimeId, setSavedTimeId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Cashier create modal state
  const [showCashierModal, setShowCashierModal] = useState(false);

  // Creador create/edit assignment modal state
  const [showCreadorModal, setShowCreadorModal] = useState(false);
  const [editingActividad, setEditingActividad] =
    useState<ActividadDiaria | null>(null);

  // Confirm delete/reset modal state
  const [confirmAction, setConfirmAction] = useState<{
    mode: 'delete_activity' | 'delete_photo' | 'reset_pending';
    actividad: ActividadDiaria;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetActivityRef = useRef<ActividadDiaria | null>(null);

  const defaultSucursal =
    selectedSucursalId === 'todas'
      ? sucursales.find((s) => s.activa)?.id || sucursales[0]?.id || 'suc-centro'
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

  const [creadorForm, setCreadorForm] = useState({
    sucursal_id: 'todas' as string,
    titulo: '',
    descripcion: '',
    categoria: 'Caja' as ActividadDiaria['categoria'],
    dias_semana: [...ALL_DIAS] as DiaSemana[],
    hora_limite: '09:30',
    sin_horario_limite: false,
  });
  const [savingCreador, setSavingCreador] = useState(false);

  const isCashierModalOpen =
    isCajera && (showCashierModal || openCreateModalExternal);
  const closeCashierModal = () => {
    setShowCashierModal(false);
    onCloseCreateModalExternal?.();
  };

  const openCreateCreadorModal = () => {
    setEditingActividad(null);
    setCreadorForm({
      sucursal_id: selectedSucursalId === 'todas' ? 'todas' : selectedSucursalId,
      titulo: '',
      descripcion: '',
      categoria: 'Caja',
      dias_semana: [...ALL_DIAS],
      hora_limite: '09:30',
      sin_horario_limite: false,
    });
    setShowCreadorModal(true);
  };

  const openEditCreadorModal = (act: ActividadDiaria) => {
    const catId = extractCatalogTaskId(act.id);
    const catalogTask = catId
      ? tareasCatalogo.find((t) => t.id === catId)
      : undefined;

    setEditingActividad(act);
    setCreadorForm({
      sucursal_id: catalogTask?.sucursal_id || act.sucursal_id,
      titulo: catalogTask?.titulo || act.titulo,
      descripcion:
        catalogTask?.descripcion ?? act.descripcion ?? act.observaciones ?? '',
      categoria: catalogTask?.categoria || act.categoria,
      dias_semana:
        catalogTask?.dias_semana && catalogTask.dias_semana.length > 0
          ? catalogTask.dias_semana
          : act.dias_semana && act.dias_semana.length > 0
            ? act.dias_semana
            : [...ALL_DIAS],
      hora_limite:
        catalogTask?.hora_limite ?? act.hora_limite ?? '09:30',
      sin_horario_limite:
        catalogTask?.sin_horario_limite !== undefined
          ? Boolean(catalogTask.sin_horario_limite)
          : Boolean(act.sin_horario_limite),
    });
    setShowCreadorModal(true);
  };

  const evaluatedDate = filterFecha || getTodayLocalYYYYMMDD();

  const dayScopedActividades = useMemo(() => {
    const targetBranches =
      selectedSucursalId === 'todas'
        ? sucursales.filter((s) => s.activa)
        : sucursales.filter((s) => s.id === selectedSucursalId);

    if (tareasCatalogo.length > 0) {
      return targetBranches.flatMap((suc) =>
        resolveDailyTasksForBranch(
          suc,
          tareasCatalogo,
          actividades,
          diaActivo,
          evaluatedDate
        )
      );
    }

    return actividades.filter((a) => {
      if (selectedSucursalId !== 'todas' && a.sucursal_id !== selectedSucursalId) {
        return false;
      }
      if (filterFecha && a.fecha !== filterFecha) {
        return false;
      }
      if (a.dias_semana && a.dias_semana.length > 0) {
        return a.dias_semana.includes(diaActivo);
      }
      return true;
    });
  }, [
    actividades,
    sucursales,
    tareasCatalogo,
    selectedSucursalId,
    filterFecha,
    diaActivo,
    evaluatedDate,
  ]);

  const scopedActividades = useMemo(() => {
    return dayScopedActividades.filter((a) => {
      if (filterEstatus === 'todas') return true;
      if (filterEstatus === 'fuera_horario') {
        const h = horarios.find(
          (hor) => hor.sucursal_id === a.sucursal_id && hor.dia === diaActivo
        );
        const ev = evaluarVencimientoActividad(a, h);
        return (
          ev.etiqueta === 'Vencida' || ev.etiqueta === 'Completada con retraso'
        );
      }
      return a.estatus === filterEstatus;
    });
  }, [dayScopedActividades, filterEstatus, horarios, diaActivo]);

  const stats = useMemo(() => {
    const base = dayScopedActividades;
    const completadas = base.filter((a) => a.estatus === 'Completada').length;
    const pendientes = base.filter((a) => a.estatus === 'Pendiente').length;
    const vencidas = base.filter((a) => {
      const h = horarios.find(
        (hor) => hor.sucursal_id === a.sucursal_id && hor.dia === diaActivo
      );
      const ev = evaluarVencimientoActividad(a, h);
      return (
        ev.vencidaPorHora || ev.etiqueta === 'Completada con retraso'
      );
    }).length;
    const conEvidencia = base.filter((a) => Boolean(a.evidencia_url)).length;

    return {
      total: base.length,
      completadas,
      pendientes,
      vencidas,
      conEvidencia,
    };
  }, [dayScopedActividades, horarios, diaActivo]);

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
    if (!isCajera) return;
    targetActivityRef.current = actividad;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = targetActivityRef.current;
    e.target.value = '';
    if (!file || !target || !isCajera) return;

    setUploadingId(target.id);
    setUploadNotice(null);
    try {
      const res = await uploadEvidenciaFoto(
        file,
        'actividades',
        target.sucursal_id
      );
      if (!res.uploadedToSupabase || !res.url) {
        setUploadNotice(
          res.error ||
            'No se pudo subir la fotografía al bucket evidencias_controlops.'
        );
        return;
      }
      const nowTime = new Date().toTimeString().slice(0, 5);
      const saveRes = (await onUpdateActividad({
        ...target,
        evidencia_url: res.url,
        estatus: 'Completada',
        hora_completada: target.hora_completada || nowTime,
      })) as ServiceResult | undefined;
      if (saveRes && !saveRes.ok) {
        setUploadNotice(
          saveRes.error ||
            'La imagen subió a Storage, pero no se pudo guardar en actividades_diarias.'
        );
        return;
      }
      setUploadNotice(
        'Fotografía guardada correctamente en evidencias_controlops y actividades_diarias.'
      );
    } finally {
      setUploadingId(null);
      targetActivityRef.current = null;
    }
  };

  const handleCreateCashierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.titulo.trim() || !isCajera) return;
    setCreating(true);
    try {
      const targetSucId = selectedSucursalId;
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
      closeCashierModal();
    } finally {
      setCreating(false);
    }
  };

  const handleSaveCreadorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCreador || !creadorForm.titulo.trim()) return;
    setSavingCreador(true);
    try {
      const dias =
        creadorForm.dias_semana.length > 0
          ? creadorForm.dias_semana
          : [...ALL_DIAS];
      const horaLim = creadorForm.sin_horario_limite
        ? null
        : creadorForm.hora_limite || '09:30';

      if (editingActividad) {
        const catId = extractCatalogTaskId(editingActividad.id);
        const existingCatalog = catId
          ? tareasCatalogo.find((t) => t.id === catId)
          : undefined;

        if (existingCatalog && onSaveCatalogTask) {
          const updatedTask: TareaCatalogo = {
            ...existingCatalog,
            titulo: creadorForm.titulo.trim(),
            descripcion: creadorForm.descripcion.trim(),
            categoria: creadorForm.categoria,
            sucursal_id: creadorForm.sucursal_id,
            dias_semana: dias,
            hora_limite: horaLim,
            sin_horario_limite: creadorForm.sin_horario_limite,
          };
          const res = await onSaveCatalogTask(updatedTask, false);
          if (!res.ok) {
            setUploadNotice(res.error || 'Error al actualizar actividad.');
            return;
          }
          setUploadNotice(
            `Actividad "${updatedTask.titulo}" actualizada en catalogos_controlops.`
          );
        } else {
          const targetSuc =
            sucursales.find((s) => s.id === creadorForm.sucursal_id) ||
            sucursales[0];
          const updated: ActividadDiaria = {
            ...editingActividad,
            sucursal_id: targetSuc.id,
            sucursal_nombre: targetSuc.nombre,
            responsable: targetSuc.responsable_caja,
            titulo: creadorForm.titulo.trim(),
            descripcion: creadorForm.descripcion.trim(),
            categoria: creadorForm.categoria,
            dias_semana: dias,
            hora_limite: horaLim,
            sin_horario_limite: creadorForm.sin_horario_limite,
          };
          await onUpdateActividad(updated);
          setUploadNotice(`Actividad "${updated.titulo}" actualizada correctamente.`);
        }
      } else if (onSaveCatalogTask) {
        const newTask: TareaCatalogo = {
          id: `tar-${Date.now()}`,
          titulo: creadorForm.titulo.trim(),
          descripcion: creadorForm.descripcion.trim(),
          categoria: creadorForm.categoria,
          sucursal_id: creadorForm.sucursal_id,
          dias_semana: dias,
          hora_limite: horaLim,
          sin_horario_limite: creadorForm.sin_horario_limite,
          activa: true,
        };
        const res = await onSaveCatalogTask(newTask, true);
        if (!res.ok) {
          setUploadNotice(res.error || 'Error al guardar nueva actividad.');
          return;
        }
        setUploadNotice(
          `Actividad "${newTask.titulo}" creada en catalogos_controlops y visible de inmediato para las cajeras.`
        );
      } else {
        const targetBranches =
          creadorForm.sucursal_id === 'todas'
            ? sucursales.filter((s) => s.activa)
            : sucursales.filter((s) => s.id === creadorForm.sucursal_id);

        const today = getTodayLocalYYYYMMDD();
        const batch: ActividadDiaria[] = targetBranches.map((suc, idx) => ({
          id: `act-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          sucursal_id: suc.id,
          sucursal_nombre: suc.nombre,
          titulo: creadorForm.titulo.trim(),
          descripcion: creadorForm.descripcion.trim(),
          categoria: creadorForm.categoria,
          responsable: suc.responsable_caja,
          fecha: today,
          hora_completada: null,
          estatus: 'Pendiente',
          evidencia_url: null,
          observaciones: '',
          dias_semana: dias,
          hora_limite: horaLim,
          sin_horario_limite: creadorForm.sin_horario_limite,
        }));

        await onCreateActividadesBatch(batch);
        setUploadNotice(
          `Actividad "${creadorForm.titulo.trim()}" asignada a ${batch.length} sucursal(es).`
        );
      }
      setShowCreadorModal(false);
      setEditingActividad(null);
    } finally {
      setSavingCreador(false);
    }
  };

  const toggleDiaCreador = (dia: DiaSemana) => {
    setCreadorForm((prev) => {
      const exists = prev.dias_semana.includes(dia);
      return {
        ...prev,
        dias_semana: exists
          ? prev.dias_semana.filter((d) => d !== dia)
          : [...prev.dias_semana, dia],
      };
    });
  };

  const handleSaveInlineObs = async (act: ActividadDiaria) => {
    const nextObs =
      draftObs[act.id] !== undefined ? draftObs[act.id] : act.observaciones;
    await onUpdateActividad({
      ...act,
      observaciones: nextObs,
    });
    setSavedObsId(act.id);
    setTimeout(() => setSavedObsId(null), 1600);
  };

  const handleSaveInlineDeadline = async (act: ActividadDiaria) => {
    const draft = inlineTimeDrafts[act.id];
    if (!draft) return;
    const nextHora = draft.sin_horario_limite
      ? null
      : draft.hora_limite || '09:30';
    const catId = extractCatalogTaskId(act.id);
    const existingCatalog = catId
      ? tareasCatalogo.find((t) => t.id === catId)
      : undefined;

    if (existingCatalog && onSaveCatalogTask) {
      await onSaveCatalogTask(
        {
          ...existingCatalog,
          hora_limite: nextHora,
          sin_horario_limite: draft.sin_horario_limite,
        },
        false
      );
    } else {
      await onUpdateActividad({
        ...act,
        hora_limite: nextHora,
        sin_horario_limite: draft.sin_horario_limite,
      });
    }
    setSavedTimeId(act.id);
    setUploadNotice(
      draft.sin_horario_limite
        ? `"${act.titulo}" marcada como Sin horario límite.`
        : `Horario límite de "${act.titulo}" actualizado a las ${draft.hora_limite}.`
    );
    setTimeout(() => setSavedTimeId(null), 1600);
  };

  return (
    <div className="space-y-6">
      {/* Hidden shared file input (Cajera only) */}
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
            {isCreador ? 'Ajustar horarios límite' : 'Ver horarios límite'}
          </button>

          {isCreador && (
            <button
              type="button"
              onClick={openCreateCreadorModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Crear / Asignar actividad
            </button>
          )}

          {isCajera && (
            <button
              type="button"
              onClick={() => setShowCashierModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Subir actividad del día
            </button>
          )}
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

      {/* Audit & Status Quick Filters */}
      <section className="bg-white rounded-2xl border border-[#EAE3F5] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#FAF8FC] border border-[#EAE3F5] rounded-xl">
            {(
              [
                { id: 'todas', label: 'Todas' },
                { id: 'Completada', label: 'Completada' },
                { id: 'Pendiente', label: 'Pendiente' },
                { id: 'fuera_horario', label: 'Fuera de horario' },
                { id: 'Observada', label: 'Observada' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setFilterEstatus(st.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  filterEstatus === st.id
                    ? 'bg-[#F3ECFC] text-[#5B21B6] font-semibold'
                    : 'text-[#6E5F87] hover:text-[#1F172B]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {isAuditor ? (
            <div className="flex flex-wrap items-center gap-2">
              {onSelectSucursal && (
                <select
                  aria-label="Filtrar actividades por sucursal"
                  value={selectedSucursalId}
                  onChange={(e) => onSelectSucursal(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-semibold text-[#5B21B6]"
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

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Filtrar actividades por fecha"
                  value={filterFecha}
                  onChange={(e) => setFilterFecha(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-[#E6DDF5] bg-[#FAF8FC] text-xs font-mono-num text-[#1F172B]"
                />
                {filterFecha ? (
                  <button
                    type="button"
                    onClick={() => setFilterFecha('')}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#DB2777] bg-[#FDF2F8] border border-[#FBCFE8]"
                  >
                    Todas las fechas
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setFilterFecha(new Date().toISOString().slice(0, 10))
                    }
                    className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#5B21B6] bg-[#FAF7FE] border border-[#E6DDF5]"
                  >
                    Solo hoy
                  </button>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-[#7A6B93]">
              Bucket de almacenamiento:{' '}
              <code className="font-mono">evidencias_controlops</code>
            </span>
          )}
        </div>
      </section>

      {/* Activities List */}
      {scopedActividades.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#EAE3F5] p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-[#1F172B]">
            No hay actividades registradas para este filtro o día
          </p>
          <p className="text-xs text-[#7A6B93]">
            {isCreador
              ? 'Usa "Crear / Asignar actividad" para programar tareas a una o todas las sucursales.'
              : 'Cambia el filtro de estatus o selecciona otro día evaluado.'}
          </p>
        </div>
      ) : (
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
                      {act.descripcion && (
                        <p className="text-xs text-[#55476E] mt-1">
                          {act.descripcion}
                        </p>
                      )}
                    </div>

                    {/* Status control: Cajera marks completion; Supervisor can mark Observada; Creador sees badge + management buttons */}
                    {isCajera ? (
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
                                : null,
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
                      </select>
                    ) : isSupervisor ? (
                      <select
                        aria-label="Revisión de supervisión"
                        value={act.estatus}
                        onChange={(e) => {
                          const nextStatus = e.target.value as EstatusActividad;
                          onUpdateActividad({
                            ...act,
                            estatus: nextStatus,
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
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                            act.estatus === 'Completada'
                              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                              : act.estatus === 'Observada'
                                ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C]'
                                : 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]'
                          }`}
                        >
                          {act.estatus}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditCreadorModal(act)}
                          title="Editar actividad"
                          aria-label="Editar actividad"
                          className="p-1.5 rounded-lg text-[#5B21B6] hover:bg-[#F3ECFC] transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              mode: 'delete_activity',
                              actividad: act,
                            })
                          }
                          title="Eliminar actividad"
                          aria-label="Eliminar actividad"
                          className="p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFF1F2] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Assigned days, upload timestamp & deadline evaluation */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    {evalHorario.etiqueta === 'Sin horario límite' ? (
                      <span className="inline-flex items-center gap-1 text-[#6D28D9] font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        Sin horario límite
                      </span>
                    ) : evalHorario.etiqueta === 'Vencida' ? (
                      <span className="inline-flex items-center gap-1 text-[#BE123C] font-semibold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Fuera de horario (límite {evalHorario.horaLimite})
                      </span>
                    ) : evalHorario.etiqueta === 'Completada con retraso' ? (
                      <span className="inline-flex items-center gap-1 text-[#B45309] font-semibold">
                        <Clock className="h-3.5 w-3.5" />
                        Con retraso · Subida {act.hora_completada} (límite{' '}
                        {evalHorario.horaLimite})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#15803D] font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {act.hora_completada
                          ? `A tiempo · Subida ${act.hora_completada} (límite ${evalHorario.horaLimite})`
                          : `En tiempo · Límite ${evalHorario.horaLimite}`}
                      </span>
                    )}

                    <span className="font-mono-num text-[11px] text-[#7A6B93]">
                      Fecha: {act.fecha}
                    </span>

                    {act.dias_semana && act.dias_semana.length > 0 && (
                      <span className="text-[11px] text-[#7A6B93]">
                        Días: {act.dias_semana.map((d) => DIA_SHORT[d]).join(', ')}
                      </span>
                    )}
                  </div>

                  {/* Individual Activity Deadline Quick Control (Creador only) */}
                  {isCreador && (
                    <div className="rounded-xl bg-[#FAF7FE] border border-[#EAE3F5] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[#5B21B6]">
                        {act.sin_horario_limite
                          ? 'Regla individual: Sin límite'
                          : act.hora_limite
                            ? `Horario individual: ${act.hora_limite}`
                            : `Usa horario sucursal (${evalHorario.horaLimite || 'Sin límite'})`}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {(() => {
                          const draft = inlineTimeDrafts[act.id] || {
                            hora_limite:
                              act.hora_limite || evalHorario.horaLimite || '09:30',
                            sin_horario_limite: Boolean(act.sin_horario_limite),
                          };
                          const changed = Boolean(inlineTimeDrafts[act.id]);
                          return (
                            <>
                              <input
                                type="time"
                                aria-label={`Horario límite para ${act.titulo}`}
                                disabled={draft.sin_horario_limite}
                                value={draft.hora_limite}
                                onChange={(e) =>
                                  setInlineTimeDrafts((prev) => ({
                                    ...prev,
                                    [act.id]: {
                                      ...draft,
                                      hora_limite: e.target.value,
                                    },
                                  }))
                                }
                                className="px-2 py-1 rounded-lg border border-[#E6DDF5] bg-white text-[11px] font-mono-num disabled:opacity-50"
                              />
                              <label className="inline-flex items-center gap-1 text-[11px] font-medium text-[#55476E] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={draft.sin_horario_limite}
                                  onChange={(e) =>
                                    setInlineTimeDrafts((prev) => ({
                                      ...prev,
                                      [act.id]: {
                                        ...draft,
                                        sin_horario_limite: e.target.checked,
                                      },
                                    }))
                                  }
                                />
                                Sin límite
                              </label>
                              {(changed || savedTimeId === act.id) && (
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineDeadline(act)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                                    savedTimeId === act.id
                                      ? 'bg-[#DCFCE7] text-[#15803D]'
                                      : 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white'
                                  }`}
                                >
                                  {savedTimeId === act.id ? 'Guardado' : 'Guardar hora'}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Comments / Audit Observations */}
                  {isAuditor ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={
                          draftObs[act.id] !== undefined
                            ? draftObs[act.id]
                            : act.observaciones
                        }
                        onChange={(e) =>
                          setDraftObs((prev) => ({
                            ...prev,
                            [act.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveInlineObs(act);
                        }}
                        placeholder="Comentarios de revisión o auditoría..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-[#E6DDF5] bg-[#FAF8FC] text-xs text-[#1F172B] placeholder:text-[#9D8FB5] focus:outline-none focus:border-[#7C3AED] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveInlineObs(act)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors ${
                          savedObsId === act.id
                            ? 'bg-[#DCFCE7] text-[#15803D]'
                            : 'bg-[#F3ECFC] hover:bg-[#E7DAFA] text-[#5B21B6]'
                        }`}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savedObsId === act.id ? 'Listo' : 'Guardar'}
                      </button>
                    </div>
                  ) : (
                    act.observaciones && (
                      <p className="text-xs text-[#55476E] bg-[#FAF8FC] rounded-xl px-3 py-2 border border-[#F1ECF9]">
                        {act.observaciones}
                      </p>
                    )
                  )}
                </div>

                {/* Evidence Photo Footer */}
                <div className="pt-3 border-t border-[#F1ECF9] flex flex-wrap items-center justify-between gap-2.5">
                  {act.evidencia_url ? (
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage({
                            url: act.evidencia_url!,
                            title: `${act.sucursal_nombre} — ${act.titulo}${
                              act.hora_completada
                                ? ` (Subida ${act.hora_completada} · ${act.fecha})`
                                : ''
                            }`,
                          })
                        }
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[#5B21B6] hover:text-[#DB2777] transition-colors"
                      >
                        <img
                          src={act.evidencia_url}
                          alt={`Evidencia de ${act.titulo}`}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded-lg object-cover border border-[#E6DDF5]"
                        />
                        <span className="inline-flex items-center gap-1">
                          <Maximize2 className="h-3.5 w-3.5" />
                          Ampliar evidencia
                        </span>
                      </button>

                      {isCreador && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              mode: 'delete_photo',
                              actividad: act,
                            })
                          }
                          title="Eliminar fotografía de evidencia"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#BE123C] bg-[#FFF1F2] hover:bg-[#FFE4E6] transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          Borrar foto
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#8B7CA5]">
                      <ImageIcon className="h-3.5 w-3.5" />
                      Sin fotografía adjunta
                    </span>
                  )}

                  {isCajera ? (
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
                  ) : (
                    isCreador &&
                    (act.estatus !== 'Pendiente' || act.evidencia_url) && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            mode: 'reset_pending',
                            actividad: act,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#FAF7FE] hover:bg-[#F3ECFC] text-[#5B21B6] border border-[#E6DDF5] transition-colors whitespace-nowrap"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reiniciar a pendiente
                      </button>
                    )
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

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

      {/* Cashier Modal: Report Activity + Photo Evidence (Cajera only) */}
      {isCashierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E6DDF5] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1ECF9]">
              <h3 className="font-display text-base font-bold text-[#1F172B]">
                Registrar actividad con evidencia
              </h3>
              <button
                type="button"
                onClick={closeCashierModal}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCashierSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Sucursal
                  </label>
                  <input
                    type="text"
                    disabled
                    value={
                      sucursales.find((s) => s.id === selectedSucursalId)
                        ?.nombre || 'Sucursal asignada'
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm bg-[#FAF8FC] text-[#55476E]"
                  />
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
                  onClick={closeCashierModal}
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

      {/* Creador Modal: Create / Edit / Assign Activity */}
      {isCreador && showCreadorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F172B]/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E6DDF5] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1ECF9]">
              <h3 className="font-display text-base font-bold text-[#1F172B]">
                {editingActividad
                  ? 'Editar actividad asignada'
                  : 'Crear y asignar nueva actividad'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreadorModal(false);
                  setEditingActividad(null);
                }}
                className="p-1.5 rounded-lg text-[#6E5F87] hover:bg-[#F5F0FC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCreadorSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Sucursal destino
                  </label>
                  <select
                    value={creadorForm.sucursal_id}
                    onChange={(e) =>
                      setCreadorForm({
                        ...creadorForm,
                        sucursal_id: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                  >
                    {(!editingActividad ||
                      Boolean(extractCatalogTaskId(editingActividad.id))) && (
                      <option value="todas">
                        Todas las sucursales activas (
                        {sucursales.filter((s) => s.activa).length})
                      </option>
                    )}
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
                    value={creadorForm.categoria}
                    onChange={(e) =>
                      setCreadorForm({
                        ...creadorForm,
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

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Título de la actividad *
                </label>
                <input
                  type="text"
                  required
                  value={creadorForm.titulo}
                  onChange={(e) =>
                    setCreadorForm({ ...creadorForm, titulo: e.target.value })
                  }
                  placeholder="Ej. Arqueo matutino de caja y envío de foto"
                  className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1">
                  Descripción / Instrucciones para cajeras
                </label>
                <textarea
                  rows={2}
                  value={creadorForm.descripcion}
                  onChange={(e) =>
                    setCreadorForm({
                      ...creadorForm,
                      descripcion: e.target.value,
                    })
                  }
                  placeholder="Detalla qué debe validar o fotografiar la cajera..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#55476E] mb-1.5">
                  Días de la semana aplicables
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_DIAS.map((d) => {
                    const active = creadorForm.dias_semana.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDiaCreador(d)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-[#F3ECFC] border-[#C4B5FD] text-[#5B21B6]'
                            : 'bg-[#FAF8FC] border-[#EAE3F5] text-[#8B7CA5]'
                        }`}
                      >
                        {DIA_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-[#55476E] mb-1">
                    Horario límite
                  </label>
                  <input
                    type="time"
                    disabled={creadorForm.sin_horario_limite}
                    value={creadorForm.hora_limite}
                    onChange={(e) =>
                      setCreadorForm({
                        ...creadorForm,
                        hora_limite: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E6DDF5] text-sm font-mono-num disabled:opacity-50"
                  />
                </div>

                <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[#EAE3F5] bg-[#FAF8FC] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creadorForm.sin_horario_limite}
                    onChange={(e) =>
                      setCreadorForm({
                        ...creadorForm,
                        sin_horario_limite: e.target.checked,
                      })
                    }
                    className="rounded border-[#C4B5FD] text-[#7C3AED]"
                  />
                  <span className="text-xs font-semibold text-[#5B21B6]">
                    Sin horario límite
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreadorModal(false);
                    setEditingActividad(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#6E5F87] hover:bg-[#FAF8FC]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCreador}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white disabled:opacity-50"
                >
                  {savingCreador
                    ? 'Guardando...'
                    : editingActividad
                      ? 'Guardar cambios'
                      : 'Asignar actividad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete / Reset Modal (Creador only) */}
      <ConfirmDeleteModal
        open={Boolean(confirmAction)}
        title={
          confirmAction?.mode === 'reset_pending'
            ? '¿Seguro que deseas reiniciar esta actividad a pendiente?'
            : '¿Seguro que deseas eliminar este registro?'
        }
        detail={
          confirmAction?.mode === 'delete_photo'
            ? `Se eliminará la fotografía de evidencia de "${confirmAction.actividad.titulo}" en evidencias_controlops.`
            : confirmAction?.mode === 'reset_pending'
              ? `La actividad "${confirmAction.actividad.titulo}" (${confirmAction.actividad.sucursal_nombre}) volverá a estatus Pendiente y se eliminará su evidencia adjunta.`
              : confirmAction
                ? extractCatalogTaskId(confirmAction.actividad.id)
                  ? `Se eliminará definitivamente "${confirmAction.actividad.titulo}" del catálogo (catalogos_controlops) y sus registros en actividades_diarias.`
                  : `Se eliminará la actividad "${confirmAction.actividad.titulo}" (${confirmAction.actividad.sucursal_nombre}) y su evidencia fotográfica si existe.`
                : undefined
        }
        loading={confirming}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction) return;
          setConfirming(true);
          try {
            if (confirmAction.mode === 'delete_activity') {
              const catId = extractCatalogTaskId(confirmAction.actividad.id);
              if (catId && onDeleteCatalogTask) {
                await onDeleteCatalogTask(catId);
                setUploadNotice(
                  `Actividad "${confirmAction.actividad.titulo}" eliminada definitivamente de Supabase.`
                );
              } else {
                await onDeleteActividad(confirmAction.actividad);
              }
            } else if (confirmAction.mode === 'delete_photo') {
              await onDeleteEvidenciaActividad(confirmAction.actividad);
            } else {
              await onResetActividadPendiente(confirmAction.actividad);
            }
            setConfirmAction(null);
          } finally {
            setConfirming(false);
          }
        }}
      />
    </div>
  );
};
