import { supabase } from "@/lib/supabase"
import {
  documentTypeCodeForContractType,
  fetchGeneratedDocuments,
  generateAddendumDocument,
  generateContractDocument,
  type DocumentGenerationResult,
} from "@/lib/document-generation"

/**
 * Fase «Centro de contratación» — Orquestación contractual automática.
 *
 * Convierte la formalización contractual en UNA operación de negocio: validar la
 * plantilla ANTES de aplicar el cambio y generar el documento inmediatamente
 * después, sin exigir al usuario un paso manual de «Generar documento».
 *
 * Reutiliza el motor documental existente (11B.2) y su idempotencia
 * (`begin_document_generation`): aquí sólo se decide CUÁNDO y si ya existe un
 * documento para no generar duplicados ante reintentos (§68, §90).
 */

export type TemplateAvailabilityStatus = "RESOLVED" | "NONE" | "AMBIGUOUS" | "UNKNOWN"

export interface TemplateAvailability {
  status: TemplateAvailabilityStatus
  documentTypeCode: string | null
  versionId: string | null
  versionNumber: number | null
  templateName: string | null
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const resolveTemplateAvailability = async (
  entityId: string,
  documentTypeCode: string | null,
  referenceDate: string | null
): Promise<TemplateAvailability> => {
  if (!entityId || !documentTypeCode) {
    return {
      status: "UNKNOWN",
      documentTypeCode,
      versionId: null,
      versionNumber: null,
      templateName: null,
    }
  }

  const { data, error } = await supabase.rpc("resolve_document_template_version", {
    p_entity_id: entityId,
    p_document_type_code: documentTypeCode,
    p_reference_date: referenceDate || todayIso(),
  })
  if (error) throw error

  const row = (data as Record<string, unknown> | null) || {}
  const rawStatus = row.status != null ? String(row.status) : "NONE"
  const status: TemplateAvailabilityStatus =
    rawStatus === "RESOLVED" || rawStatus === "NONE" || rawStatus === "AMBIGUOUS"
      ? rawStatus
      : "UNKNOWN"

  return {
    status,
    documentTypeCode,
    versionId: row.version_id != null ? String(row.version_id) : null,
    versionNumber: row.version_number != null ? Number(row.version_number) : null,
    templateName: row.template_name != null ? String(row.template_name) : null,
  }
}

/** ¿Existe una plantilla activa aplicable para el contrato de ese tipo a esa fecha? */
export const resolveContractTemplateAvailability = (
  entityId: string,
  contractTypeCode: string | null,
  referenceDate: string | null
): Promise<TemplateAvailability> =>
  resolveTemplateAvailability(entityId, documentTypeCodeForContractType(contractTypeCode), referenceDate)

/** ¿Existe una plantilla activa aplicable para el anexo a esa fecha? */
export const resolveAddendumTemplateAvailability = (
  entityId: string,
  referenceDate: string | null
): Promise<TemplateAvailability> =>
  resolveTemplateAvailability(entityId, "EMPLOYMENT_CONTRACT_ADDENDUM", referenceDate)

export interface DocumentAutomationResult {
  /** Se generó un documento nuevo en esta llamada. */
  generated: boolean
  /** Ya existía un documento completado: no se duplica (idempotencia). */
  skipped: boolean
  result: DocumentGenerationResult | null
}

/**
 * Garantiza que el contrato tenga documento: no genera si ya existe uno completado,
 * de modo que un reintento o un doble clic nunca produzca documentos duplicados.
 */
export const ensureContractDocumentGenerated = async (
  contractId: string
): Promise<DocumentAutomationResult> => {
  const existing = await fetchGeneratedDocuments({ contractId })
  if (existing.length > 0) return { generated: false, skipped: true, result: null }
  const result = await generateContractDocument(contractId)
  return { generated: result.success, skipped: false, result }
}

/** Igual que el contrato, para el anexo. */
export const ensureAddendumDocumentGenerated = async (
  addendumId: string
): Promise<DocumentAutomationResult> => {
  const existing = await fetchGeneratedDocuments({ addendumId })
  if (existing.length > 0) return { generated: false, skipped: true, result: null }
  const result = await generateAddendumDocument(addendumId)
  return { generated: result.success, skipped: false, result }
}

/** Mensaje claro cuando la contratación no puede completarse por falta de plantilla (§16). */
export const missingContractTemplateMessage = (contractTypeName: string | null): string => {
  const type = contractTypeName ? `«${contractTypeName}»` : "este tipo de contrato"
  return `No se puede completar la contratación.\n\nNo existe una plantilla activa para ${type}. Configura la plantilla documental antes de continuar.`
}

/** Mensaje claro cuando el cambio contractual no puede completarse por falta de plantilla de anexo (§43). */
export const MISSING_ADDENDUM_TEMPLATE_MESSAGE =
  "No se puede completar el cambio contractual.\n\nNo existe una plantilla activa de anexo. Configúrela antes de continuar."
