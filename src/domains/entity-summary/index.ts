/**
 * Barrel público del contexto de informes del Resumen de entidad.
 *
 * Reexporta explícitamente los símbolos originales del módulo migrado
 * (`entity-summary-reports.ts`) para preservar la interfaz pública.
 */

// --- Informes demográficos: tipos ---
export type { ReportSlice } from "./domain/entities"
export type { AgeReport } from "./domain/entities"
export type { SexReport } from "./domain/entities"
export type { SkinColorReport } from "./domain/entities"
export type { EducationLevelReport } from "./domain/entities"
export type { CatalogRefs } from "./domain/entities"
export type { WorkersByAgeData } from "./domain/entities"
export type { AgeBucketKey } from "./domain/rules"

// --- Informes demográficos: constantes y funciones puras ---
export {
  NO_INFO_KEY,
  AGE_BUCKETS,
  reportTotal,
  ageFromBirthDate,
  ageBucketKey,
  countsToSlices,
} from "./domain/rules"

// --- Ámbito del Resumen: tipos ---
export type { SummaryScope } from "./domain/entities"
export type { EntityScopeInfo } from "./domain/entities"

// --- Informes demográficos: infraestructura ---
export { fetchEntityScope } from "./infrastructure/entity-scope.repository"
export {
  fetchCatalogRefs,
  fetchWorkersByAge,
  fetchWorkersBySex,
  fetchWorkersBySkinColor,
  fetchWorkersByEducationLevel,
} from "./infrastructure/reports.repository"

// --- Distribución y ocupación: tipos ---
export type { PositionRef } from "./domain/entities"
export type { PlantillaSummary } from "./domain/entities"
export type { OccupancySummary } from "./domain/entities"
export type { DistributionSlice } from "./domain/entities"
export type { DistributionSummary } from "./domain/entities"

// --- Distribución y ocupación: funciones puras ---
export { buildDistribution } from "./domain/distribution"

// --- Distribución y ocupación: infraestructura ---
export { fetchPlantillaSummary } from "./infrastructure/plantilla.repository"
export { fetchOccupancySummary } from "./infrastructure/occupancy.repository"

// --- Vacaciones: tipo ---
export type { VacationsSummary } from "./domain/entities"

// --- Vacaciones: infraestructura ---
export { fetchVacationsSummary } from "./infrastructure/vacations.repository"
