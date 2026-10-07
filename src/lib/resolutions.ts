import { supabase } from "@/lib/supabase"
import {
  fetchGeneratedDocuments,
  generateResolutionDocument,
  type DocumentGenerationResult,
} from "@/lib/document-generation"

/**
 * Resoluciones — documento sustitutivo del contrato cuando el Cargo destino es
 * Especialista Principal (`organization_jobs.is_principal_specialist = true`).
 *
 * Diferencias clave con el resto del motor documental:
 *   · La Resolución se genera SIEMPRE a partir de un evento laboral formal
 *     (contratación de candidato o movimiento de puesto), nunca al Vincular a
 *     plantilla (acción administrativa sin documentación).
 *   · Las variables r.* se resuelven desde el snapshot histórico de
 *     `worker_resolutions`, jamás desde el estado vivo.
 */

export const RESOLUTION_DOCUMENT_TYPE = "RESOLUTION"

export interface ResolutionContextWorker {
  full_name: string | null
  identification: string | null
}

export interface ResolutionContextJob {
  id: string
  name: string | null
  is_principal_specialist: boolean
  work_content: string | null
  salary_group_sequence: number | null
  salary_amount: number | null
  currency_code: string | null
}

export interface ResolutionContextEntity {
  id: string
  name: string | null
  entity_type: string
  municipality: string | null
  revolution_year: string | null
  can_edit_contract_data: boolean
}

export interface ResolutionRepresentative {
  assignment_id: string | null
  person_name: string | null
  position_title: string | null
}

export interface ResolutionContext {
  worker_id: string | null
  position_id: string
  resolution_date: string
  worker: ResolutionContextWorker | null
  job: ResolutionContextJob
  position: { name: string | null }
  entity: ResolutionContextEntity
  parent_company: { name: string | null }
  representative: ResolutionRepresentative | null
  representatives: ResolutionRepresentative[]
  can_edit_job: boolean
}

export interface CreateResolutionInput {
  workerId: string
  assignmentId: string | null
  positionId: string
  resolutionDate: string
  representativeAssignmentId?: string | null
  workContentOverride?: string | null
  eventType?: "HIRE" | "MOVEMENT"
}

export interface CreatedResolution {
  resolution_id: string
  worker_id: string
  entity_id: string
  resolution_date: string
}

/** Contexto resuelto automáticamente para el formulario de Resolución (§13/§16). */
export const fetchResolutionContext = async (input: {
  workerId?: string | null
  positionId: string
  resolutionDate?: string | null
  representativeAssignmentId?: string | null
}): Promise<ResolutionContext> => {
  const { data, error } = await supabase.rpc("resolution_worker_context", {
    p_worker_id: input.workerId ?? null,
    p_position_id: input.positionId,
    p_resolution_date: input.resolutionDate ?? null,
    p_representative_assignment_id: input.representativeAssignmentId ?? null,
  })
  if (error) throw error
  return data as ResolutionContext
}

/** Crea el registro histórico de la Resolución (snapshot) del evento laboral. */
export const createWorkerResolution = async (
  input: CreateResolutionInput
): Promise<CreatedResolution> => {
  const { data, error } = await supabase.rpc("create_worker_resolution", {
    p_worker_id: input.workerId,
    p_assignment_id: input.assignmentId,
    p_position_id: input.positionId,
    p_resolution_date: input.resolutionDate,
    p_representative_assignment_id: input.representativeAssignmentId ?? null,
    p_work_content_override: input.workContentOverride?.trim() || null,
    p_event_type: input.eventType ?? "HIRE",
  })
  if (error) throw error
  return data as CreatedResolution
}

/** Persiste las Funciones / contenido de trabajo en el Cargo (fuente de verdad). */
export const updateJobWorkContent = async (jobId: string, workContent: string): Promise<void> => {
  const { error } = await supabase.rpc("update_job_work_content", {
    p_job_id: jobId,
    p_work_content: workContent,
  })
  if (error) throw error
}

export type ResolutionTemplateStatus = "RESOLVED" | "NONE" | "AMBIGUOUS" | "UNKNOWN"

export interface ResolutionTemplateAvailability {
  status: ResolutionTemplateStatus
  versionId: string | null
  versionNumber: number | null
  templateName: string | null
}

/** ¿Existe una plantilla RESOLUTION activa aplicable a la fecha? (nunca Contract). */
export const resolveResolutionTemplateAvailability = async (
  entityId: string,
  referenceDate: string | null
): Promise<ResolutionTemplateAvailability> => {
  if (!entityId) {
    return { status: "UNKNOWN", versionId: null, versionNumber: null, templateName: null }
  }
  const { data, error } = await supabase.rpc("resolve_document_template_version", {
    p_entity_id: entityId,
    p_document_type_code: RESOLUTION_DOCUMENT_TYPE,
    p_reference_date: referenceDate || new Date().toISOString().slice(0, 10),
  })
  if (error) throw error

  const row = (data as Record<string, unknown> | null) || {}
  const raw = row.status != null ? String(row.status) : "NONE"
  const status: ResolutionTemplateStatus =
    raw === "RESOLVED" || raw === "NONE" || raw === "AMBIGUOUS" ? raw : "UNKNOWN"

  return {
    status,
    versionId: row.version_id != null ? String(row.version_id) : null,
    versionNumber: row.version_number != null ? Number(row.version_number) : null,
    templateName: row.template_name != null ? String(row.template_name) : null,
  }
}

/** Variables realmente exigidas por la plantilla RESOLUTION aplicable (§42). */
export const fetchResolutionRequiredVariables = async (
  versionId: string
): Promise<string[]> => {
  const { data, error } = await supabase
    .from("document_template_versions")
    .select("analysis")
    .eq("id", versionId)
    .maybeSingle()
  if (error) throw error
  const analysis = (data as { analysis: { required_variables?: unknown } | null } | null)?.analysis
  const required = analysis?.required_variables
  return Array.isArray(required) ? required.map((value) => String(value)) : []
}

export interface ResolutionAutomationResult {
  generated: boolean
  skipped: boolean
  result: DocumentGenerationResult | null
}

/** Evita duplicados: no genera si ya existe un documento completado para la Resolución. */
export const ensureResolutionDocumentGenerated = async (
  resolutionId: string
): Promise<ResolutionAutomationResult> => {
  const existing = await fetchGeneratedDocuments({ resolutionId })
  if (existing.length > 0) return { generated: false, skipped: true, result: null }
  const result = await generateResolutionDocument(resolutionId)
  return { generated: result.success, skipped: false, result }
}

export interface WorkerResolutionRow {
  id: string
  worker_id: string
  position_id: string | null
  resolution_date: string
  job_name_snapshot: string | null
  work_content_snapshot: string | null
  status: string
  worker_document_id: string | null
  generated_at: string | null
  created_at: string
}

/** Resoluciones históricas del trabajador (todas permanecen, nunca se sobrescriben). */
export const fetchWorkerResolutions = async (workerId: string): Promise<WorkerResolutionRow[]> => {
  const { data, error } = await supabase
    .from("worker_resolutions")
    .select(
      "id, worker_id, position_id, resolution_date, job_name_snapshot, work_content_snapshot, status, worker_document_id, generated_at, created_at"
    )
    .eq("worker_id", workerId)
    .order("resolution_date", { ascending: false })
  if (error) throw error
  return (data as WorkerResolutionRow[]) || []
}

export const MISSING_RESOLUTION_TEMPLATE_MESSAGE =
  "No se puede completar la Resolución.\n\nNo existe una plantilla activa de Resolución. Configúrela antes de continuar."

export const RESOLUTION_TEMPLATE_NOT_CONFIGURED =
  "No existe una plantilla de Resolución activa."
