import { supabase } from "@/lib/supabase"
import {
  DOCUMENT_TEMPLATES_BUCKET,
  DOCX_MIME,
} from "@/lib/document-templates"
import {
  DOCUMENT_VARIABLES,
  documentVariableByKey,
  resolveAllDocumentVariables,
} from "@/lib/document-variables"
import {
  getAddendumDocumentData,
  getContractDocumentData,
  getSc404DocumentData,
  type DocumentData,
  type Sc404SourceType,
} from "@/lib/document-data"
import { renderDocx } from "@/lib/docx-render"

/**
 * Fase 11B.2 — Servicio central de generación documental.
 *
 *   CONTRATO / ANEXO  →  SNAPSHOTS  →  VARIABLES 11A.7  →  PLANTILLA 11B.1  →  DOCX FINAL
 *
 * Reglas:
 *  - La generación es HISTÓRICAMENTE REPRODUCIBLE: se resuelve desde el contrato/anexo
 *    y sus snapshots (vía los resolvers de 11A.7), nunca desde el estado vivo.
 *  - Una vez fijada `document_template_version_id` en la fuente, las regeneraciones
 *    usan SIEMPRE esa misma versión, aunque exista una versión más nueva.
 *  - Nunca se inventan datos: una variable requerida por ESA plantilla sin valor
 *    bloquea la generación.
 */

export const WORKER_DOCUMENTS_BUCKET = "documents"

export type GenerationDocumentKind = "CONTRACT" | "ADDENDUM" | "VACATION" | "MEDICAL_CERTIFICATE"

const isSc404Kind = (kind: GenerationDocumentKind): kind is Sc404SourceType =>
  kind === "VACATION" || kind === "MEDICAL_CERTIFICATE"

export type TemplateResolutionStatus = "PINNED" | "RESOLVED" | "NONE" | "AMBIGUOUS"

export interface TemplateResolution {
  status: TemplateResolutionStatus
  versionId: string | null
  versionNumber: number | null
  versionStatus: string | null
  versionUsable: boolean
  templateName: string | null
  effectiveFrom: string | null
  effectiveTo: string | null
  configuredFilePath: string | null
  configuredFileFormat: string | null
  referenceDate: string
  documentTypeCode: string
}

export type GenerationBlockedReason =
  | "NOT_FORMALIZED"
  | "TEMPLATE_NONE"
  | "TEMPLATE_AMBIGUOUS"
  | "TEMPLATE_UNUSABLE"
  | "NO_ANALYSIS"
  | "MISSING_DATA"
  | null

export interface MissingVariable {
  key: string
  label: string
  hint: string | null
}

export interface DocumentGenerationPrecheck {
  kind: GenerationDocumentKind
  sourceId: string
  workerId: string
  entityId: string
  formalized: boolean
  documentTypeLabel: string
  template: TemplateResolution
  requiredVariables: string[]
  missingVariables: MissingVariable[]
  ready: boolean
  blockedReason: GenerationBlockedReason
  /** Valores ya resueltos y formateados por 11A.7 (uso interno del motor). */
  resolvedValues: Record<string, string>
  documentData: DocumentData
}

export interface DocumentGenerationResult {
  success: boolean
  generationId?: string
  templateVersionId?: string
  workerDocumentId?: string
  generationNumber?: number
  docxPath?: string
  pdfPath?: string | null
  missingVariables?: { key: string; label: string }[]
  error?: string
}

export interface GeneratedDocumentRow {
  id: string
  worker_id: string
  file_name: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  generation_number: number | null
  created_at: string
  document_template_version_id: string | null
  version_number: number | null
  template_name: string | null
}

/* ------------------------------------------------------------------ */
/* Etiquetas                                                           */
/* ------------------------------------------------------------------ */

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  EMPLOYMENT_CONTRACT_DETERMINED: "Contrato de Trabajo por Tiempo Determinado",
  EMPLOYMENT_CONTRACT_INDETERMINED: "Contrato de Trabajo por Tiempo Indeterminado",
  EMPLOYMENT_CONTRACT_ADDENDUM: "Anexo al Contrato de Trabajo",
  SC_4_04: "Modelo SC-4-04 — Notificación de Vacaciones, Deducciones, Licencias y Subsidios",
}

/** Dónde puede corregirse cada variable (§66). Sin navegación inteligente. */
const VARIABLE_FIX_HINTS: Record<string, string> = {
  "worker.profession": "Datos personales del trabajador",
  "worker.address": "Datos personales del trabajador",
  "worker.province": "Datos personales del trabajador",
  "worker.municipality": "Datos personales del trabajador",
  "worker.birth_date": "Datos personales del trabajador",
  "worker.identification": "Datos personales del trabajador",
  "contract.payment_schedule": "Contrato (condiciones contractuales)",
  "contract.payment_method": "Contrato (condiciones contractuales)",
  "contract.signature_place": "Contrato (datos de firma)",
  "entity.organism": "Datos contractuales de la entidad",
  "entity.branch": "Datos contractuales de la entidad",
  "entity.address": "Datos contractuales de la entidad",
  "entity.revolution_year": "Datos contractuales de la entidad",
  "representative.name": "Datos contractuales de la entidad (representantes)",
  "representative.position": "Datos contractuales de la entidad (representantes)",
}

export const documentVariableHint = (key: string): string | null => VARIABLE_FIX_HINTS[key] ?? null

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const result = typeof value === "string" ? value.trim() : String(value)
  return result === "" ? null : result
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const throwIfError = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message)
}

/* ------------------------------------------------------------------ */
/* Selección de plantilla                                              */
/* ------------------------------------------------------------------ */

export const documentTypeCodeForContractType = (contractTypeCode: string | null): string | null => {
  if (contractTypeCode === "DETERMINADO") return "EMPLOYMENT_CONTRACT_DETERMINED"
  if (contractTypeCode === "INDETERMINADO") return "EMPLOYMENT_CONTRACT_INDETERMINED"
  return null
}

interface SourceContext {
  kind: GenerationDocumentKind
  sourceId: string
  workerId: string
  entityId: string
  formalized: boolean
  referenceDate: string
  documentTypeCode: string | null
  pinnedVersionId: string | null
}

const loadSourceContext = async (kind: GenerationDocumentKind, sourceId: string): Promise<SourceContext> => {
  if (isSc404Kind(kind)) {
    return loadSc404SourceContext(kind, sourceId)
  }
  if (kind === "CONTRACT") {
    const { data, error } = await supabase
      .from("employment_contracts")
      .select(
        "id, worker_id, organization_entity_id, start_date, signature_date, document_template_version_id, contract_type_id, employment_contract_types(code)"
      )
      .eq("id", sourceId)
      .maybeSingle()
    throwIfError(error)
    const row = record(data)
    if (!row.id) throw new Error("Contrato no encontrado")
    const typeCode = text(record(row.employment_contract_types).code)
    return {
      kind,
      sourceId,
      workerId: String(row.worker_id),
      entityId: String(row.organization_entity_id),
      formalized: row.signature_date != null,
      referenceDate: text(row.signature_date) ?? text(row.start_date) ?? new Date().toISOString().slice(0, 10),
      documentTypeCode: documentTypeCodeForContractType(typeCode),
      pinnedVersionId: text(row.document_template_version_id),
    }
  }

  const { data, error } = await supabase
    .from("contract_addendums")
    .select(
      "id, worker_id, organization_entity_id, effective_date, signature_date, status, document_template_version_id"
    )
    .eq("id", sourceId)
    .maybeSingle()
  throwIfError(error)
  const row = record(data)
  if (!row.id) throw new Error("Anexo no encontrado")
  return {
    kind,
    sourceId,
    workerId: String(row.worker_id),
    entityId: String(row.organization_entity_id),
    formalized: text(row.status) === "FORMALIZED",
    referenceDate: text(row.signature_date) ?? text(row.effective_date) ?? new Date().toISOString().slice(0, 10),
    documentTypeCode: "EMPLOYMENT_CONTRACT_ADDENDUM",
    pinnedVersionId: text(row.document_template_version_id),
  }
}

const loadSc404SourceContext = async (
  kind: "VACATION" | "MEDICAL_CERTIFICATE",
  sourceId: string
): Promise<SourceContext> => {
  if (kind === "VACATION") {
    const { data, error } = await supabase
      .from("worker_vacations")
      .select("id, worker_id, organization_entity_id, start_date, status")
      .eq("id", sourceId)
      .maybeSingle()
    throwIfError(error)
    const row = record(data)
    if (!row.id) throw new Error("Período de vacaciones no encontrado")
    if (text(row.status) === "CANCELLED") {
      throw new Error("No se puede generar el documento de un período cancelado")
    }
    return {
      kind,
      sourceId,
      workerId: String(row.worker_id),
      entityId: String(row.organization_entity_id),
      formalized: true,
      referenceDate: text(row.start_date) ?? new Date().toISOString().slice(0, 10),
      documentTypeCode: "SC_4_04",
      pinnedVersionId: null,
    }
  }

  const { data, error } = await supabase
    .from("worker_medical_certificates")
    .select("id, worker_id, organization_entity_id, start_date")
    .eq("id", sourceId)
    .maybeSingle()
  throwIfError(error)
  const row = record(data)
  if (!row.id) throw new Error("Certificado médico no encontrado")
  return {
    kind,
    sourceId,
    workerId: String(row.worker_id),
    entityId: String(row.organization_entity_id),
    formalized: true,
    referenceDate: text(row.start_date) ?? new Date().toISOString().slice(0, 10),
    documentTypeCode: "SC_4_04",
    pinnedVersionId: null,
  }
}

const loadVersion = async (versionId: string): Promise<TemplateResolution & { requiredVariables: string[]; analysisPresent: boolean }> => {
  const { data, error } = await supabase
    .from("document_template_versions")
    .select(
      "id, version_number, status, effective_from, effective_to, configured_file_path, configured_file_format, analysis, document_type_code, document_templates(name)"
    )
    .eq("id", versionId)
    .maybeSingle()
  throwIfError(error)
  const row = record(data)
  const analysis = record(row.analysis)
  const required = Array.isArray(analysis.required_variables)
    ? (analysis.required_variables as unknown[]).map((value) => String(value))
    : []
  const format = text(row.configured_file_format)
  return {
    status: "PINNED",
    versionId: text(row.id),
    versionNumber: num(row.version_number),
    versionStatus: text(row.status),
    versionUsable: format === "DOCX" && text(row.configured_file_path) != null,
    templateName: text(record(row.document_templates).name),
    effectiveFrom: text(row.effective_from),
    effectiveTo: text(row.effective_to),
    configuredFilePath: text(row.configured_file_path),
    configuredFileFormat: format,
    referenceDate: "",
    documentTypeCode: text(row.document_type_code) ?? "",
    requiredVariables: required,
    analysisPresent: row.analysis != null && required.length > 0,
  }
}

export const resolveTemplateVersionForDocument = async (
  context: SourceContext
): Promise<{ template: TemplateResolution; requiredVariables: string[]; analysisPresent: boolean }> => {
  if (context.pinnedVersionId) {
    const pinned = await loadVersion(context.pinnedVersionId)
    return {
      template: { ...pinned, referenceDate: context.referenceDate, status: "PINNED" },
      requiredVariables: pinned.requiredVariables,
      analysisPresent: pinned.analysisPresent,
    }
  }

  if (!context.documentTypeCode) {
    return {
      template: {
        status: "NONE",
        versionId: null,
        versionNumber: null,
        versionStatus: null,
        versionUsable: false,
        templateName: null,
        effectiveFrom: null,
        effectiveTo: null,
        configuredFilePath: null,
        configuredFileFormat: null,
        referenceDate: context.referenceDate,
        documentTypeCode: "",
      },
      requiredVariables: [],
      analysisPresent: false,
    }
  }

  const { data, error } = await supabase.rpc("resolve_document_template_version", {
    p_entity_id: context.entityId,
    p_document_type_code: context.documentTypeCode,
    p_reference_date: context.referenceDate,
  })
  throwIfError(error)

  const result = record(data)
  const status = text(result.status) as TemplateResolutionStatus | null

  if (status === "RESOLVED" && result.version_id) {
    const loaded = await loadVersion(String(result.version_id))
    return {
      template: {
        ...loaded,
        status: "RESOLVED",
        referenceDate: context.referenceDate,
        templateName: loaded.templateName ?? text(result.template_name),
      },
      requiredVariables: loaded.requiredVariables,
      analysisPresent: loaded.analysisPresent,
    }
  }

  return {
    template: {
      status: status === "AMBIGUOUS" ? "AMBIGUOUS" : "NONE",
      versionId: null,
      versionNumber: null,
      versionStatus: null,
      versionUsable: false,
      templateName: null,
      effectiveFrom: null,
      effectiveTo: null,
      configuredFilePath: null,
      configuredFileFormat: null,
      referenceDate: context.referenceDate,
      documentTypeCode: context.documentTypeCode,
    },
    requiredVariables: [],
    analysisPresent: false,
  }
}

/* ------------------------------------------------------------------ */
/* Precheck                                                            */
/* ------------------------------------------------------------------ */

export const precheckDocumentGeneration = async (
  kind: GenerationDocumentKind,
  sourceId: string
): Promise<DocumentGenerationPrecheck> => {
  const context = await loadSourceContext(kind, sourceId)
  const { template, requiredVariables, analysisPresent } = await resolveTemplateVersionForDocument(context)

  const documentData: DocumentData = isSc404Kind(kind)
    ? await getSc404DocumentData(kind, sourceId)
    : kind === "CONTRACT"
      ? await getContractDocumentData(sourceId)
      : await getAddendumDocumentData(sourceId)

  const resolved = resolveAllDocumentVariables(documentData)
  // SC-4-04 (§26): las variables no aplicables al origen se sustituyen por
  // cadena vacía y NO bloquean. Sólo bloquean los datos nucleares del modelo.
  const SC404_CRITICAL_KEYS = new Set([
    "entity.name",
    "worker.full_name",
    "worker.identification",
    "sc404.fecha_desde",
    "sc404.dias",
  ])
  const missingKeyList = isSc404Kind(kind)
    ? requiredVariables.filter((key) => !(key in resolved.values) && SC404_CRITICAL_KEYS.has(key))
    : requiredVariables.filter((key) => !(key in resolved.values))
  const missing: MissingVariable[] = missingKeyList
    .map((key) => ({
      key,
      label: documentVariableByKey(key)?.label ?? key,
      hint: documentVariableHint(key),
    }))

  let blockedReason: GenerationBlockedReason = null
  if (!context.formalized) blockedReason = "NOT_FORMALIZED"
  else if (template.status === "NONE") blockedReason = "TEMPLATE_NONE"
  else if (template.status === "AMBIGUOUS") blockedReason = "TEMPLATE_AMBIGUOUS"
  else if (!template.versionId) blockedReason = "TEMPLATE_NONE"
  else if (!template.versionUsable) blockedReason = "TEMPLATE_UNUSABLE"
  else if (!analysisPresent) blockedReason = "NO_ANALYSIS"
  else if (missing.length > 0) blockedReason = "MISSING_DATA"

  return {
    kind,
    sourceId,
    workerId: context.workerId,
    entityId: context.entityId,
    formalized: context.formalized,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[template.documentTypeCode] ?? "Documento contractual",
    template,
    requiredVariables,
    missingVariables: missing,
    ready: blockedReason === null,
    blockedReason,
    resolvedValues: resolved.values,
    documentData,
  }
}

export const precheckContractDocument = (contractId: string) =>
  precheckDocumentGeneration("CONTRACT", contractId)

export const precheckAddendumDocument = (addendumId: string) =>
  precheckDocumentGeneration("ADDENDUM", addendumId)

/* ------------------------------------------------------------------ */
/* Nombre humano del archivo (§37)                                     */
/* ------------------------------------------------------------------ */

const slug = (value: string | null | undefined): string => {
  if (!value) return ""
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export const buildGeneratedDocumentName = (
  precheck: DocumentGenerationPrecheck,
  dateIso: string
): string => {
  const workerName = slug(precheck.documentData.worker.full_name)
  const base =
    precheck.kind === "ADDENDUM"
      ? ["Anexo", "Contrato", workerName]
      : isSc404Kind(precheck.kind)
        ? ["SC-4-04", workerName]
        : [
          "Contrato",
          precheck.template.documentTypeCode === "EMPLOYMENT_CONTRACT_DETERMINED"
            ? "Determinado"
            : precheck.template.documentTypeCode === "EMPLOYMENT_CONTRACT_INDETERMINED"
              ? "Indeterminado"
              : null,
          workerName,
        ]
  const parts = base.map((part) => slug(part ?? "")).filter((part) => part !== "")
  return `${parts.join("_")}_${dateIso}.docx`
}

/* ------------------------------------------------------------------ */
/* Persistencia de la versión fijada                                   */
/* ------------------------------------------------------------------ */

const pinTemplateVersion = async (
  kind: GenerationDocumentKind,
  sourceId: string,
  versionId: string
): Promise<void> => {
  const rpc =
    kind === "CONTRACT" ? "set_contract_document_template_version" : "set_addendum_document_template_version"
  const params =
    kind === "CONTRACT"
      ? { p_contract_id: sourceId, p_version_id: versionId }
      : { p_addendum_id: sourceId, p_version_id: versionId }
  const { error } = await supabase.rpc(rpc, params)
  throwIfError(error)
}

/* ------------------------------------------------------------------ */
/* Generación                                                          */
/* ------------------------------------------------------------------ */

const failed = (error: string, extra?: Partial<DocumentGenerationResult>): DocumentGenerationResult => ({
  success: false,
  error,
  pdfPath: null,
  ...extra,
})

const runGeneration = async (
  kind: GenerationDocumentKind,
  sourceId: string
): Promise<DocumentGenerationResult> => {
  let precheck: DocumentGenerationPrecheck
  try {
    precheck = await precheckDocumentGeneration(kind, sourceId)
  } catch (err) {
    return failed(err instanceof Error ? err.message : "No se pudo preparar la generación del documento")
  }

  if (!precheck.ready) {
    if (precheck.blockedReason === "MISSING_DATA") {
      return failed("Faltan datos requeridos por esta plantilla", {
        missingVariables: precheck.missingVariables.map(({ key, label }) => ({ key, label })),
      })
    }
    return failed(BLOCKED_MESSAGES[precheck.blockedReason ?? "TEMPLATE_NONE"])
  }

  const versionId = precheck.template.versionId as string
  const configuredPath = precheck.template.configuredFilePath as string

  // 1) Cargar el DOCUMENTO CONFIGURADO de la plantilla (nunca el original sin configurar).
  let sourceBytes: Uint8Array
  try {
    const { data, error } = await supabase.storage.from(DOCUMENT_TEMPLATES_BUCKET).download(configuredPath)
    if (error || !data) throw error ?? new Error("La plantilla no tiene un documento configurado válido")
    sourceBytes = new Uint8Array(await data.arrayBuffer())
  } catch (err) {
    return failed(
      err instanceof Error ? err.message : "No se pudo cargar el documento configurado de la plantilla"
    )
  }

  // 2) Sustituir sobre una COPIA (el paquete de origen no se modifica).
  const knownKeys = DOCUMENT_VARIABLES.map((definition) => definition.key)
  // SC-4-04 (§26/§85): toda variable conocida del ámbito SC_4_04 parte de ""
  // y luego se sobrescribe con los valores resueltos: los campos no aplicables
  // al origen quedan visualmente vacíos (nunca «null» ni marcador residual).
  const renderValues: Record<string, string> = isSc404Kind(kind)
    ? {
        ...Object.fromEntries(
          DOCUMENT_VARIABLES.filter((definition) => definition.documentTypes.includes("SC_4_04")).map(
            (definition) => [definition.key, ""]
          )
        ),
        ...precheck.resolvedValues,
      }
    : precheck.resolvedValues
  let rendered
  try {
    rendered = await renderDocx(sourceBytes, renderValues, knownKeys)
  } catch (err) {
    return failed(err instanceof Error ? err.message : "No se pudo procesar el documento de la plantilla")
  }

  if (rendered.unknownKeys.length > 0) {
    return failed(
      `La plantilla usa variables desconocidas para el sistema: ${rendered.unknownKeys.join(", ")}. Corrija la plantilla antes de generar el documento.`
    )
  }
  if (rendered.leftoverKeys.length > 0) {
    return failed(
      `No se pudieron sustituir todas las variables del documento: ${rendered.leftoverKeys.join(", ")}.`
    )
  }

  // 3) Fijar la versión de plantilla en la fuente antes de reservar la generación (§9).
  //    SC-4-04: los orígenes (vacaciones/certificados) no fijan versión; la
  //    trazabilidad vive en worker_documents.document_template_version_id.
  if (!isSc404Kind(kind) && precheck.template.status === "RESOLVED") {
    try {
      await pinTemplateVersion(kind, sourceId, versionId)
    } catch (err) {
      return failed(err instanceof Error ? err.message : "No se pudo fijar la versión de plantilla")
    }
  }

  // 4) Reservar la generación (idempotencia: una sola en curso por fuente).
  let reservation: { worker_document_id: string; generation_number: number; storage_path: string }
  try {
    const { data, error } = isSc404Kind(kind)
      ? await supabase.rpc("begin_sc404_generation", {
          p_source_type: kind,
          p_source_id: sourceId,
          p_template_version_id: versionId,
        })
      : await supabase.rpc("begin_document_generation", {
          p_employment_contract_id: kind === "CONTRACT" ? sourceId : null,
          p_contract_addendum_id: kind === "ADDENDUM" ? sourceId : null,
          p_template_version_id: versionId,
        })
    throwIfError(error)
    const row = record(data)
    reservation = {
      worker_document_id: String(row.worker_document_id),
      generation_number: num(row.generation_number) ?? 1,
      storage_path: String(row.storage_path),
    }
  } catch (err) {
    return failed(err instanceof Error ? err.message : "No se pudo reservar la generación del documento")
  }

  // 5) Subir el DOCX final al expediente del trabajador.
  const docxBlob = new Blob([rendered.bytes], { type: DOCX_MIME })
  const { error: uploadError } = await supabase.storage
    .from(WORKER_DOCUMENTS_BUCKET)
    .upload(reservation.storage_path, docxBlob, { contentType: DOCX_MIME, upsert: false })

  if (uploadError) {
    await supabase.rpc("fail_document_generation", {
      p_worker_document_id: reservation.worker_document_id,
      p_reason: uploadError.message,
    })
    return failed(`No se pudo guardar el documento generado: ${uploadError.message}`)
  }

  // 6) Registrar el documento y relacionarlo con el contrato/anexo.
  const fileName = buildGeneratedDocumentName(precheck, precheck.template.referenceDate)
  const { error: completeError } = await supabase.rpc("complete_document_generation", {
    p_worker_document_id: reservation.worker_document_id,
    p_file_name: fileName,
    p_file_size: rendered.bytes.byteLength,
    p_mime_type: DOCX_MIME,
  })

  if (completeError) {
    // Storage recibió el archivo pero la base de datos falló: se retira el huérfano (§55).
    await supabase.storage.from(WORKER_DOCUMENTS_BUCKET).remove([reservation.storage_path])
    await supabase.rpc("fail_document_generation", {
      p_worker_document_id: reservation.worker_document_id,
      p_reason: completeError.message,
    })
    return failed(`No se pudo registrar el documento generado: ${completeError.message}`)
  }

  return {
    success: true,
    generationId: reservation.worker_document_id,
    workerDocumentId: reservation.worker_document_id,
    templateVersionId: versionId,
    generationNumber: reservation.generation_number,
    docxPath: reservation.storage_path,
    // PDF: sólo se genera si existe un conversor fiable en el entorno. No hay
    // conversor DOCX→PDF de servidor disponible, así que no se produce un PDF falso.
    pdfPath: null,
  }
}

export const BLOCKED_MESSAGES: Record<string, string> = {
  NOT_FORMALIZED: "Solo se puede generar el documento de un contrato o anexo formalizado.",
  TEMPLATE_NONE:
    "No existe una versión de plantilla aplicable a la fecha de este documento.",
  TEMPLATE_AMBIGUOUS:
    "Existe más de una versión de plantilla aplicable a la fecha de este documento. Revise la vigencia de las plantillas.",
  TEMPLATE_UNUSABLE:
    "La versión de plantilla aplicable no tiene un documento Word configurado en formato .docx.",
  NO_ANALYSIS: "La versión de plantilla aplicable no tiene un análisis de variables válido.",
  MISSING_DATA: "Faltan datos requeridos por esta plantilla.",
}

export const generateContractDocument = (contractId: string) =>
  runGeneration("CONTRACT", contractId)

export const generateAddendumDocument = (addendumId: string) =>
  runGeneration("ADDENDUM", addendumId)

/** Prefijo de error controlado emitido por begin_sc404_generation (§48). */
export const SC404_ALREADY_EXISTS_PREFIX = "SC404_ALREADY_EXISTS|"

export const parseSc404ExistingId = (message: string | undefined | null): string | null => {
  if (!message) return null
  return message.startsWith(SC404_ALREADY_EXISTS_PREFIX)
    ? message.slice(SC404_ALREADY_EXISTS_PREFIX.length)
    : null
}

export const generateSc404Document = (sourceType: Sc404SourceType, sourceId: string) =>
  runGeneration(sourceType, sourceId)

export const precheckSc404Document = (sourceType: Sc404SourceType, sourceId: string) =>
  precheckDocumentGeneration(sourceType, sourceId)

/* ------------------------------------------------------------------ */
/* Consulta y descarga                                                 */
/* ------------------------------------------------------------------ */

export const fetchGeneratedDocuments = async (
  source: { contractId?: string; addendumId?: string; vacationId?: string; certificateId?: string }
): Promise<GeneratedDocumentRow[]> => {
  let query = supabase
    .from("worker_documents")
    .select(
      "id, worker_id, file_name, storage_path, file_size, mime_type, generation_number, created_at, document_template_version_id"
    )
    .eq("source", "GENERATED")
    .eq("generation_status", "COMPLETED")
    .order("generation_number", { ascending: true })

  if (source.contractId) {
    query = query.eq("employment_contract_id", source.contractId)
  } else if (source.addendumId) {
    query = query.eq("contract_addendum_id", source.addendumId)
  } else if (source.vacationId) {
    query = query.eq("document_source_type", "VACATION").eq("document_source_id", source.vacationId)
  } else if (source.certificateId) {
    query = query
      .eq("document_source_type", "MEDICAL_CERTIFICATE")
      .eq("document_source_id", source.certificateId)
  }

  const { data, error } = await query
  throwIfError(error)

  const rows = ((data as unknown[]) || []).map((raw) => record(raw))

  // Resolución del nombre de plantilla y del número de versión: en dos consultas
  // planas, para no depender de la anidación de PostgREST.
  const versionIds = Array.from(
    new Set(rows.map((row) => text(row.document_template_version_id)).filter((id): id is string => !!id))
  )

  const versionNumbers: Record<string, number | null> = {}
  const templateNames: Record<string, string | null> = {}

  if (versionIds.length > 0) {
    const { data: versions } = await supabase
      .from("document_template_versions")
      .select("id, version_number, template_id")
      .in("id", versionIds)

    const templateIds = new Set<string>()
    ;((versions as unknown[]) || []).forEach((raw) => {
      const version = record(raw)
      const id = text(version.id)
      if (!id) return
      versionNumbers[id] = num(version.version_number)
      const templateId = text(version.template_id)
      if (templateId) templateIds.add(templateId)
    })

    if (templateIds.size > 0) {
      const { data: templates } = await supabase
        .from("document_templates")
        .select("id, name")
        .in("id", [...templateIds])
      ;((templates as unknown[]) || []).forEach((raw) => {
        const template = record(raw)
        const id = text(template.id)
        if (id) templateNames[id] = text(template.name)
      })
      ;((versions as unknown[]) || []).forEach((raw) => {
        const version = record(raw)
        const versionId = text(version.id)
        const templateId = text(version.template_id)
        if (versionId && templateId) templateNames[versionId] = templateNames[templateId] ?? null
      })
    }
  }

  return rows.map((row) => {
    const versionId = text(row.document_template_version_id)
    return {
      id: String(row.id),
      worker_id: String(row.worker_id),
      file_name: String(row.file_name),
      storage_path: String(row.storage_path),
      file_size: num(row.file_size),
      mime_type: text(row.mime_type),
      generation_number: num(row.generation_number),
      created_at: String(row.created_at),
      document_template_version_id: versionId,
      version_number: versionId ? versionNumbers[versionId] ?? null : null,
      template_name: versionId ? templateNames[versionId] ?? null : null,
    }
  })
}

export const createGeneratedDocumentUrl = async (storagePath: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from(WORKER_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export const downloadGeneratedDocument = async (document: GeneratedDocumentRow): Promise<void> => {
  const { data, error } = await supabase.storage
    .from(WORKER_DOCUMENTS_BUCKET)
    .download(document.storage_path)
  if (error || !data) throw error ?? new Error("No se pudo descargar el documento")

  const url = URL.createObjectURL(data)
  const link = window.document.createElement("a")
  link.href = url
  link.download = document.file_name
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const formatGenerationMoment = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${day}/${month}/${date.getFullYear()} ${hours}:${minutes}`
}
