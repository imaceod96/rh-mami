import { supabase } from "@/lib/supabase"
import { differenceInYears } from "date-fns"

/**
 * Módulos de informes demográficos del Resumen (pestaña Reportes).
 *
 * Principios (nunca se rompen):
 *   - La fuente de verdad son los TRABAJADORES ACTIVOS. Ni Candidates, ni Workers
 *     dados de baja (Reingresos).
 *   - Un Worker activo SIN Assignment (pendiente de vinculación) CUENTA en los
 *     informes personales (sexo, color de piel, nivel académico, edad).
 *   - El ámbito respeta el scope (Esta entidad / + descendientes vía `entityIds`).
 *   - Las tablas de catálogo (sexo, color de piel, nivel académico) se consultan
 *     una sola vez y se reutilizan en todas las consultas.
 *
 * NOTA: postgREST no soporta GROUP BY. Los informes descargan el campo a agrupar
 * (una sola columna) de los trabajadores activos del ámbito y agregan en el
 * cliente. Nunca se trae la fila completa ni se usa `array.length` como total.
 */

export type ReportSlice = {
  key: string
  label: string
  value: number
}

/** Código de la rebanada para los trabajadores sin el dato cargado. */
export const NO_INFO_KEY = "no-info"

/**
 * Tramos de edad utilizados en todos los informes de edad.
 * Incluye explícitamente el tramo «Sin información» (fecha de nacimiento ausente).
 */
export const AGE_BUCKETS = [
  { key: "under20", label: "Menos de 20 años" },
  { key: "20-29", label: "20-29 años" },
  { key: "30-39", label: "30-39 años" },
  { key: "40-49", label: "40-49 años" },
  { key: "50-59", label: "50-59 años" },
  { key: "60plus", label: "60 años o más" },
  { key: NO_INFO_KEY, label: "Sin información" },
] as const

export type AgeBucketKey = (typeof AGE_BUCKETS)[number]["key"]

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

/** Suma de los valores de un informe (total de trabajadores distintos). */
export function reportTotal(report: {
  byAgeGroup?: ReportSlice[]
  bySex?: ReportSlice[]
  bySkinColor?: ReportSlice[]
  byEducation?: ReportSlice[]
}): number {
  const slices =
    report.byAgeGroup ?? report.bySex ?? report.bySkinColor ?? report.byEducation
  return slices.reduce((sum, s) => sum + s.value, 0)
}

const today = () => new Date()

/** Calcula la edad cronológica a partir de la fecha de nacimiento. */
export function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null
  return differenceInYears(today(), new Date(birthDate))
}

/** Asigna una edad (años) al tramo correspondiente. Sin fecha → «Sin información». */
export function ageBucketKey(age: number | null): AgeBucketKey {
  if (age === null || Number.isNaN(age)) return NO_INFO_KEY
  if (age < 20) return "under20"
  if (age <= 29) return "20-29"
  if (age <= 39) return "30-39"
  if (age <= 49) return "40-49"
  if (age <= 59) return "50-59"
  return "60plus"
}

/** Convierte un mapa de contadores en rebanadas ordenadas (mayor a menor). */
export function countsToSlices(
  counts: Map<string, number>,
  nameById: Record<string, string>,
  fallback: string
): ReportSlice[] {
  return Array.from(counts.entries())
    .map(([key, value]) => ({
      key,
      label: nameById[key] ?? fallback,
      value,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

// ---------------------------------------------------------------------------
// ÁMBITO (igual que en entity-summary: esta entidad / + descendientes)
// ---------------------------------------------------------------------------

export async function fetchEntityScope(
  entityId: string,
  scope: "self" | "descendants"
): Promise<{ entityIds: string[]; descendantCount: number }> {
  const { data, error } = await supabase
    .from("organization_entities")
    .select("id, parent_id")
  if (error) throw error

  const rows = (data as { id: string; parent_id: string | null }[]) || []
  const childrenByParent = new Map<string, string[]>()
  rows.forEach((row) => {
    if (!row.parent_id) return
    const list = childrenByParent.get(row.parent_id) || []
    list.push(row.id)
    childrenByParent.set(row.parent_id, list)
  })

  const descendants: string[] = []
  const seen = new Set<string>()
  const stack = [...(childrenByParent.get(entityId) || [])]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    descendants.push(id)
    const children = childrenByParent.get(id)
    if (children) stack.push(...children)
  }

  const entityIds = scope === "descendants" ? [entityId, ...descendants] : [entityId]
  return { entityIds, descendantCount: descendants.length }
}

// ---------------------------------------------------------------------------
// CATÁLOGOS (sexo, color de piel, nivel académico)
// ---------------------------------------------------------------------------

export interface CatalogRefs {
  genderNameById: Record<string, string>
  skinColorNameById: Record<string, string>
  educationNameById: Record<string, string>
}

/** Carga una sola vez los catálogos de referencia globales (nombre real, no código). */
export async function fetchCatalogRefs(): Promise<CatalogRefs> {
  const [genders, skinColors, educationLevels] = await Promise.all([
    supabase.from("genders").select("id, name, code").order("name"),
    supabase.from("skin_colors").select("id, name, code").order("name"),
    supabase.from("education_levels").select("id, name, code").order("name"),
  ])

  if (genders.error || skinColors.error || educationLevels.error) {
    throw genders.error ?? skinColors.error ?? educationLevels.error
  }

  const label = (rows: { id: string; name: string | null; code: string | null }[] | null) =>
    Object.fromEntries(
      (rows || []).map((row) => [row.id, row.name || row.code || "—"])
    )

  return {
    genderNameById: label(genders.data as any),
    skinColorNameById: label(skinColors.data as any),
    educationNameById: label(educationLevels.data as any),
  }
}

const SIN_INFORMACION = "Sin información"

/** Lee una columna simple de los trabajadores ACTIVOS del ámbito. */
async function fetchActiveWorkerColumn(
  entityIds: string[],
  column: string
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const { data, error, count } = await supabase
    .from("workers")
    .select(column, { count: "exact" })
    .in("organization_entity_id", entityIds)
    .eq("employment_status", "active")
  if (error) throw error
  return { rows: (data as unknown as Record<string, unknown>[]) || [], total: count ?? 0 }
}

// ---------------------------------------------------------------------------
// INFORME: TRABAJADORES SEGÚN EDAD
// ---------------------------------------------------------------------------

export interface WorkersByAgeData {
  total: number
  byAgeGroup: ReportSlice[]
}

/**
 * Trabajadores según edad. Requiere `workers.view` o `workers.manage`.
 * La edad se deriva de `birth_date` (persistida, derivada de la identificación
 * cuando aplica). El total son TODOS los trabajadores activos del ámbito; los
 * que no tienen fecha de nacimiento van al tramo «Sin información».
 */
export async function fetchWorkersByAge(entityIds: string[]): Promise<WorkersByAgeData> {
  const empty: WorkersByAgeData = {
    total: 0,
    byAgeGroup: AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, value: 0 })),
  }
  if (entityIds.length === 0) return empty

  const { rows, total } = await fetchActiveWorkerColumn(entityIds, "birth_date")

  const counts = new Map<AgeBucketKey, number>()
  AGE_BUCKETS.forEach((b) => counts.set(b.key, 0))

  rows.forEach((row) => {
    const bucket = ageBucketKey(ageFromBirthDate((row.birth_date as string) ?? null))
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  })

  const byAgeGroup: ReportSlice[] = AGE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    value: counts.get(b.key) ?? 0,
  }))

  return { total, byAgeGroup }
}

// ---------------------------------------------------------------------------
// INFORMES: SEXO / COLOR DE PIEL / NIVEL ACADÉMICO
// ---------------------------------------------------------------------------

/**
 * Agrupa una columna de catálogo de los trabajadores activos. Descarga SOLO esa
 * columna, cuenta en el cliente (postgREST no soporta GROUP BY) e incluye
 * «Sin información» para los trabajadores sin el dato.
 */
async function buildCatalogReport(
  entityIds: string[],
  column: string,
  nameById: Record<string, string>
): Promise<{ total: number; slices: ReportSlice[]; countKey: string }> {
  if (entityIds.length === 0) {
    return { total: 0, slices: [], countKey: "" }
  }
  const { rows, total } = await fetchActiveWorkerColumn(entityIds, column)
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const key = (row[column] as string) ?? NO_INFO_KEY
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  const slices = countsToSlices(counts, nameById, SIN_INFORMACION)
  return { total, slices, countKey: column }
}

export async function fetchWorkersBySex(
  entityIds: string[],
  catalogRefs: CatalogRefs
): Promise<SexReport> {
  const { total, slices } = await buildCatalogReport(
    entityIds,
    "gender_id",
    catalogRefs.genderNameById
  )
  return { total, bySex: slices }
}

export async function fetchWorkersBySkinColor(
  entityIds: string[],
  catalogRefs: CatalogRefs
): Promise<SkinColorReport> {
  const { total, slices } = await buildCatalogReport(
    entityIds,
    "skin_color_id",
    catalogRefs.skinColorNameById
  )
  return { total, bySkinColor: slices }
}

export async function fetchWorkersByEducationLevel(
  entityIds: string[],
  catalogRefs: CatalogRefs
): Promise<EducationLevelReport> {
  const { total, slices } = await buildCatalogReport(
    entityIds,
    "education_level_id",
    catalogRefs.educationNameById
  )
  return { total, byEducation: slices }
}
