/**
 * Compatibilidad pública — Horarios y jornadas de puestos.
 *
 * El módulo ha sido migrado a `src/domains/organization-structure/`. Este archivo
 * reexporta explícitamente los símbolos originales para preservar la interfaz
 * pública sin romper a los consumidores existentes.
 *
 * No utiliza `export *` para mantener el contrato explícito.
 */

export type {
  WeekDay,
  PositionScheduleSegment,
  PositionWorkInfo,
} from "@/domains/organization-structure"

export {
  NO_WORK_INFO_LABEL,
  WEEK_DAYS,
  weekDayLabel,
  weekDayShort,
  formatTime,
  formatHoursValue,
  formatDayRange,
  formatScheduleSummary,
  formatScheduleByDay,
  formatJornada,
  formatBreak,
  hasWorkInfo,
  fetchEntityScheduleSegments,
  fetchPositionScheduleSegments,
} from "@/domains/organization-structure"
