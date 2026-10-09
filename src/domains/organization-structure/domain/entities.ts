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
