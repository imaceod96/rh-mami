import { supabase } from "@/lib/supabase"

/**
 * Información laboral del Puesto (Fase 11A.3): lugar de trabajo, jornada,
 * horario habitual por días y descanso.
 *
 * El horario se almacena normalizado en `position_schedule_segments`:
 * un registro por segmento (día + rango horario), lo que permite varios
 * segmentos por día y turnos que cruzan medianoche.
 */

export const NO_WORK_INFO_LABEL = "Sin configurar"

export interface WeekDay {
  value: number
  label: string
  short: string
}

/** Día ISO-8601: 1 = Lunes … 7 = Domingo */
export const WEEK_DAYS: WeekDay[] = [
  { value: 1, label: "Lunes", short: "L" },
  { value: 2, label: "Martes", short: "M" },
  { value: 3, label: "Miércoles", short: "X" },
  { value: 4, label: "Jueves", short: "J" },
  { value: 5, label: "Viernes", short: "V" },
  { value: 6, label: "Sábado", short: "S" },
  { value: 7, label: "Domingo", short: "D" },
]

export interface PositionScheduleSegment {
  id?: string
  position_id?: string
  day_of_week: number
  start_time: string
  end_time: string
  crosses_midnight?: boolean
  display_order?: number
}

export interface PositionWorkInfo {
  work_location: string | null
  daily_hours: number | null
  weekly_hours: number | null
  monthly_hours: number | null
  break_minutes: number | null
  schedule_notes: string | null
}

export const weekDayLabel = (dayOfWeek: number): string =>
  WEEK_DAYS.find((day) => day.value === dayOfWeek)?.label || `Día ${dayOfWeek}`

export const weekDayShort = (dayOfWeek: number): string =>
  WEEK_DAYS.find((day) => day.value === dayOfWeek)?.short || "?"

/** Normaliza "08:00:00" o "08:00" a "08:00". */
export const formatTime = (time: string | null | undefined): string => {
  if (!time) return "—"
  const [hours, minutes] = time.split(":")
  return `${hours.padStart(2, "0")}:${(minutes || "00").padStart(2, "0")}`
}

/** Horas: 8 → "8", 190.6 → "190,6" (sin ceros innecesarios). */
export const formatHoursValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—"
  return value.toLocaleString("es-CU", { maximumFractionDigits: 2 })
}

/** Rango de días consecutivos: [1,2,3,4,5] → "Lun–Vie"; [1,3] → "Lun, Mié". */
export const formatDayRange = (days: number[]): string => {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 0) return "—"
  if (sorted.length === 1) return weekDayLabel(sorted[0]).slice(0, 3)

  const isConsecutive = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1)
  if (isConsecutive) {
    return `${weekDayLabel(sorted[0]).slice(0, 3)}–${weekDayLabel(sorted[sorted.length - 1]).slice(0, 3)}`
  }
  return sorted.map((day) => weekDayLabel(day).slice(0, 3)).join(", ")
}

/**
 * Resumen legible del horario agrupando días con el mismo rango horario:
 * "Lun–Vie 08:00–16:30 · Sáb 08:00–12:00".
 */
export const formatScheduleSummary = (
  segments: PositionScheduleSegment[] | null | undefined
): string | null => {
  if (!segments || segments.length === 0) return null

  const groups = new Map<string, number[]>()
  segments.forEach((segment) => {
    const key = `${formatTime(segment.start_time)}-${formatTime(segment.end_time)}`
    const days = groups.get(key) || []
    days.push(segment.day_of_week)
    groups.set(key, days)
  })

  return Array.from(groups.entries())
    .map(([range, days]) => {
      const [start, end] = range.split("-")
      const suffix = end < start ? " (+1 día)" : ""
      return `${formatDayRange(days)} ${start}–${end}${suffix}`
    })
    .join(" · ")
}

/** Línea de días con sus segmentos: útil para el detalle del puesto. */
export const formatScheduleByDay = (
  segments: PositionScheduleSegment[] | null | undefined
): { day: string; ranges: string }[] => {
  if (!segments || segments.length === 0) return []

  const byDay = new Map<number, PositionScheduleSegment[]>()
  segments.forEach((segment) => {
    const list = byDay.get(segment.day_of_week) || []
    list.push(segment)
    byDay.set(segment.day_of_week, list)
  })

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a - b)
    .map(([day, list]) => ({
      day: weekDayLabel(day),
      ranges: list
        .slice()
        .sort((a, b) => formatTime(a.start_time).localeCompare(formatTime(b.start_time)))
        .map(
          (segment) =>
            `${formatTime(segment.start_time)}–${formatTime(segment.end_time)}${
              segment.crosses_midnight ? " (+1 día)" : ""
            }`
        )
        .join(", "),
    }))
}

/** Jornada: "8 h/día · 44 h/semana · 190,6 h/mes" o null si no hay nada configurado. */
export const formatJornada = (info: {
  daily_hours?: number | null
  weekly_hours?: number | null
  monthly_hours?: number | null
}): string | null => {
  const parts: string[] = []
  if (info.daily_hours !== null && info.daily_hours !== undefined) {
    parts.push(`${formatHoursValue(info.daily_hours)} h/día`)
  }
  if (info.weekly_hours !== null && info.weekly_hours !== undefined) {
    parts.push(`${formatHoursValue(info.weekly_hours)} h/semana`)
  }
  if (info.monthly_hours !== null && info.monthly_hours !== undefined) {
    parts.push(`${formatHoursValue(info.monthly_hours)} h/mes`)
  }
  return parts.length > 0 ? parts.join(" · ") : null
}

export const formatBreak = (minutes: number | null | undefined): string | null =>
  minutes === null || minutes === undefined ? null : `${minutes} min`

/** ¿El puesto tiene algo configurado de lugar/jornada/horario? */
export const hasWorkInfo = (
  position: Partial<PositionWorkInfo> | null | undefined,
  segments?: PositionScheduleSegment[] | null
): boolean => {
  if (!position) return false
  return !!(
    position.work_location ||
    position.daily_hours !== null && position.daily_hours !== undefined ||
    position.weekly_hours !== null && position.weekly_hours !== undefined ||
    position.monthly_hours !== null && position.monthly_hours !== undefined ||
    position.break_minutes !== null && position.break_minutes !== undefined ||
    position.schedule_notes ||
    (segments && segments.length > 0)
  )
}

/** Segmentos de horario de todos los puestos de la entidad (RLS aplica). */
export async function fetchEntityScheduleSegments(
  entityId: string
): Promise<Record<string, PositionScheduleSegment[]>> {
  const { data, error } = await supabase
    .from("position_schedule_segments")
    .select("id, position_id, day_of_week, start_time, end_time, crosses_midnight, display_order")
    .eq("organization_entity_id", entityId)
    .order("day_of_week")
    .order("display_order")

  if (error) throw error

  const grouped: Record<string, PositionScheduleSegment[]> = {}
  ;((data as PositionScheduleSegment[]) || []).forEach((segment) => {
    const key = segment.position_id || ""
    grouped[key] = grouped[key] || []
    grouped[key].push(segment)
  })
  return grouped
}

/** Segmentos de un puesto concreto. */
export async function fetchPositionScheduleSegments(
  positionId: string
): Promise<PositionScheduleSegment[]> {
  const { data, error } = await supabase
    .from("position_schedule_segments")
    .select("id, position_id, day_of_week, start_time, end_time, crosses_midnight, display_order")
    .eq("position_id", positionId)
    .order("day_of_week")
    .order("display_order")

  if (error) throw error
  return (data as PositionScheduleSegment[]) || []
}
