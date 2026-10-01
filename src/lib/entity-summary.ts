import { subDays, format } from "date-fns"
import { supabase } from "@/lib/supabase"
import {
  CONTRACT_ALERT_HORIZON_DAYS,
  fetchContractAlerts,
  summarizeContractAlerts,
  type ContractAlertSummary,
} from "@/lib/contract-alerts"

/**
 * Dashboard REAL de una entidad (pantalla Resumen).
 *
 * Principios (nunca se rompen):
 *   - La fuente de verdad son los MÓDULOS OPERATIVOS. Aquí no se inventan estados,
 *     no se guardan estadísticas y no se comparan estados actuales para deducir
 *     movimientos históricos.
 *   - Cada bloque se consulta SOLO cuando el usuario tiene el permiso real que ya
 *     gobierna los módulos correspondientes (permiso → enabled query). El backend
 *     (RLS) sigue siendo la autoridad final.
 *   - Se usan consultas agregadas / filas de referencia pequeñas; nunca se descarga
 *     una tabla completa sólo para hacer `array.length`.
 */

export type SummaryScope = "self" | "descendants"

/** Período mostrado para los movimientos de personal (días). */
export const MOVEMENTS_WINDOW_DAYS = 30

const today = () => format(new Date(), "yyyy-MM-dd")

// ---------------------------------------------------------------------------
// ÁMBITO (Esta entidad / Entidad + descendientes)
// ---------------------------------------------------------------------------

export interface EntityScopeInfo {
  /** Entidades incluidas en el ámbito efectivo. */
  entityIds: string[]
  /** Descendientes ACCESIBLES para el usuario (0 = no se ofrece el ámbito ampliado). */
  descendantCount: number
}

/**
 * Resuelve el ámbito respetando el acceso real: se parte del árbol de entidades que
 * el usuario puede ver (filtrado por RLS con `can_view_entity`), por lo que un
 * usuario con alcance SELF nunca obtiene descendientes. Cambiar el `entityId` de la
 * URL no permite ver datos de otra entidad.
 */
export async function fetchEntityScope(
  entityId: string,
  scope: SummaryScope
): Promise<EntityScopeInfo> {
  const { data, error } = await supabase.from("organization_entities").select("id, parent_id")
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
// BLOQUE PRINCIPAL — PLANTILLA
// ---------------------------------------------------------------------------

export interface PositionRef {
  id: string
  job_id: string
  authorized_quantity: number
}

export interface PlantillaSummary {
  /** SUM(authorized_quantity) sobre puestos activos/válidos (no nº de registros). */
  authorized: number
  positionsTotal: number
  positions: PositionRef[]
  areaByJob: Record<string, string | null>
  categoryByJob: Record<string, string | null>
  areaNameById: Record<string, string>
  categoryNameById: Record<string, string>
}

/** Plantilla autorizada: requiere `staffing.view` o `staffing.manage`. */
export async function fetchPlantillaSummary(entityIds: string[]): Promise<PlantillaSummary> {
  const { data: positionsData, error: positionsError } = await supabase
    .from("organization_positions")
    .select("id, job_id, authorized_quantity")
    .in("organization_entity_id", entityIds)
    .eq("is_active", true)
  if (positionsError) throw positionsError

  const positions = (positionsData as PositionRef[]) || []
  const authorized = positions.reduce((sum, p) => sum + (p.authorized_quantity || 0), 0)

  const empty: PlantillaSummary = {
    authorized,
    positionsTotal: positions.length,
    positions,
    areaByJob: {},
    categoryByJob: {},
    areaNameById: {},
    categoryNameById: {},
  }
  if (positions.length === 0) return empty

  const jobIds = Array.from(new Set(positions.map((p) => p.job_id)))
  const { data: jobsData, error: jobsError } = await supabase
    .from("organization_jobs")
    .select("id, area_id, occupational_category_id")
    .in("id", jobIds)
  if (jobsError) throw jobsError

  const jobs = (jobsData as {
    id: string
    area_id: string | null
    occupational_category_id: string | null
  }[]) || []

  const areaByJob: Record<string, string | null> = {}
  const categoryByJob: Record<string, string | null> = {}
  const areaIds = new Set<string>()
  const categoryIds = new Set<string>()
  jobs.forEach((job) => {
    areaByJob[job.id] = job.area_id
    categoryByJob[job.id] = job.occupational_category_id
    if (job.area_id) areaIds.add(job.area_id)
    if (job.occupational_category_id) categoryIds.add(job.occupational_category_id)
  })

  const areaNameById: Record<string, string> = {}
  const categoryNameById: Record<string, string> = {}

  if (areaIds.size > 0) {
    const { data: areasData, error: areasError } = await supabase
      .from("organization_areas")
      .select("id, name")
      .in("id", Array.from(areaIds))
    if (areasError) throw areasError
    ;(areasData as { id: string; name: string }[] | null)?.forEach((a) => {
      areaNameById[a.id] = a.name
    })
  }

  if (categoryIds.size > 0) {
    const { data: categoriesData, error: categoriesError } = await supabase
      .from("occupational_categories")
      .select("id, name")
      .in("id", Array.from(categoryIds))
    if (categoriesError) throw categoriesError
    ;(categoriesData as { id: string; name: string }[] | null)?.forEach((c) => {
      categoryNameById[c.id] = c.name
    })
  }

  return {
    authorized,
    positionsTotal: positions.length,
    positions,
    areaByJob,
    categoryByJob,
    areaNameById,
    categoryNameById,
  }
}

// ---------------------------------------------------------------------------
// BLOQUE PRINCIPAL — OCUPACIÓN Y TRABAJADORES ACTIVOS
// ---------------------------------------------------------------------------

export interface OccupancySummary {
  /** Trabajadores con estado laboral activo. */
  activeWorkers: number
  /** Assignments actuales de trabajadores activos (puestos ocupados). */
  occupied: number
  /** Ocupación por puesto (position_id → nº de trabajadores activos). */
  occupiedByPosition: Record<string, number>
}

/** Requiere `workers.view` o `workers.manage`. */
export async function fetchOccupancySummary(entityIds: string[]): Promise<OccupancySummary> {
  const { data: workersData, error: workersError } = await supabase
    .from("workers")
    .select("id")
    .in("organization_entity_id", entityIds)
    .eq("employment_status", "active")
  if (workersError) throw workersError

  const activeWorkerIds = new Set(
    ((workersData as { id: string }[]) || []).map((w) => w.id)
  )

  const { data: assignmentsData, error: assignmentsError } = await supabase
    .from("worker_position_assignments")
    .select("position_id, worker_id, workers!inner(organization_entity_id, employment_status)")
    .eq("is_current", true)
    .is("end_date", null)
    .in("workers.organization_entity_id", entityIds)
    .eq("workers.employment_status", "active")
  if (assignmentsError) throw assignmentsError

  const occupiedByPosition: Record<string, number> = {}
  let occupied = 0
  ;((assignmentsData as { position_id: string; worker_id: string }[]) || []).forEach((row) => {
    // Defensa extra: sólo cuenta asignaciones de trabajadores activos del ámbito.
    if (!activeWorkerIds.has(row.worker_id)) return
    occupied += 1
    occupiedByPosition[row.position_id] = (occupiedByPosition[row.position_id] || 0) + 1
  })

  return { activeWorkers: activeWorkerIds.size, occupied, occupiedByPosition }
}

// ---------------------------------------------------------------------------
// DISTRIBUCIÓN (Área / Categoría ocupacional)
// ---------------------------------------------------------------------------

export interface DistributionSlice {
  key: string
  label: string
  value: number
}

export interface DistributionSummary {
  byArea: DistributionSlice[]
  byCategory: DistributionSlice[]
}

/**
 * Distribución resuelta por el modelo real:
 *   Assignment actual → Position → Cargo (job) → Área / Categoría ocupacional.
 * No existe `area_id` en Worker. Requiere plantilla + ocupación.
 */
export function buildDistribution(
  plantilla: PlantillaSummary,
  occupancy: OccupancySummary
): DistributionSummary {
  const jobByPosition: Record<string, string> = {}
  plantilla.positions.forEach((p) => {
    jobByPosition[p.id] = p.job_id
  })

  const areaCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  const NO_AREA = "sin-area"

  Object.entries(occupancy.occupiedByPosition).forEach(([positionId, count]) => {
    const jobId = jobByPosition[positionId]
    if (!jobId) return
    const areaId = plantilla.areaByJob[jobId] || NO_AREA
    areaCounts.set(areaId, (areaCounts.get(areaId) || 0) + count)

    const categoryId = plantilla.categoryByJob[jobId]
    if (categoryId) {
      categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + count)
    }
  })

  const toSlices = (
    counts: Map<string, number>,
    nameById: Record<string, string>,
    fallback: string
  ): DistributionSlice[] =>
    Array.from(counts.entries())
      .map(([key, value]) => ({
        key,
        label: nameById[key] || fallback,
        value,
      }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))

  return {
    byArea: toSlices(areaCounts, plantilla.areaNameById, "Sin área"),
    byCategory: toSlices(categoryCounts, plantilla.categoryNameById, "Sin categoría"),
  }
}

// ---------------------------------------------------------------------------
// CANDIDATOS
// ---------------------------------------------------------------------------

export interface CandidatesSummary {
  total: number
  active: number
  archived: number
  /** Candidatos con vínculo fiable a un trabajador (contratados). */
  hired: number
}

/** Requiere `candidates.view` o `candidates.manage`. */
export async function fetchCandidatesSummary(entityIds: string[]): Promise<CandidatesSummary> {
  const { data, error } = await supabase
    .from("candidates")
    .select("status, worker_id")
    .in("organization_entity_id", entityIds)
  if (error) throw error

  const rows = (data as { status: string | null; worker_id: string | null }[]) || []
  const summary: CandidatesSummary = { total: rows.length, active: 0, archived: 0, hired: 0 }
  rows.forEach((row) => {
    if (row.status === "archived") summary.archived += 1
    else summary.active += 1
    if (row.worker_id) summary.hired += 1
  })
  return summary
}

// ---------------------------------------------------------------------------
// CONTRATOS
// ---------------------------------------------------------------------------

export interface ContractsSummary {
  current: number
  determined: number
  undetermined: number
}

/**
 * Contratos vigentes por tipo contractual real (`employment_contract_types.code`).
 * Requiere `contracts.view`, `contracts.manage`, `workers.view` o `workers.manage`.
 */
export async function fetchContractsSummary(entityIds: string[]): Promise<ContractsSummary> {
  const [contractsResult, typesResult] = await Promise.all([
    supabase
      .from("employment_contracts")
      .select("contract_type_id")
      .in("organization_entity_id", entityIds)
      .eq("is_current", true),
    supabase.from("employment_contract_types").select("id, code"),
  ])
  if (contractsResult.error) throw contractsResult.error
  if (typesResult.error) throw typesResult.error

  const codeById: Record<string, string> = {}
  ;(typesResult.data as { id: string; code: string }[] | null)?.forEach((t) => {
    codeById[t.id] = t.code
  })

  const summary: ContractsSummary = { current: 0, determined: 0, undetermined: 0 }
  ;((contractsResult.data as { contract_type_id: string | null }[]) || []).forEach((row) => {
    summary.current += 1
    const code = row.contract_type_id ? codeById[row.contract_type_id] : null
    if (code === "DETERMINADO") summary.determined += 1
    else if (code === "INDETERMINADO") summary.undetermined += 1
  })
  return summary
}

// ---------------------------------------------------------------------------
// PRÓXIMOS VENCIMIENTOS (reutiliza la lógica del módulo de alertas)
// ---------------------------------------------------------------------------

/**
 * Reutiliza EXACTAMENTE el cálculo del módulo de alertas (`contract_expiry_alerts`
 * + `summarizeContractAlerts`): no existe una segunda clasificación.
 * Requiere `contract_alerts.view`, `workers.view` o `workers.manage`.
 */
export async function fetchExpirationsSummary(
  entityIds: string[]
): Promise<ContractAlertSummary> {
  const perEntity = await Promise.all(
    entityIds.map((id) =>
      fetchContractAlerts(id, { horizonDays: CONTRACT_ALERT_HORIZON_DAYS })
    )
  )

  const seen = new Set<string>()
  const rows = perEntity.flat().filter((row) => {
    if (seen.has(row.contract_id)) return false
    seen.add(row.contract_id)
    return true
  })

  return summarizeContractAlerts(rows)
}

// ---------------------------------------------------------------------------
// MOVIMIENTOS (últimos N días)
// ---------------------------------------------------------------------------

export interface MovementsSummary {
  from: string
  to: string
  days: number
  hires: number
  separations: number
  reincorporations: number
  positionChanges: number
  contractChanges: number
}

/**
 * Movimientos fiables de un período indicado:
 *   - Altas: `workers.hire_date` en el período (histórico real, no estado actual).
 *   - Bajas / Reincorporaciones / Cambios de puesto / de contrato:
 *     `worker_employment_movements.movement_type` + `effective_date`.
 * Requiere `workers.view` o `workers.manage`.
 */
export async function fetchMovementsSummary(
  entityIds: string[]
): Promise<MovementsSummary> {
  const from = format(subDays(new Date(), MOVEMENTS_WINDOW_DAYS), "yyyy-MM-dd")
  const to = today()

  const [hiresResult, movementsResult] = await Promise.all([
    supabase
      .from("workers")
      .select("id")
      .in("organization_entity_id", entityIds)
      .gte("hire_date", from)
      .lte("hire_date", to),
    supabase
      .from("worker_employment_movements")
      .select("movement_type, workers!inner(organization_entity_id)")
      .in("workers.organization_entity_id", entityIds)
      .gte("effective_date", from)
      .lte("effective_date", to),
  ])
  if (hiresResult.error) throw hiresResult.error
  if (movementsResult.error) throw movementsResult.error

  const summary: MovementsSummary = {
    from,
    to,
    days: MOVEMENTS_WINDOW_DAYS,
    hires: ((hiresResult.data as { id: string }[]) || []).length,
    separations: 0,
    reincorporations: 0,
    positionChanges: 0,
    contractChanges: 0,
  }

  ;((movementsResult.data as { movement_type: string }[]) || []).forEach((row) => {
    switch (row.movement_type) {
      case "BAJA":
        summary.separations += 1
        break
      case "REINCORPORACION":
        summary.reincorporations += 1
        break
      case "CAMBIO_PUESTO":
        summary.positionChanges += 1
        break
      case "CAMBIO_CONTRATO":
        summary.contractChanges += 1
        break
      default:
        break
    }
  })

  return summary
}

// ---------------------------------------------------------------------------
// CONFIGURACIÓN / READINESS (reutiliza la validación contractual central)
// ---------------------------------------------------------------------------

export interface ContractDataReadiness {
  ready: boolean
  missing: number
}

/**
 * Reutiliza la validación central de integridad contractual (`validate_entity_contract_readiness`).
 * Requiere `contract_data.view`, `contract_data.manage`, `workers.view` o `workers.manage`.
 */
export async function fetchContractDataReadiness(
  entityId: string
): Promise<ContractDataReadiness> {
  const { data, error } = await supabase.rpc("validate_entity_contract_readiness", {
    p_entity_id: entityId,
  })
  if (error) throw error
  const result = data as { ready?: boolean; missing?: unknown[] } | null
  return {
    ready: !!result?.ready,
    missing: Array.isArray(result?.missing) ? result?.missing.length : 0,
  }
}

export interface RepresentativeStatus {
  ready: boolean
  assigned: number
}

/**
 * Representante autorizado vigente a la fecha (datos contractuales de la entidad).
 * Requiere `representatives.view/manage`, `contract_data.view/manage`, `organization.view/manage`.
 */
export async function fetchRepresentativeStatus(
  entityId: string
): Promise<RepresentativeStatus> {
  const { data, error } = await supabase.rpc("resolve_entity_representatives", {
    p_entity_id: entityId,
    p_on_date: today(),
  })
  if (error) throw error

  const rows = (data as { person_name: string | null }[]) || []
  const assigned = rows.filter((row) => !!row.person_name && row.person_name.trim() !== "").length
  return { ready: rows.length > 0 && assigned === rows.length, assigned }
}

export interface SalaryScaleStatus {
  ready: boolean
}

/**
 * Escala salarial aplicable según el régimen (PRESUPUESTADA → escala global;
 * EMPRESARIAL → escala propia). Sin fallback entre regímenes.
 * Requiere `salary.view/manage`, `contract_data.view/manage`, `workers.view/manage`.
 */
export async function fetchSalaryScaleStatus(entityId: string): Promise<SalaryScaleStatus> {
  const { data, error } = await supabase.rpc("resolve_salary_scale_for_entity", {
    entity_id: entityId,
  })
  if (error) throw error
  return { ready: !!data }
}

export interface DocumentTemplatesStatus {
  configured: number
  total: number
}

/**
 * Plantillas documentales configuradas: tipos documentales activos con al menos una
 * versión ACTIVE en la entidad (sólo versiones válidas/activas).
 * Requiere `document_templates.view/manage` u `organization.view/manage`.
 */
export async function fetchDocumentTemplatesStatus(
  entityId: string
): Promise<DocumentTemplatesStatus> {
  const [typesResult, versionsResult] = await Promise.all([
    supabase.from("document_template_types").select("code").eq("is_active", true),
    supabase
      .from("document_template_versions")
      .select("document_type_code")
      .eq("organization_entity_id", entityId)
      .eq("status", "ACTIVE"),
  ])
  if (typesResult.error) throw typesResult.error
  if (versionsResult.error) throw versionsResult.error

  const total = ((typesResult.data as { code: string }[]) || []).length
  const configuredCodes = new Set(
    ((versionsResult.data as { document_type_code: string }[]) || []).map(
      (v) => v.document_type_code
    )
  )
  return { total, configured: configuredCodes.size }
}
