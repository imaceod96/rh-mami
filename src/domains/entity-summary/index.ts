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

// --- Informes demográficos: infraestructura ---
export { fetchEntityScope } from "./infrastructure/entity-scope.repository"
export {
  fetchCatalogRefs,
  fetchWorkersByAge,
  fetchWorkersBySex,
  fetchWorkersBySkinColor,
  fetchWorkersByEducationLevel,
} from "./infrastructure/reports.repository"
