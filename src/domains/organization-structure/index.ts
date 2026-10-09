/**
 * Barrel público del dominio de estructura organizativa (catálogos globales).
 *
 * Reexporta explícitamente los símbolos originales de los módulos de catálogo
 * para preservar la interfaz pública durante la migración DDD.
 */

// --- Tipos e interfaces ---
export type { OccupationalCategory } from "./domain/entities"
export type { PreparationLevel } from "./domain/entities"

// --- Constantes de etiqueta ---
export { NO_OCCUPATIONAL_CATEGORY_LABEL } from "./infrastructure/catalogs.repository"
export { NO_PREPARATION_LEVEL_LABEL } from "./infrastructure/catalogs.repository"

// --- Funciones de infraestructura ---
export {
  fetchOccupationalCategories,
  occupationalCategoryLabel,
  hasOccupationalCategory,
  fetchPreparationLevels,
  fetchJobPreparationLevels,
  formatPreparationLevels,
} from "./infrastructure/catalogs.repository"
