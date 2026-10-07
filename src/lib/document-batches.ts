import { supabase } from "@/lib/supabase"
import {
  generatePayrollMovementDocument,
  WORKER_DOCUMENTS_BUCKET,
} from "@/lib/document-generation"

/**
 * Documentos pendientes (movimientos masivos).
 *
 * Los documentos individuales SIEMPRE viven en el expediente del trabajador
 * (worker_documents). Los lotes (document_batches) son únicamente agrupaciones
 * para descarga: un ZIP = una entidad + un event_id + un tipo documental.
 */

export type BatchStatus = "GENERATING" | "READY" | "ERRORS"

export interface PendingBatch {
  id: string
  event_id: string
  organization_entity_id: string
  entity_name: string | null
  document_type_code: string
  document_type_label: string
  label: string | null
  status: BatchStatus
  expected_count: number
  generated_count: number
  failed_count: number
  zip_path: string | null
  zip_file_name: string | null
  effective_date: string | null
  created_at: string
}

export interface PendingBatchItem {
  id: string
  worker_id: string
  worker_document_id: string | null
  worker_name: string | null
  status: "GENERATED" | "ERROR"
  error: string | null
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

const text = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value)

/** Lotes documentales visibles dentro del scope permitido (RLS por entidad). */
export async function fetchPendingBatches(): Promise<PendingBatch[]> {
  const { data, error } = await supabase
    .from("document_batches")
    .select(
      `id, event_id, organization_entity_id, document_type_code, label, status,
       expected_count, generated_count, failed_count, zip_path, zip_file_name, created_at,
       event:document_generation_events(effective_date, description),
       entity:organization_entities(name)`
    )
    .order("created_at", { ascending: false })
  if (error) throw error

  return ((data as unknown[]) || []).map((raw) => {
    const row = record(raw)
    const event = record(row.event)
    const entity = record(row.entity)
    return {
      id: String(row.id),
      event_id: String(row.event_id),
      organization_entity_id: String(row.organization_entity_id),
      entity_name: text(entity.name),
      document_type_code: String(row.document_type_code),
      document_type_label: text(row.label) ?? String(row.document_type_code),
      label: text(row.label),
      status: (text(row.status) as BatchStatus) || "GENERATING",
      expected_count: Number(row.expected_count) || 0,
      generated_count: Number(row.generated_count) || 0,
      failed_count: Number(row.failed_count) || 0,
      zip_path: text(row.zip_path),
      zip_file_name: text(row.zip_file_name),
      effective_date: text(event.effective_date),
      created_at: String(row.created_at),
    }
  })
}

/** Detalle de un lote: cada trabajador/documento con su estado. */
export async function fetchBatchItems(batchId: string): Promise<PendingBatchItem[]> {
  const { data, error } = await supabase
    .from("document_batch_items")
    .select("id, worker_id, worker_document_id, worker_name, status, error")
    .eq("batch_id", batchId)
    .order("worker_name", { ascending: true })
  if (error) throw error
  return ((data as unknown[]) || []).map((raw) => {
    const row = record(raw)
    return {
      id: String(row.id),
      worker_id: String(row.worker_id),
      worker_document_id: text(row.worker_document_id),
      worker_name: text(row.worker_name),
      status: (text(row.status) as "GENERATED" | "ERROR") || "ERROR",
      error: text(row.error),
    }
  })
}

/** Movimientos de nómina de un evento que aún no tienen documento generado. */
export async function fetchUngeneratedEventMovements(
  eventId: string
): Promise<{ id: string; worker_id: string }[]> {
  const { data, error } = await supabase
    .from("worker_payroll_movements")
    .select("id, worker_id, worker_document_id, status")
    .eq("event_id", eventId)
    .or("worker_document_id.is.null,status.neq.GENERATED")
  if (error) throw error
  return ((data as unknown[]) || []).map((raw) => {
    const row = record(raw)
    return { id: String(row.id), worker_id: String(row.worker_id) }
  })
}

export interface EventGenerationResult {
  generated: number
  failed: number
  errors: { movement_id: string; message: string }[]
}

/**
 * Genera (con el motor DOCX existente) el documento individual de cada Movimiento
 * de Nómina pendiente del evento. Reintenta únicamente los no generados: los
 * correctos nunca se regeneran (idempotencia en begin_payroll_movement_generation).
 */
export async function generateEventMovementDocuments(
  eventId: string
): Promise<EventGenerationResult> {
  const pending = await fetchUngeneratedEventMovements(eventId)
  const result: EventGenerationResult = { generated: 0, failed: 0, errors: [] }
  for (const movement of pending) {
    const generated = await generatePayrollMovementDocument(movement.id)
    if (generated.success) {
      result.generated += 1
    } else {
      result.failed += 1
      result.errors.push({ movement_id: movement.id, message: generated.error ?? "Error" })
    }
  }
  return result
}

/** Reconstruye los lotes del evento (aplica la regla > 5 por entidad y tipo). */
export async function rebuildEventBatches(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc("create_document_batches_for_event", {
    p_event_id: eventId,
  })
  if (error) throw error
  return Number(record(data).batches) || 0
}

/** Empaqueta el ZIP del lote en el backend (Edge Function) y lo registra. */
export async function requestBatchZip(batchId: string): Promise<{
  zip_path: string
  zip_file_name: string
}> {
  const { data, error } = await supabase.functions.invoke("generate-document-batch-zip", {
    body: { batch_id: batchId },
  })
  if (error) throw error
  const row = record(data)
  if (row.error) throw new Error(String(row.error))
  return { zip_path: String(row.zip_path), zip_file_name: String(row.zip_file_name) }
}

export interface EventDocumentationResult {
  generated: number
  failed: number
  batchesReady: number
  zipsCreated: number
}

/**
 * Cierre documental automático de un evento masivo (§75).
 *
 * 1. Genera con el motor DOCX existente el documento individual de cada Movimiento
 *    de Nómina pendiente del evento (nunca regenera los ya correctos).
 * 2. Reconstruye los lotes del evento (aplica la regla > 5 por entidad y tipo).
 * 3. Empaqueta el ZIP de cada lote listo que aún no lo tenga.
 *
 * La generación DOCX es del lado cliente (no hay conversor en servidor), por lo que
 * este cierre se dispara justo tras materializar el evento, sin intervención del usuario.
 */
export async function ensureEventDocumentation(
  eventId: string
): Promise<EventDocumentationResult> {
  const generated = await generateEventMovementDocuments(eventId)
  await rebuildEventBatches(eventId)

  const batches = (await fetchPendingBatches()).filter((batch) => batch.event_id === eventId)
  let batchesReady = 0
  let zipsCreated = 0
  for (const batch of batches) {
    if (batch.status !== "READY") continue
    batchesReady += 1
    if (!batch.zip_path) {
      try {
        await requestBatchZip(batch.id)
        zipsCreated += 1
      } catch {
        // El ZIP es una facilidad de descarga: su fallo no invalida los documentos.
      }
    }
  }

  return { generated: generated.generated, failed: generated.failed, batchesReady, zipsCreated }
}

/** Enlace temporal (10 min) para descargar un ZIP privado. */
export async function createBatchZipUrl(zipPath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(WORKER_DOCUMENTS_BUCKET)
    .createSignedUrl(zipPath, 600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export const formatBatchMoment = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}/${month}/${date.getFullYear()}`
}
