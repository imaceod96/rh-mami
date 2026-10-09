/**
 * Catálogos globales de la estructura organizativa.
 *
 * Estos catálogos son GLOBALES de SiteCorp: no tienen tenant_id ni
 * organization_entity_id. Todos los workspaces y entidades consumen
 * exactamente los mismos valores.
 */

/** Categoría ocupacional global (Operario, Administrativo, Servicios, Técnico…). */
export interface OccupationalCategory {
  id: string
  name: string
  code: string
  sort_order: number
  is_active: boolean
}

/** Nivel de preparación global (NS, TM, etc.). */
export interface PreparationLevel {
  id: string
  name: string
  code: string
  sort_order: number
}

/** Día de la semana ISO-8601 (1 = Lunes … 7 = Domingo). */
export interface WeekDay {
  value: number
  label: string
  short: string
}

/** Segmento horario de un puesto (día + rango horario). */
export interface PositionScheduleSegment {
  id?: string
  position_id?: string
  day_of_week: number
  start_time: string
  end_time: string
  crosses_midnight?: boolean
  display_order?: number
}

/** Información laboral del puesto (lugar, jornada, descanso). */
export interface PositionWorkInfo {
  work_location: string | null
  daily_hours: number | null
  weekly_hours: number | null
  monthly_hours: number | null
  break_minutes: number | null
  schedule_notes: string | null
}

/** Valor salarial vigente de un grupo (resuelto por vigencia temporal en el backend). */
export interface SalaryValue {
  amount: number
  currency_code: string
  effective_from?: string | null
}

/** Referencia mínima al grupo salarial de un cargo. */
export interface SalaryGroupRef {
  id: string
  salary_scale_id: string
  sequence_number: number
}

/** Fila del Anexo 14 de Puestos (VISTA DE PUESTOS, sin datos personales). */
export interface Anexo14Row {
  area_name: string | null
  area_code: string | null
  area_order: number
  job_order: number
  job_name: string | null
  position_name: string | null
  position_order: number
  occupational_category: string | null
  authorized_quantity: number
  preparation_levels: string | null
  salary_group_sequence: number | null
}

/** Filtros disponibles para la consulta del Anexo 14 de Puestos. */
export interface Anexo14Filters {
  includeInactive?: boolean
  areaId?: string | null
  jobId?: string | null
}

/** Metadatos de cabecera usados al generar el Anexo 14. */
export interface Anexo14Meta {
  entityName: string
  generatedAt: Date
}

/**
 * Fila del Anexo14B (plantilla con trabajadores): cada capacidad autorizada,
 * ocupada o vacante, con los datos del trabajador que la ocupa si existe.
 */
export interface StaffingExportRow {
  area_id: string | null
  area_name: string | null
  job_id: string | null
  job_name: string | null
  position_id: string | null
  position_name: string | null
  occupational_category: string | null
  worker_id: string | null
  worker_name: string | null
  gender_code: string | null
  identification: string | null
  preparation_level: string | null
  salary_group_sequence: number | null
  salary: number | null
  cla_amount: number | null
  academic_amount: number | null
  academic_category: string | null
  service_start: string | null
  has_masters_degree: boolean | null
  has_doctorate_degree: boolean | null
}

/** Metadatos de cabecera usados al generar el Anexo14B. */
export interface StaffingExportMeta {
  entityName: string
  generatedAt: Date
}
