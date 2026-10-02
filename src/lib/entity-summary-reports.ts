import { supabase } from "@/lib/supabase"
import { differenceInYears } from "date-fns"

/**
 * Módulos de informes demográficos del Resumen (pestaña Reportes).
 *
 * Principios (nunca se rompen):
 *   - La fuente de verdad son los TRABAJADORES. Cada informe consulta agregaciones
 *     reales, nunca una tabla completa para calcular `array.length`.
 *   - Cada informe se consulta SOLO cuando el usuario tiene el permiso real
 *     `workers.view` o `workers.manage` (permiso → query enabled). El backend (RLS)
 *     sigue siendo la autoridad final.
 *   - Las tablas de catálogo (sexo, color de piel, nivel académico) se consultan
 *     una sola vez y se reutilizan en todas las consultas.
 */

export type ReportSlice = {
  key: string
  label: string
  value: number
}

/** Tramos de edad utilizados en todos los informes de edad. */
export const AGE_BUCKETS = [
  { key: "under18", label: "Menos de 18 años" },
  { key: "18-25", label: "18-25 años" },
  { key: "26-35", label: "26-35 años" },
  { key: "36-45", label: "36-45 años" },
  { key: "46-55", label: "46-55 años" },
  { key: "56-65", label: "56-65 años" },
  { key: "over65", label: "Más de 65 años" },
] as const

export type AgeBucketKey = (typeof AGE_BUCKETS)[number]["key"]

/** Un trabajador activo (sin datos personales cargados). */
export interface ActiveWorkerRef {
  id: string
}

/** Informe: trabajadores según edad (agrupados por tramo de edad). */
export interface AgeReport {
  /** Trabajadores activos del ámbito. */
  total: number
  byAgeGroup: ReportSlice[]
}

/** Informe: trabajadores según sexo. */
export interface SexReport {
  bySex: ReportSlice[]
}

/** Informe: trabajadores según color de piel. */
export interface SkinColorReport {
  bySkinColor: ReportSlice[]
}

/** Informe: trabajadores según nivel académico. */
export interface EducationLevelReport {
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

/** Asigna una edad (años) al tramo correspondiente. */
export function ageBucketKey(age: number | null): AgeBucketKey | null {
  if (age === null) return null
  if (age < 18) return "under18"
  if (age <= 25) return "18-25"
  if (age <= 35) return "26-35"
  if (age <= 45) return "36-45"
  if (age <= 55) return "46-55"
  if (age <= 65) return "56-65"
  return "over65"
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
  genderCodes: string[]
  skinColorCodes: string[]
  educationCodes: string[]
}

/** Carga una sola vez los catálogos de referencia y sus códigos válidos. */
export async function fetchCatalogRefs(): Promise<CatalogRefs> {
  const [genders, skinColors, educationLevels] = await Promise.all([
    supabase.from("genders").select("id, code").eq("is_active", true),
    supabase.from("skin_colors").select("id, code").eq("is_active", true),
    supabase.from("education_levels").select("id, code").eq("is_active", true),
  ])

  if (genders.error || skinColors.error || educationLevels.error) {
    throw genders.error ?? skinColors.error ?? educationLevels.error
  }

  const genderRows = (genders.data as { id: string; code: string }[]) || []
  const skinColorRows = (skinColors.data as { id: string; code: string }[]) || []
  const educationRows = (educationLevels.data as { id: string; code: string }[]) || []

  return {
    genderNameById: Object.fromEntries(genderRows.map((r) => [r.id, r.code])),
    skinColorNameById: Object.fromEntries(skinColorRows.map((r) => [r.id, r.code])),
    educationNameById: Object.fromEntries(educationRows.map((r) => [r.id, r.code])),
    genderCodes: genderRows.map((r) => r.id),
    skinColorCodes: skinColorRows.map((r) => r.id),
    educationCodes: educationRows.map((r) => r.id),
  }
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
 *
 * La edad se deriva de `birth_date`, que no es una columna agrupable directamente
 * en postgREST. Por ello se consultan SOLO las fechas de nacimiento (un campo) de
 * los trabajadores activos y se agrupan en tramos client-side. El total se obtiene
 * con una consulta `count` dedicada (nunca `array.length`).
 */
export async function fetchWorkersByAge(
  entityIds: string[]
): Promise<WorkersByAgeData> {
  if (entityIds.length === 0) {
    return {
      total: 0,
      byAgeGroup: AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, value: 0 })),
    }
  }

  const [birthRows, countResult] = await Promise.all([
    supabase
      .from("workers")
      .select("birth_date")
      .in("organization_entity_id", entityIds)
      .eq("employment_status", "active")
      .not("birth_date", "is", null),
    supabase
      .from("workers")
      .select("*", { count: "exact", head: true })
      .in("organization_entity_id", entityIds)
      .eq("employment_status", "active")
      .not("birth_date", "is", null),
  ])

  if (birthRows.error) throw birthRows.error

  const counts = new Map<AgeBucketKey, number>()
  AGE_BUCKETS.forEach((b) => counts.set(b.key, 0))

  ;((birthRows.data as { birth_date: string | null }[]) || []).forEach((row) => {
    const bucket = ageBucketKey(ageFromBirthDate(row.birth_date))
    if (bucket !== null) {
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    }
  })

  const byAgeGroup: ReportSlice[] = AGE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    value: counts.get(b.key) ?? 0,
  }))

  const total = countResult.count ?? 0

  return { total, byAgeGroup }
}

// ---------------------------------------------------------------------------
// INFORME: TRABAJADORES SEGÚN SEXO
// ---------------------------------------------------------------------------

export interface WorkersBySexData {
  total: number
  bySex: ReportSlice[]
}

/**
 * Trabajadores según sexo. Requiere `workers.view` o `workers.manage`.
 *
 * Agregación SQL con `GROUP BY gender_id`: no se descarga ninguna fila individual.
 * Los códigos de género del catálogo (campo `code`, p. ej. "H"/"M") se usan como
 * etiqueta. Los trabajadores sin sexo asignado se agrupan en "Sin especificar".
 */
export async function fetchWorkersBySex(
  entityIds: string[],
  catalogRefs: CatalogRefs
): Promise<WorkersBySexData> {
  if (entityIds.length === 0) {
    return { total: 0, bySex: [] }
  }

  const q = (supabase
    .from("workers")
    .select("gender_id", { count: "exact" })
    .in("organization_entity_id", entityIds)
    .eq("employment_status", "active") as any)
    .group("gender_id")
    .order("gender_id")

  const [result, countResult] = await Promise.all([
    q,
    supabase
      .from("workers")
      .select("*", { count: "exact", head: true })
      .in("organization_entity_id", entityIds)
      .eq("employment_status", "active"),
  ])

  if (result.error) throw result.error

  const counts = new Map<string, number>()
  ;((result.data as { gender_id: string | null }[]) || []).forEach((row) => {
    const key = row.gender_id ?? "sin-especificar"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const bySex: ReportSlice[] = countsToSlices(
    counts,
    catalogRefs.genderNameById,
    "Sin especificar"
  )

  const total = countResult.count ?? 0
  return { total, bySex }
}

// ---------------------------------------------------------------------------
// INFORME: TRABAJADORES SEGÚN COLOR DE PIEL
// ---------------------------------------------------------------------------

export interface WorkersBySkinColorData {
  total: number
  bySkinColor: ReportSlice[]
}

/**
 * Trabajadores según color de piel. Requiere `workers.view` o `workers.manage`.
 *
 * Agregación SQL con `GROUP BY skin_color_id`: no se descarga ninguna fila
 * individual. Etiquetas tomadas del catálogo `skin_colors` (su campo `code`).
 * Los trabajadores sin color de piel asignado se agrupan en "Sin especificar".
 */
export async function fetchWorkersBySkinColor(
  entityIds: string[],
  catalogRefs: CatalogRefs
): Promise<WorkersBySkinColorData> {
  if (entityIds.length === 0) {
    return { total: 0, bySkinColor: [] }
  }

  const q = (supabase
    .from("workers")
    .select("skin_color_id", { count: "exact" })
    .in("organization_entity_id", entityIds)
    .eq("employment_status", "active") as any)
    .group("skin_color_id")
    .order("skin_color_id")

  const [result, countResult] = await Promise.all([
    q,
    supabase
      .from("workers")
      .select("*", { count: "exact", head: true })
      .in("organization_entity_id", entityIds)
      .eq("employment_status", "active"),
  ])

  if (result.error) throw result.error

  const counts = new Map<string, number>()
  ;((result.data as { skin_color_id: string | null }[]) || []).forEach((row) => {
    const key = row.skin_color_id ?? "sin-especificar"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const bySkinColor: ReportSlice[] = countsToSlices(
    counts,
    catalogRefs.skinColorNameById,
    "Sin especificar"
  )

  const total = countResult.count ?? 0
  return { total, bySkinColor }
}

// ---------------------------------------------------------------------------
// INFORME: TRABAJADORES SEGÚN NIVEL ACADÉMICO
// ---------------------------------------------------------------------------

export interface WorkersByEducationLevelData {
  total: number
  byEducation: ReportSlice[]
}

/**
 * Trabajadores según nivel académico. Requiere `workers.view` o `workers.manage`.
 *
 * Agregación SQL con `GROUP BY education_level_id`: no se descarga ninguna fila
 * individual. Etiquetas tomadas del catálogo `education_levels` (su campo `code`).
 * Los trabajadores sin nivel académico asignado se agrupan en "Sin especificar".
 */
export async function fetchWorkersByEducationLevel(
  entityIds: string[],
  catalogRefs: CatalogRefs
): Promise<WorkersByEducationLevelData> {
  if (entityIds.length === 0) {
    return { total: 0, byEducation: [] }
  }

  const q = (supabase
      .from("workers")
      .select("education_level_id", { count: "exact" })
      .in("organization_entity_id", entityIds)
      .eq("employment_status", "active") as any)
      .group("education_level_id")
      .order("education_level_id")

  const [result, countResult] = await Promise.all([
    q,
    supabase
      .from("workers")
      .select("*", { count: "exact", head: true })
      .in("organization_entity_id", entityIds)
      .eq("employment_status", "active"),
  ])

  if (result.error) throw result.error

  const counts = new Map<string, number>()
  ;((result.data as { education_level_id: string | null }[]) || []).forEach((row) => {
    const key = row.education_level_id ?? "sin-especificar"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const byEducation: ReportSlice[] = countsToSlices(
    counts,
    catalogRefs.educationNameById,
    "Sin especificar"
  )

  const total = countResult.count ?? 0
  return { total, byEducation }
}
