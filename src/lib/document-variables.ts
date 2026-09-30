import { toRomanNumeral } from "@/utils/roman-numerals"
import type {
  AddendumDocumentData,
  ContractDocumentData,
  DocumentData,
} from "@/lib/document-data"

/**
 * Fase 11A.7 — Registro central de variables documentales.
 *
 *   DATOS DEL NEGOCIO → RESOLUCIÓN DOCUMENTAL (SQL) → VARIABLES (este archivo) → PLANTILLA DOCX (11B.1)
 *
 * Las keys son la API interna documental de SiteCorp: una plantilla NUNCA sabe
 * de qué tablas viene la información, sólo solicita una key estable
 * (`worker.full_name`, `entity.revolution_year`, …).
 *
 * Este archivo NO genera documentos: sólo describe, resuelve y formatea.
 */

export type DocumentTypeCode = "CONTRACT" | "ADDENDUM"

export type DocumentVariableDataType = "text" | "integer" | "amount" | "date" | "hours"

/** SOURCE: proviene de datos/snapshots. CALCULATED: se deriva de otros datos (nunca se persiste). */
export type DocumentVariableKind = "SOURCE" | "CALCULATED"

export interface DocumentVariableDefinition {
  key: string
  label: string
  category:
    | "Entidad"
    | "Representante"
    | "Trabajador"
    | "Cargo y Puesto"
    | "Jornada"
    | "Contrato"
    | "Retribución"
    | "Anexo"
  documentTypes: DocumentTypeCode[]
  dataType: DocumentVariableDataType
  kind: DocumentVariableKind
  description: string
}

export interface DocumentVariableResolution {
  status: "value" | "missing"
  value: string | null
}

const BOTH: DocumentTypeCode[] = ["CONTRACT", "ADDENDUM"]

/** Catálogo global de variables documentales (no pertenece a ningún tenant). */
export const DOCUMENT_VARIABLES: DocumentVariableDefinition[] = [
  // ---------------- Entidad ----------------
  { key: "entity.name", label: "Nombre de la entidad", category: "Entidad", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Snapshot contractual de la entidad firmante." },
  { key: "entity.organism", label: "Organismo", category: "Entidad", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Organismo al que pertenece la entidad (snapshot)." },
  { key: "entity.branch", label: "Rama", category: "Entidad", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Rama de la entidad (snapshot)." },
  { key: "entity.labor_code", label: "Código laboral/organizacional", category: "Entidad", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Código de identificación laboral (snapshot)." },
  { key: "entity.address", label: "Dirección de la entidad", category: "Entidad", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Dirección de la entidad (snapshot)." },
  { key: "entity.province", label: "Provincia de la entidad", category: "Entidad", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Provincia de la entidad (snapshot)." },
  { key: "entity.municipality", label: "Municipio de la entidad", category: "Entidad", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Municipio de la entidad (snapshot)." },
  { key: "entity.revolution_year", label: "Año de la Revolución", category: "Entidad", documentTypes: BOTH, dataType: "integer", kind: "SOURCE", description: "Valor institucional configurado por entidad y preservado en el snapshot (nunca se calcula)." },

  // ---------------- Representante ----------------
  { key: "representative.name", label: "Nombre del representante", category: "Representante", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Representante histórico que suscribió el documento (snapshot)." },
  { key: "representative.position", label: "Cargo del representante", category: "Representante", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Cargo del representante histórico (snapshot)." },

  // ---------------- Trabajador ----------------
  { key: "worker.full_name", label: "Nombre completo", category: "Trabajador", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Nombre y apellidos del trabajador." },
  { key: "worker.identification", label: "Carné de identidad", category: "Trabajador", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Carné de identidad del trabajador." },
  { key: "worker.birth_date", label: "Fecha de nacimiento", category: "Trabajador", documentTypes: BOTH, dataType: "date", kind: "SOURCE", description: "Fecha de nacimiento del trabajador." },
  { key: "worker.profession", label: "Profesión u oficio", category: "Trabajador", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Profesión u oficio (dato profesional, no nivel de estudios)." },
  { key: "worker.address", label: "Dirección del trabajador", category: "Trabajador", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Dirección particular del trabajador." },
  { key: "worker.province", label: "Provincia del trabajador", category: "Trabajador", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Provincia de residencia del trabajador." },
  { key: "worker.municipality", label: "Municipio del trabajador", category: "Trabajador", documentTypes: BOTH, dataType: "text", kind: "SOURCE", description: "Municipio de residencia del trabajador." },

  // ---------------- Cargo y Puesto ----------------
  { key: "job.name", label: "Cargo", category: "Cargo y Puesto", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Cargo del trabajador según condiciones formalizadas vigentes." },
  { key: "job.salary_group", label: "Grupo salarial", category: "Cargo y Puesto", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Grupo salarial en números romanos (p. ej. XII)." },
  { key: "job.occupational_category", label: "Categoría ocupacional", category: "Cargo y Puesto", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Categoría ocupacional del cargo." },
  { key: "position.name", label: "Puesto de trabajo", category: "Cargo y Puesto", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Puesto que ocupa el trabajador." },
  { key: "position.code", label: "Código del puesto", category: "Cargo y Puesto", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Código del puesto formalizado (tras anexos de cambio de puesto)." },
  { key: "position.work_location", label: "Lugar de trabajo", category: "Cargo y Puesto", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Lugar de trabajo según condiciones formalizadas." },

  // ---------------- Jornada ----------------
  { key: "schedule.daily_hours", label: "Horas diarias", category: "Jornada", documentTypes: ["CONTRACT"], dataType: "hours", kind: "SOURCE", description: "Horas de trabajo al día." },
  { key: "schedule.weekly_hours", label: "Horas semanales", category: "Jornada", documentTypes: ["CONTRACT"], dataType: "hours", kind: "SOURCE", description: "Horas de trabajo a la semana." },
  { key: "schedule.monthly_hours", label: "Horas mensuales", category: "Jornada", documentTypes: ["CONTRACT"], dataType: "hours", kind: "SOURCE", description: "Horas de trabajo al mes." },
  { key: "schedule.text", label: "Horario", category: "Jornada", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Horario / jornada en texto (del puesto o sus segmentos)." },
  { key: "schedule.break", label: "Descanso", category: "Jornada", documentTypes: ["CONTRACT"], dataType: "integer", kind: "SOURCE", description: "Minutos de descanso dentro de la jornada." },

  // ---------------- Contrato ----------------
  { key: "contract.type", label: "Tipo de contrato", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Nombre del tipo de contrato (determinado / indeterminado)." },
  { key: "contract.start_date", label: "Fecha de inicio", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "date", kind: "SOURCE", description: "Fecha de inicio del contrato." },
  { key: "contract.end_date", label: "Fecha de fin", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "date", kind: "SOURCE", description: "Fecha de fin prevista (contrato por tiempo determinado)." },
  { key: "contract.duration", label: "Duración", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "text", kind: "CALCULATED", description: "Duración humana calculada a partir de start_date y end_date (p. ej. «6 meses»)." },
  { key: "contract.signature_date", label: "Fecha de firma", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "date", kind: "SOURCE", description: "Fecha de firma del contrato." },
  { key: "contract.signature_day", label: "Día de firma", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "integer", kind: "CALCULATED", description: "Día de la fecha de firma (calculado, no se persiste)." },
  { key: "contract.signature_month", label: "Mes de firma", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "text", kind: "CALCULATED", description: "Mes de la fecha de firma en español (calculado, no se persiste)." },
  { key: "contract.signature_year", label: "Año de firma", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "integer", kind: "CALCULATED", description: "Año de la fecha de firma (calculado, no se persiste)." },
  { key: "contract.signature_place", label: "Lugar de firma", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Lugar/municipio de firma." },
  { key: "contract.payment_method", label: "Forma de pago", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Forma de pago (A tiempo / A rendimiento), incluidos anexos formalizados." },
  { key: "contract.payment_schedule", label: "Día / momento de pago", category: "Contrato", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Día o momento de pago (p. ej. «Día 10 de cada mes»), incluidos anexos formalizados." },

  // ---------------- Retribución ----------------
  { key: "compensation.base_salary", label: "Salario de escala", category: "Retribución", documentTypes: ["CONTRACT"], dataType: "amount", kind: "SOURCE", description: "Salario de escala formalizado vigente." },
  { key: "compensation.additional_payments", label: "Pagos adicionales", category: "Retribución", documentTypes: ["CONTRACT"], dataType: "amount", kind: "SOURCE", description: "Suma de pagos adicionales formalizados." },
  { key: "compensation.abnormal_conditions_payments", label: "Pagos por condiciones anormales", category: "Retribución", documentTypes: ["CONTRACT"], dataType: "amount", kind: "SOURCE", description: "Suma de pagos por condiciones laborales anormales." },
  { key: "compensation.other_payments", label: "Otros pagos", category: "Retribución", documentTypes: ["CONTRACT"], dataType: "amount", kind: "SOURCE", description: "Suma de otros pagos del contrato." },
  { key: "compensation.total", label: "Total contractual", category: "Retribución", documentTypes: ["CONTRACT"], dataType: "amount", kind: "SOURCE", description: "Total contractual formalizado (salario + conceptos)." },
  { key: "compensation.currency", label: "Moneda", category: "Retribución", documentTypes: ["CONTRACT"], dataType: "text", kind: "SOURCE", description: "Moneda de la retribución (p. ej. CUP)." },

  // ---------------- Anexo ----------------
  { key: "addendum.number", label: "Número de anexo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "integer", kind: "SOURCE", description: "Numeración secuencial del anexo dentro del contrato." },
  { key: "addendum.reason", label: "Motivo del anexo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "SOURCE", description: "Motivo legible del anexo." },
  { key: "addendum.effective_date", label: "Fecha efectiva", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "date", kind: "SOURCE", description: "Fecha desde la cual aplican las nuevas condiciones." },
  { key: "addendum.signature_date", label: "Fecha de firma del anexo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "date", kind: "SOURCE", description: "Fecha de firma del anexo." },
  { key: "addendum.signature_day", label: "Día de firma del anexo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "integer", kind: "CALCULATED", description: "Día de la fecha de firma del anexo (calculado)." },
  { key: "addendum.signature_month", label: "Mes de firma del anexo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "CALCULATED", description: "Mes de la fecha de firma del anexo en español (calculado)." },
  { key: "addendum.signature_year", label: "Año de firma del anexo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "integer", kind: "CALCULATED", description: "Año de la fecha de firma del anexo (calculado)." },
  { key: "addendum.signature_place", label: "Lugar de firma del anexo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "SOURCE", description: "Lugar de firma del anexo." },

  { key: "addendum.previous.job", label: "Cargo anterior", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "SOURCE", description: "Cargo anterior según el snapshot del anexo." },
  { key: "addendum.previous.salary_group", label: "Grupo salarial anterior", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "SOURCE", description: "Grupo salarial anterior según el snapshot del anexo." },
  { key: "addendum.previous.occupational_category", label: "Categoría ocupacional anterior", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "SOURCE", description: "Categoría ocupacional anterior según el snapshot." },
  { key: "addendum.previous.salary", label: "Salario anterior", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "amount", kind: "SOURCE", description: "Salario anterior según el snapshot del anexo." },

  { key: "addendum.new.job", label: "Cargo nuevo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "SOURCE", description: "Cargo nuevo según el snapshot del anexo." },
  { key: "addendum.new.salary_group", label: "Grupo salarial nuevo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "SOURCE", description: "Grupo salarial nuevo según el snapshot del anexo." },
  { key: "addendum.new.occupational_category", label: "Categoría ocupacional nueva", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "text", kind: "SOURCE", description: "Categoría ocupacional nueva según el snapshot." },
  { key: "addendum.new.salary", label: "Salario nuevo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "amount", kind: "SOURCE", description: "Salario nuevo según el snapshot del anexo." },
  { key: "addendum.new.other_payments", label: "Otros pagos nuevos", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "amount", kind: "SOURCE", description: "Otros pagos según el lado «después» del anexo." },
  { key: "addendum.new.total", label: "Total nuevo", category: "Anexo", documentTypes: ["ADDENDUM"], dataType: "amount", kind: "SOURCE", description: "Total contractual nuevo según el anexo." },
]

export const documentVariableByKey = (key: string): DocumentVariableDefinition | undefined =>
  DOCUMENT_VARIABLES.find((definition) => definition.key === key)

/** Variables agrupadas por categoría (para el futuro selector visual de 11B.1). */
export const documentVariablesByCategory = (): Record<string, DocumentVariableDefinition[]> => {
  const map: Record<string, DocumentVariableDefinition[]> = {}
  DOCUMENT_VARIABLES.forEach((definition) => {
    const list = map[definition.category] || (map[definition.category] = [])
    list.push(definition)
  })
  return map
}

/* ------------------------------------------------------------------ */
/* Formatters centralizados (§45)                                      */
/* ------------------------------------------------------------------ */

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/** "2026-10-15" → "15/10/2026". Acepta timestamp ISO completo. */
export const formatDocumentDate = (isoDate: string | null | undefined): string | null => {
  if (!isoDate) return null
  const [year, month, day] = isoDate.slice(0, 10).split("-")
  if (!year || !month || !day) return null
  return `${day}/${month}/${year}`
}

/** "2026-10-15" → "15 de octubre de 2026". */
export const formatDocumentDateTextual = (isoDate: string | null | undefined): string | null => {
  if (!isoDate) return null
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number)
  if (!year || !month || !day || month < 1 || month > 12) return null
  return `${day} de ${MONTHS_ES[month - 1]} de ${year}`
}

export const documentSignatureDay = (isoDate: string | null | undefined): number | null => {
  if (!isoDate) return null
  const day = Number(isoDate.slice(0, 10).split("-")[2])
  return Number.isFinite(day) ? day : null
}

export const documentSignatureMonth = (isoDate: string | null | undefined): string | null => {
  if (!isoDate) return null
  const month = Number(isoDate.slice(0, 10).split("-")[1])
  return month >= 1 && month <= 12 ? MONTHS_ES[month - 1] : null
}

export const documentSignatureYear = (isoDate: string | null | undefined): number | null => {
  if (!isoDate) return null
  const year = Number(isoDate.slice(0, 10).split("-")[0])
  return Number.isFinite(year) ? year : null
}

/** 4000 → "4 000,00" (separador de miles con espacio, decimales con coma). */
export const formatDocumentAmount = (amount: number | string | null | undefined): string | null => {
  if (amount === null || amount === undefined || amount === "") return null
  const parsed = typeof amount === "number" ? amount : Number(amount)
  if (!Number.isFinite(parsed)) return null
  const [intPart, decPart] = Math.abs(parsed).toFixed(2).split(".")
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return `${parsed < 0 ? "-" : ""}${grouped},${decPart}`
}

/** Horas sin unidad: 8 → "8", 8.5 → "8,5". */
export const formatDocumentHours = (hours: number | string | null | undefined): string | null => {
  if (hours === null || hours === undefined || hours === "") return null
  const parsed = typeof hours === "number" ? hours : Number(hours)
  if (!Number.isFinite(parsed)) return null
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2).replace(".", ",")
}

/**
 * Duración humana entre dos fechas (§18/§59): las fechas siguen siendo la fuente
 * de verdad; la descripción jamás se almacena.
 * "2026-01-01" → "2026-07-01" ⇒ "6 meses"; 15 meses ⇒ "1 año y 3 meses".
 */
export const describeDocumentDuration = (
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string | null => {
  if (!startDate || !endDate) return null
  const [startY, startM, startD] = startDate.slice(0, 10).split("-").map(Number)
  const [endY, endM, endD] = endDate.slice(0, 10).split("-").map(Number)
  if (!startY || !endY) return null

  let months = (endY - startY) * 12 + (endM - startM)
  if (endD < startD) months -= 1

  // Resto de días: si cubre al menos medio mes, se redondea al mes superior
  const startMs = Date.UTC(startY, startM - 1, startD)
  const endMs = Date.UTC(endY, endM - 1, endD)
  const approxMonthMs = 30.44 * 24 * 60 * 60 * 1000
  const remainderDays = (endMs - startMs) / (24 * 60 * 60 * 1000) - months * 30.44
  if (remainderDays >= 15) months += 1

  if (months < 1) return "menos de un mes"

  const years = Math.floor(months / 12)
  const rest = months % 12
  const yearText =
    years === 0 ? "" : years === 1 ? "1 año" : `${years} años`
  const monthText =
    rest === 0 ? "" : rest === 1 ? "1 mes" : `${rest} meses`

  if (yearText && monthText) return `${yearText} y ${monthText}`
  return yearText || monthText
}

/* ------------------------------------------------------------------ */
/* Resolución (§43/§44/§46)                                            */
/* ------------------------------------------------------------------ */

const isContractData = (data: DocumentData): data is ContractDocumentData =>
  data.document_type === "CONTRACT"

const textOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const text = typeof value === "string" ? value.trim() : String(value)
  return text === "" ? null : text
}

/** Resuelve el valor sin formato de una variable (o null si falta / no aplica). */
const rawValueFor = (
  data: DocumentData,
  definition: DocumentVariableDefinition
): string | number | null => {
  if (isContractData(data)) {
    switch (definition.key) {
      case "entity.name": return textOrNull(data.entity.name)
      case "entity.organism": return textOrNull(data.entity.organism)
      case "entity.branch": return textOrNull(data.entity.branch)
      case "entity.labor_code": return textOrNull(data.entity.labor_code)
      case "entity.address": return textOrNull(data.entity.address)
      case "entity.province": return textOrNull(data.entity.province)
      case "entity.municipality": return textOrNull(data.entity.municipality)
      case "entity.revolution_year": return data.entity.revolution_year

      case "representative.name": return textOrNull(data.representative.name)
      case "representative.position": return textOrNull(data.representative.position)

      case "worker.full_name": return textOrNull(data.worker.full_name)
      case "worker.identification": return textOrNull(data.worker.identification)
      case "worker.birth_date": return textOrNull(data.worker.birth_date)
      case "worker.profession": return textOrNull(data.worker.profession)
      case "worker.address": return textOrNull(data.worker.address)
      case "worker.province": return textOrNull(data.worker.province)
      case "worker.municipality": return textOrNull(data.worker.municipality)

      case "job.name": return textOrNull(data.job.name)
      case "job.salary_group":
        return data.job.salary_group_sequence != null
          ? toRomanNumeral(data.job.salary_group_sequence)
          : null
      case "job.occupational_category": return textOrNull(data.job.occupational_category)
      case "position.name": return textOrNull(data.position.name)
      case "position.code": return textOrNull(data.position.code)
      case "position.work_location": return textOrNull(data.position.work_location)

      case "schedule.daily_hours": return data.schedule.daily_hours
      case "schedule.weekly_hours": return data.schedule.weekly_hours
      case "schedule.monthly_hours": return data.schedule.monthly_hours
      case "schedule.text": return textOrNull(data.schedule.text)
      case "schedule.break": return data.schedule.break_minutes

      case "contract.type": return textOrNull(data.contract.type_name)
      case "contract.start_date": return textOrNull(data.contract.start_date)
      case "contract.end_date": return textOrNull(data.contract.end_date)
      case "contract.duration":
        return describeDocumentDuration(data.contract.start_date, data.contract.end_date)
      case "contract.signature_date": return textOrNull(data.contract.signature_date)
      case "contract.signature_day": return documentSignatureDay(data.contract.signature_date)
      case "contract.signature_month": return documentSignatureMonth(data.contract.signature_date)
      case "contract.signature_year": return documentSignatureYear(data.contract.signature_date)
      case "contract.signature_place": return textOrNull(data.contract.signature_place)
      case "contract.payment_method": return textOrNull(data.contract.payment_method)
      case "contract.payment_schedule": return textOrNull(data.contract.payment_schedule)

      case "compensation.base_salary": return data.compensation.base_salary
      case "compensation.additional_payments": return data.compensation.additional_payments
      case "compensation.abnormal_conditions_payments": return data.compensation.abnormal_conditions_payments
      case "compensation.other_payments": return data.compensation.other_payments
      case "compensation.total": return data.compensation.total
      case "compensation.currency": return textOrNull(data.compensation.currency)
      default: return null
    }
  }

  // ---------------- Anexo ----------------
  const previous = (code: string): { value: string | null; display: string | null } =>
    data.previous_conditions[code] || { value: null, display: null }
  const next = (code: string): { value: string | null; display: string | null } =>
    data.new_conditions[code] || { value: null, display: null }
  const amountSide = (side: { value: string | null; display: string | null }): string | null => {
    if (side.value !== null && side.value !== undefined && side.value !== "") return side.value
    // El display incluye moneda ("3 500,00 CUP"): se usa sólo como último recurso
    return side.display
  }

  switch (definition.key) {
    case "entity.name": return textOrNull(data.entity.name)
    case "entity.organism": return textOrNull(data.entity.organism)
    case "entity.branch": return textOrNull(data.entity.branch)
    case "entity.labor_code": return textOrNull(data.entity.labor_code)
    case "entity.address": return textOrNull(data.entity.address)
    case "entity.province": return textOrNull(data.entity.province)
    case "entity.municipality": return textOrNull(data.entity.municipality)
    case "entity.revolution_year": return data.entity.revolution_year

    case "representative.name": return textOrNull(data.representative.name)
    case "representative.position": return textOrNull(data.representative.position)

    case "worker.full_name": return textOrNull(data.worker.full_name)
    case "worker.identification": return textOrNull(data.worker.identification)
    case "worker.birth_date": return textOrNull(data.worker.birth_date)
    case "worker.profession": return textOrNull(data.worker.profession)
    case "worker.address": return textOrNull(data.worker.address)
    case "worker.province": return textOrNull(data.worker.province)
    case "worker.municipality": return textOrNull(data.worker.municipality)

    case "addendum.number": return data.addendum.number
    case "addendum.reason":
      return textOrNull(data.addendum.reason) ?? textOrNull(data.addendum.reason_code)
    case "addendum.effective_date": return textOrNull(data.addendum.effective_date)
    case "addendum.signature_date": return textOrNull(data.addendum.signature_date)
    case "addendum.signature_day": return documentSignatureDay(data.addendum.signature_date)
    case "addendum.signature_month": return documentSignatureMonth(data.addendum.signature_date)
    case "addendum.signature_year": return documentSignatureYear(data.addendum.signature_date)
    case "addendum.signature_place": return textOrNull(data.addendum.signature_place)

    case "addendum.previous.job": return previous("JOB").display ?? previous("JOB").value
    case "addendum.previous.salary_group": return previous("SALARY_GROUP").display ?? previous("SALARY_GROUP").value
    case "addendum.previous.occupational_category": return previous("OCCUPATIONAL_CATEGORY").display ?? previous("OCCUPATIONAL_CATEGORY").value
    case "addendum.previous.salary": return amountSide(previous("SALARY"))

    case "addendum.new.job": return next("JOB").display ?? next("JOB").value
    case "addendum.new.salary_group": return next("SALARY_GROUP").display ?? next("SALARY_GROUP").value
    case "addendum.new.occupational_category": return next("OCCUPATIONAL_CATEGORY").display ?? next("OCCUPATIONAL_CATEGORY").value
    case "addendum.new.salary": return amountSide(next("SALARY"))
    case "addendum.new.other_payments": return amountSide(next("OTHER_PAYMENT"))
    case "addendum.new.total":
      return data.totals.after ?? amountSide(next("TOTAL_COMPENSATION"))
    default: return null
  }
}

const formatByDataType = (
  definition: DocumentVariableDefinition,
  raw: string | number | null
): string | null => {
  if (raw === null || raw === undefined) return null
  switch (definition.dataType) {
    case "date": return formatDocumentDate(typeof raw === "string" ? raw : String(raw))
    case "amount": return formatDocumentAmount(raw)
    case "hours": return formatDocumentHours(raw)
    case "integer":
    case "text":
    default:
      return typeof raw === "string" ? raw : String(raw)
  }
}

/**
 * Resuelve UNA variable documental (§43). Distingue `value` de `missing`:
 * nunca produce undefined/null/[object Object] como texto.
 */
export const resolveDocumentVariable = (
  data: DocumentData,
  variableKey: string
): DocumentVariableResolution => {
  const definition = documentVariableByKey(variableKey)
  if (!definition) {
    return { status: "missing", value: null }
  }
  if (!definition.documentTypes.includes(data.document_type)) {
    return { status: "missing", value: null }
  }
  const raw = rawValueFor(data, definition)
  const formatted = formatByDataType(definition, raw)
  if (formatted === null || formatted === "") {
    return { status: "missing", value: null }
  }
  return { status: "value", value: formatted }
}

export interface ResolvedDocumentVariables {
  documentType: DocumentTypeCode
  /** key → valor ya formateado (sólo variables con valor). */
  values: Record<string, string>
  /** Variables sin valor, con su etiqueta legible (§47). */
  missing: { key: string; label: string }[]
}

/** Resuelve TODAS las variables aplicables al documento (§44). Base directa de 11B. */
export const resolveAllDocumentVariables = (data: DocumentData): ResolvedDocumentVariables => {
  const values: Record<string, string> = {}
  const missing: { key: string; label: string }[] = []

  DOCUMENT_VARIABLES.filter((definition) =>
    definition.documentTypes.includes(data.document_type)
  ).forEach((definition) => {
    const resolution = resolveDocumentVariable(data, definition.key)
    if (resolution.status === "value" && resolution.value !== null) {
      values[definition.key] = resolution.value
    } else {
      missing.push({ key: definition.key, label: definition.label })
    }
  })

  return { documentType: data.document_type, values, missing }
}
