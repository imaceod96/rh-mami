import { supabase } from "@/lib/supabase"
import {
  fetchGeneratedDocuments,
  generatePayrollMovementDocument,
  type DocumentGenerationResult,
} from "@/lib/document-generation"

/**
 * Movimiento de Nómina: utilidades de generación automática.
 *
 * Tras un evento laboral (Alta / Reubicación / Baja) ya se ha creado el registro
 * histórico `worker_payroll_movements`. Aquí se localiza ese movimiento y se
 * garantiza su documento DOCX en el expediente del trabajador, reutilizando el
 * motor documental existente e IDEMPOTENCIA (nunca duplica un documento ya emitido).
 */

export type PayrollMovementEventType = "ALTA" | "REUBICACION" | "BAJA"

export const findPayrollMovement = async (
  workerId: string,
  eventType: PayrollMovementEventType,
  effectiveDate: string
): Promise<string | null> => {
  const { data, error } = await supabase.rpc("find_payroll_movement", {
    p_worker_id: workerId,
    p_event_type: eventType,
    p_effective_date: effectiveDate,
  })
  if (error) throw error
  return data ? String(data) : null
}

export interface PayrollMovementAutomationResult {
  generated: boolean
  skipped: boolean
  result: DocumentGenerationResult | null
}

/**
 * Garantiza el documento del Movimiento de Nómina para el evento indicado.
 * Si ya existe un documento completado, no genera otro (idempotencia §73).
 * Si el movimiento no existe (p. ej. reincorporación sin Alta), no hace nada.
 */
export const ensurePayrollMovementDocumentGenerated = async (
  workerId: string,
  eventType: PayrollMovementEventType,
  effectiveDate: string
): Promise<PayrollMovementAutomationResult> => {
  const movementId = await findPayrollMovement(workerId, eventType, effectiveDate)
  if (!movementId) return { generated: false, skipped: true, result: null }

  const existing = await fetchGeneratedDocuments({ movementId })
  if (existing.length > 0) return { generated: false, skipped: true, result: null }

  const result: DocumentGenerationResult = await generatePayrollMovementDocument(movementId)
  return { generated: result.success, skipped: false, result }
}
