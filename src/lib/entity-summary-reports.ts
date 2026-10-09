/**
 * Shim de compatibilidad.
 *
 * La implementación de los informes demográficos del Resumen se migró al
 * contexto DDD `entity-summary`. Este módulo solo reexporta explícitamente su
 * superficie pública original para no romper los consumidores existentes.
 * Dirección de dependencias: shim → dominio.
 */

export type {
  ReportSlice,
  AgeReport,
  SexReport,
  SkinColorReport,
  EducationLevelReport,
  CatalogRefs,
  WorkersByAgeData,
  AgeBucketKey,
} from "@/domains/entity-summary"

export {
  NO_INFO_KEY,
  AGE_BUCKETS,
  reportTotal,
  ageFromBirthDate,
  ageBucketKey,
  countsToSlices,
  fetchEntityScope,
  fetchCatalogRefs,
  fetchWorkersByAge,
  fetchWorkersBySex,
  fetchWorkersBySkinColor,
  fetchWorkersByEducationLevel,
} from "@/domains/entity-summary"
