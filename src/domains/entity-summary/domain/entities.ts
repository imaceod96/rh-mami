/**
 * Informes demográficos del Resumen de entidad.
 *
 * Principios (nunca se rompen):
 *   - La fuente de verdad son los TRABAJADORES ACTIVOS. Ni Candidates, ni Workers
 *     dados de baja (Reingresos).
 *   - Un Worker activo SIN Assignment (pendiente de vinculación) CUENTA en los
 *     informes personales (sexo, color de piel, nivel académico, edad).
 *   - El ámbito respeta el scope (Esta entidad / + descendientes vía `entityIds`).
 */

/** Punto (rebanada) de un informe demográfico. */
export type ReportSlice = {
  key: string
  label: string
  value: number
}

/** Informe: trabajadores según edad (agrupados por tramo de edad). */
export interface AgeReport {
  /** Trabajadores activos del ámbito (con o sin fecha de nacimiento). */
  total: number
  byAgeGroup: ReportSlice[]
}

/** Informe: trabajadores según sexo. */
export interface SexReport {
  total: number
  bySex: ReportSlice[]
}

/** Informe: trabajadores según color de piel. */
export interface SkinColorReport {
  total: number
  bySkinColor: ReportSlice[]
}

/** Informe: trabajadores según nivel académico. */
export interface EducationLevelReport {
  total: number
  byEducation: ReportSlice[]
}

export interface WorkersByAgeData {
  total: number
  byAgeGroup: ReportSlice[]
}

/** Catálogos de referencia globales resueltos a nombre real (no código). */
export interface CatalogRefs {
  genderNameById: Record<string, string>
  skinColorNameById: Record<string, string>
  educationNameById: Record<string, string>
}
