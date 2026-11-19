export type SectionId =
  | 'ranking'
  | 'llamadas'
  | 'actividades'
  | 'gastos'
  | 'horarios'
  | 'admin';

export type RolUsuario = 'cajera' | 'supervisor' | 'creador';

export interface UsuarioControlOps {
  id: string;
  nombre: string;
  correo: string;
  password: string;
  rol: RolUsuario;
  sucursal_id: string;
  sucursales_asignadas?: string[];
  activo: boolean;
  created_at?: string;
}

export type DiaSemana =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo';

export interface Sucursal {
  id: string;
  nombre: string;
  codigo: string;
  ciudad: string;
  responsable_caja: string;
  meta_llamadas_diarias: number;
  meta_actividades_diarias: number;
  meta_refrendos_mensual: number;
  techo_gasto_mensual: number;
  activa: boolean;
}

export interface MetaSucursal {
  id: string;
  sucursal_id: string;
  meta_llamadas_diarias: number;
  meta_actividades_diarias: number;
  meta_refrendos_mensual: number;
  techo_gasto_mensual: number;
}

export interface TareaCatalogo {
  id: string;
  titulo: string;
  categoria: 'Caja' | 'Auditoría' | 'Expedientes' | 'Corte';
  activa: boolean;
}

export interface CatalogosControlOps {
  id: string;
  tareas_obligatorias: TareaCatalogo[];
  opciones_llamada: string[];
}

export type ReporteCajeraOpcion = string;

export type EstatusAuditoriaLlamada = 'Sin auditar' | 'Verificada' | 'Falsa';

export type EstatusVencimiento = 'Al corriente' | 'Por vencer' | 'Vencido';

export interface LlamadaSucursal {
  id: string;
  sucursal_id: string;
  sucursal_nombre: string;
  cliente_nombre: string;
  contrato: string;
  telefono: string;
  monto_prestamo: number;
  estatus_vencimiento: EstatusVencimiento;
  fecha_vencimiento: string;
  reporte_cajera: ReporteCajeraOpcion;
  estatus_auditoria: EstatusAuditoriaLlamada;
  observaciones_admin: string;
  cajera_nombre: string;
  llamada_registrada: boolean;
  fecha_registro: string;
}

export type EstatusActividad = 'Pendiente' | 'Completada' | 'Observada';

export interface ActividadDiaria {
  id: string;
  sucursal_id: string;
  sucursal_nombre: string;
  titulo: string;
  descripcion?: string;
  categoria: 'Caja' | 'Auditoría' | 'Expedientes' | 'Corte';
  responsable: string;
  fecha: string;
  dias_semana?: DiaSemana[];
  hora_limite?: string | null;
  sin_horario_limite?: boolean;
  hora_completada: string | null;
  estatus: EstatusActividad;
  evidencia_url: string | null;
  observaciones: string;
}

export interface GastoYRefrendo {
  id: string;
  sucursal_id: string;
  sucursal_nombre: string;
  tipo: 'Gasto' | 'Refrendo';
  categoria: string;
  concepto: string;
  monto_real: number;
  presupuesto_limite: number;
  cantidad_refrendos: number;
  meta_refrendos: number;
  fecha: string;
  responsable: string;
  evidencia_url: string | null;
  notas: string;
}

export interface HorarioSucursalDia {
  id: string;
  sucursal_id: string;
  dia: DiaSemana;
  hora_limite_actividad: string;
  hora_limite_corte: string;
  sin_horario_limite: boolean;
}

export interface BranchMetricSummary {
  sucursal: Sucursal;
  llamadasRegistradas: number;
  llamadasVerificadas: number;
  llamadasFalsas: number;
  llamadasSinAuditar: number;
  metaLlamadas: number;
  pctLlamadas: number;
  actividadesCompletadas: number;
  actividadesTotal: number;
  actividadesVencidas: number;
  pctActividades: number;
  gastoRealTotal: number;
  gastoPresupuestoTotal: number;
  excesoDinero: number;
  excesoPorcentaje: number;
  pctUsoPresupuesto: number;
  excedioPresupuesto: boolean;
  refrendosRealizados: number;
  refrendosMeta: number;
  montoRefrendos: number;
  pctRefrendos: number;
  puntajeGlobal: number;
}
