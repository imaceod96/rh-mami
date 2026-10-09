/**
 * Barrel público del dominio de estructura organizativa.
 *
 * Reexporta explícitamente los símbolos originales de los módulos migrados
 * para preservar la interfaz pública durante la migración DDD.
 */

// --- Tipos e interfaces ---
export type { OccupationalCategory } from "./domain/entities"
export type { PreparationLevel } from "./domain/entities"
export type { WeekDay } from "./domain/entities"
export type { PositionScheduleSegment } from "./domain/entities"
export type { PositionWorkInfo } from "./domain/entities"

// --- Constantes de etiqueta ---
export { NO_OCCUPATIONAL_CATEGORY_LABEL } from "./infrastructure/catalogs.repository"
export { NO_PREPARATION_LEVEL_LABEL } from "./infrastructure/catalogs.repository"
export { NO_WORK_INFO_LABEL } from "./domain/rules"
export { WEEK_DAYS } from "./domain/rules"

// --- Funciones de formato (puras) ---
export {
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
} from "./domain/formatters"

// --- Funciones de infraestructura: catálogos ---
export {
  fetchOccupationalCategories,
  occupationalCategoryLabel,
  hasOccupationalCategory,
  fetchPreparationLevels,
  fetchJobPreparationLevels,
  formatPreparationLevels,
} from "./infrastructure/catalogs.repository"

// --- Funciones de infraestructura: horarios ---
export {
  fetchEntityScheduleSegments,
  fetchPositionScheduleSegments,
} from "./infrastructure/schedule.repository"
