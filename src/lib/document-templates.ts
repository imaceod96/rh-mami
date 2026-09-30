import { supabase } from "@/lib/supabase"
import type { DocumentTypeCode } from "@/lib/document-variables"

/**
 * Fase 11B.1 — Acceso a datos del gestor de plantillas documentales.
 *
 * Reglas:
 *  - Toda decisión crítica (qué variable es válida, qué es obligatorio, qué puede
 *    activarse) vive en la base de datos: este archivo sólo la invoca y tipa.
 *  - El contenido de una plantilla sólo lo interpreta el analizador central
 *    (edge function `analyze-document-template`).
 *  - Los DOCX viven en el bucket privado `document-templates`, bajo la ruta
 *    `entity/{entityId}/templates/{templateId}/v{version}/{kind}-{stamp}.docx`.
 */

export const DOCUMENT_TEMPLATES_BUCKET = "document-templates"

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/** Límite de tamaño por archivo (10 MB). */
export const MAX_TEMPLATE_FILE_BYTES = 10485760

export type DocumentTemplateTypeCode =
  | "EMPLOYMENT_CONTRACT_DETERMINED"
  | "EMPLOYMENT_CONTRACT_INDETERMINED"
  | "EMPLOYMENT_CONTRACT_ADDENDUM"

export type DocumentTemplateVersionStatus = "DRAFT" | "ACTIVE" | "INACTIVE"

export type DocumentTemplateFileKind = "ORIGINAL" | "CONFIGURED"

/** Código de documento de 11A.7 al que pertenece cada tipo de plantilla (§19). */
export const documentTypeCodeForTemplateType = (templateTypeCode: string): DocumentTypeCode =>
  templateTypeCode === "EMPLOYMENT_CONTRACT_ADDENDUM" ? "ADDENDUM" : "CONTRACT"

export interface DocumentTemplateType {
  code: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface TemplateOccurrence {
  key: string
  count: number
  split_runs: number
  sort_order?: number
}

export interface TemplateMalformed {
  part: string
  snippet: string
}

export interface TemplateIncompatibleVariable {
  key: string
  label: string | null
  count: number
}

export interface DocumentTemplateAnalysis {
  analyzed_at: string | null
  file_path: string
  file_kind: DocumentTemplateFileKind
  file_name: string | null
  file_sha256: string | null
  valid_docx: boolean
  zip_signature_ok: boolean
  has_document_xml: boolean
  scanned_parts: string[]
  paragraphs_scanned: number
  occurrences: TemplateOccurrence[]
  /** Variables válidas realmente presentes en el DOCX analizado (§8). */
  recognized: TemplateOccurrence[]
  /** `requiredVariables` de ESTA plantilla, derivadas del DOCX configurado. */
  required_variables: string[]
  unknown_variables: { key: string; count: number }[]
  incompatible_variables: TemplateIncompatibleVariable[]
  malformed_placeholders: TemplateMalformed[]
  split_run_placeholders: number
  warnings: string[]
}

export interface DocumentTemplateVersion {
  id: string
  template_id: string
  organization_entity_id: string
  document_type_code: string
  version_number: number
  status: DocumentTemplateVersionStatus
  effective_from: string | null
  effective_to: string | null
  original_file_path: string | null
  original_file_name: string | null
  original_file_size: number | null
  original_uploaded_at: string | null
  configured_file_path: string | null
  configured_file_name: string | null
  configured_file_size: number | null
  configured_uploaded_at: string | null
  analysis: DocumentTemplateAnalysis | null
  analysis_at: string | null
  created_at: string
  updated_at: string
}

export interface DocumentTemplate {
  id: string
  organization_entity_id: string
  document_type_code: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  versions: DocumentTemplateVersion[]
}

export interface TemplateValidationChecks {
  original_file_present: boolean
  configured_file_present: boolean
  analysis_present: boolean
  analysis_matches_configured: boolean
  valid_docx: boolean
  no_unknown_variables: boolean
  no_incompatible_variables: boolean
  no_malformed_placeholders: boolean
  effective_dates_coherent: boolean
  no_simultaneous_active: boolean
  has_placeholders: boolean
}

export interface TemplateValidation {
  version_id: string
  template_id: string
  document_type_code: string
  version_number: number
  status: DocumentTemplateVersionStatus
  effective_from: string | null
  effective_to: string | null
  original_file_name: string | null
  configured_file_name: string | null
  analyzed_file_path: string | null
  ready: boolean
  checks: TemplateValidationChecks
  variables_found: number
  variables_valid: number
  variables_unknown: number
  variables_incompatible: number
  occurrences_total: number
  occurrences_invalid: number
  required_variables: string[]
  recognized: TemplateOccurrence[]
  unknown_variables: { key: string; count: number }[]
  incompatible_variables: TemplateIncompatibleVariable[]
  malformed_placeholders: TemplateMalformed[]
  warnings: string[]
  analysis: DocumentTemplateAnalysis | null
}

const throwIfError = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message)
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export const fetchDocumentTemplateTypes = async (): Promise<DocumentTemplateType[]> => {
  const { data, error } = await supabase
    .from("document_template_types")
    .select("code, name, description, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order")

  throwIfError(error)
  return (data as DocumentTemplateType[]) || []
}

export const fetchDocumentTemplates = async (
  entityId: string
): Promise<DocumentTemplate[]> => {
  const { data, error } = await supabase
    .from("document_templates")
    .select(
      "id, organization_entity_id, document_type_code, name, description, created_at, updated_at, document_template_versions(*)"
    )
    .eq("organization_entity_id", entityId)
    .order("created_at", { ascending: false })

  throwIfError(error)

  return ((data as unknown as (DocumentTemplate & {
    document_template_versions: DocumentTemplateVersion[]
  })[]) || []).map((row) => ({
    id: row.id,
    organization_entity_id: row.organization_entity_id,
    document_type_code: row.document_type_code,
    name: row.name,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    versions: [...(row.document_template_versions || [])].sort(
      (a, b) => b.version_number - a.version_number
    ),
  }))
}

export const fetchDocumentTemplate = async (
  templateId: string
): Promise<DocumentTemplate | null> => {
  const { data, error } = await supabase
    .from("document_templates")
    .select(
      "id, organization_entity_id, document_type_code, name, description, created_at, updated_at, document_template_versions(*)"
    )
    .eq("id", templateId)
    .maybeSingle()

  throwIfError(error)
  if (!data) return null

  const row = data as unknown as DocumentTemplate & {
    document_template_versions: DocumentTemplateVersion[]
  }

  return {
    id: row.id,
    organization_entity_id: row.organization_entity_id,
    document_type_code: row.document_type_code,
    name: row.name,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    versions: [...(row.document_template_versions || [])].sort(
      (a, b) => b.version_number - a.version_number
    ),
  }
}

/**
 * Claves de variables compatibles con un tipo de plantilla, según el registro
 * central (`document_variables`). OJO: es el catálogo de variables DISPONIBLES,
 * no una lista de variables obligatorias (§4). La plantilla sólo requiere las
 * que realmente contiene su DOCX configurado.
 */
export const fetchCompatibleVariableKeys = async (
  templateTypeCode: string
): Promise<string[]> => {
  const { data, error } = await supabase
    .from("document_variables")
    .select("key")
    .contains("document_types", [templateTypeCode])

  throwIfError(error)
  return ((data as { key: string }[]) || []).map((row) => row.key)
}

/* ------------------------------------------------------------------ */
/* Mutaciones (RPC con autoridad de backend)                           */
/* ------------------------------------------------------------------ */

export interface CreateDocumentTemplateInput {
  entityId: string
  documentTypeCode: DocumentTemplateTypeCode
  name: string
  description?: string | null
  effectiveFrom?: string | null
}

export const createDocumentTemplate = async ({
  entityId,
  documentTypeCode,
  name,
  description,
  effectiveFrom,
}: CreateDocumentTemplateInput): Promise<{
  template_id: string
  version_id: string
  version_number: number
}> => {
  const { data, error } = await supabase.rpc("create_document_template", {
    p_entity_id: entityId,
    p_document_type_code: documentTypeCode,
    p_name: name,
    p_description: description ?? null,
    p_effective_from: effectiveFrom ?? null,
  })

  throwIfError(error)
  return data as { template_id: string; version_id: string; version_number: number }
}

export const createDocumentTemplateVersion = async (
  templateId: string,
  effectiveFrom?: string | null
): Promise<{ version_id: string; version_number: number }> => {
  const { data, error } = await supabase.rpc("create_document_template_version", {
    p_template_id: templateId,
    p_effective_from: effectiveFrom ?? null,
  })

  throwIfError(error)
  return data as { version_id: string; version_number: number }
}

/** Verificación previa en cliente: informe rápido, sin sustituir al backend (§23). */
export const describeTemplateFileProblem = async (file: File): Promise<string | null> => {
  const name = file.name.toLowerCase()
  if (!name.endsWith(".docx")) {
    return "Las plantillas deben estar en formato .docx (no se admiten .doc, .pdf, .odt ni .rtf)."
  }
  if (file.size === 0) {
    return "El archivo está vacío."
  }
  if (file.size > MAX_TEMPLATE_FILE_BYTES) {
    return "El archivo supera el límite permitido de 10 MB."
  }
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (header[0] !== 0x50 || header[1] !== 0x4b) {
    return "El archivo no parece un DOCX válido (no es un paquete Word). Verifique que no sea un PDF u otro formato renombrado."
  }
  return null
}

/** Datos mínimos de la versión necesarios para subir un archivo. */
export type UploadableTemplateVersion = Pick<
  DocumentTemplateVersion,
  "id" | "version_number" | "original_file_path" | "configured_file_path"
>

export interface UploadTemplateFileInput {
  entityId: string
  templateId: string
  version: UploadableTemplateVersion
  kind: DocumentTemplateFileKind
  file: File
}

/**
 * Sube el DOCX al bucket privado, registra la ruta en la versión (el backend
 * invalida el análisis previo) y elimina el archivo reemplazado.
 */
export const uploadTemplateFile = async ({
  entityId,
  templateId,
  version,
  kind,
  file,
}: UploadTemplateFileInput): Promise<string> => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  // Cada carga usa un nombre propio: nunca se sobrescribe un DOCX ya cargado (§22/§29).
  const path = `entity/${entityId}/templates/${templateId}/v${version.version_number}/${kind.toLowerCase()}-${stamp}.docx`

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_TEMPLATES_BUCKET)
    .upload(path, file, { contentType: DOCX_MIME, upsert: false })

  if (uploadError) {
    throw new Error(`No se pudo subir el archivo: ${uploadError.message}`)
  }

  const { error: rpcError } = await supabase.rpc("set_document_template_version_file", {
    p_version_id: version.id,
    p_file_kind: kind,
    p_file_path: path,
    p_file_name: file.name,
    p_file_size: file.size,
  })

  if (rpcError) {
    // La versión no se actualizó: se retira únicamente el archivo recién subido.
    // Los archivos anteriores nunca se eliminan (§29).
    await supabase.storage.from(DOCUMENT_TEMPLATES_BUCKET).remove([path])
    throw new Error(rpcError.message)
  }

  return path
}

export const saveTemplateAnalysis = async (
  versionId: string,
  analysis: unknown
): Promise<DocumentTemplateAnalysis> => {
  const { data, error } = await supabase.rpc("save_document_template_analysis", {
    p_version_id: versionId,
    p_analysis: analysis,
  })

  throwIfError(error)
  return data as DocumentTemplateAnalysis
}

export const validateTemplateVersion = async (
  versionId: string
): Promise<TemplateValidation> => {
  const { data, error } = await supabase.rpc("validate_document_template_version", {
    p_version_id: versionId,
  })

  throwIfError(error)
  return data as TemplateValidation
}

export const activateTemplateVersion = async (versionId: string): Promise<{
  status: "ACTIVATED" | "ALREADY_ACTIVE"
  version_id: string
  effective_from: string | null
  deactivated_previous?: { version_id: string; version_number: number; effective_to: string | null }[]
}> => {
  const { data, error } = await supabase.rpc("activate_document_template_version", {
    p_version_id: versionId,
  })

  throwIfError(error)
  return data as {
    status: "ACTIVATED" | "ALREADY_ACTIVE"
    version_id: string
    effective_from: string | null
    deactivated_previous?: { version_id: string; version_number: number; effective_to: string | null }[]
  }
}

export const deactivateTemplateVersion = async (versionId: string): Promise<{
  status: "DEACTIVATED" | "ALREADY_INACTIVE"
  version_id: string
  effective_to: string | null
}> => {
  const { data, error } = await supabase.rpc("deactivate_document_template_version", {
    p_version_id: versionId,
  })

  throwIfError(error)
  return data as {
    status: "DEACTIVATED" | "ALREADY_INACTIVE"
    version_id: string
    effective_to: string | null
  }
}

/* ------------------------------------------------------------------ */
/* Analizador central (§79)                                            */
/* ------------------------------------------------------------------ */

/** Analiza un DOCX mediante el analizador central y persiste el resultado validado. */
export const analyzeAndStoreTemplateFile = async (
  versionId: string,
  filePath: string
): Promise<DocumentTemplateAnalysis> => {
  const { data, error } = await supabase.functions.invoke("analyze-document-template", {
    body: { file_path: filePath },
  })

  if (error) {
    throw new Error(
      (data as { error?: string } | null)?.error ||
        "No se pudo analizar la plantilla documental."
    )
  }

  const failure = (data as { error?: string } | null)?.error
  if (failure) {
    throw new Error(failure)
  }

  return saveTemplateAnalysis(versionId, data)
}

/* ------------------------------------------------------------------ */
/* Archivos                                                            */
/* ------------------------------------------------------------------ */

export const getTemplateFileUrl = async (path: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_TEMPLATES_BUCKET)
    .createSignedUrl(path, 600)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export const formatTemplateFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const templateVersionPeriodLabel = (
  version: Pick<DocumentTemplateVersion, "effective_from" | "effective_to" | "status">
): string => {
  if (version.status === "DRAFT") return "Sin vigencia (borrador)"
  if (!version.effective_from) return "Vigente sin fecha de inicio"
  const from = version.effective_from.split("-").reverse().join("/")
  if (!version.effective_to) return `Desde ${from} · vigente`
  const to = version.effective_to.split("-").reverse().join("/")
  return `Del ${from} al ${to}`
}
