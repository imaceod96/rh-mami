import { supabase } from "@/lib/supabase"
import { fetchPositionScheduleSegments } from "@/lib/position-schedule"

/**
 * Fase 11A.7 — Capa central de datos documentales.
 *
 * `getContractDocumentData(contractId)` y `getAddendumDocumentData(addendumId)`
 * viven como funciones SQL (una única fuente de resolución): este módulo sólo
 * las invoca y tipa. Los componentes React NUNCA resuelven variables por su cuenta.
 */

export interface DocumentPartyEntity {
  name: string | null
  organism: string | null
  branch: string | null
  labor_code: string | null
  address: string | null
  province: string | null
  municipality: string | null
  revolution_year: string | null
}

export interface DocumentRepresentative {
  name: string | null
  position: string | null
}

export interface DocumentWorker {
  full_name: string | null
  identification: string | null
  birth_date: string | null
  profession: string | null
  address: string | null
  province: string | null
  municipality: string | null
}

export interface ContractDocumentData {
  document_type: "CONTRACT"
  contract_id: string
  contract_type_code: string | null
  contract_type_name: string | null
  entity: DocumentPartyEntity
  representative: DocumentRepresentative
  worker: DocumentWorker
  job: {
    name: string | null
    occupational_category: string | null
    salary_group_sequence: number | null
  }
  position: {
    name: string | null
    code: string | null
    work_location: string | null
  }
  schedule: {
    daily_hours: number | null
    weekly_hours: number | null
    monthly_hours: number | null
    break_minutes: number | null
    text: string | null
  }
  contract: {
    type_name: string | null
    type_code: string | null
    start_date: string | null
    end_date: string | null
    signature_date: string | null
    signature_place: string | null
    payment_method: string | null
    payment_schedule: string | null
  }
  compensation: {
    base_salary: number | null
    additional_payments: number | null
    abnormal_conditions_payments: number | null
    other_payments: number | null
    total: number | null
    currency: string | null
  }
  formalized_addendums: {
    addendum_id: string
    addendum_number: number | null
    effective_date: string
  }[]
}

/** Campo antes/después incluido en un anexo (snapshot histórico, nunca datos vivos). */
export interface AddendumConditionSide {
  value: string | null
  display: string | null
}

export interface AddendumDocumentData {
  document_type: "ADDENDUM"
  addendum_id: string
  addendum: {
    number: number | null
    reason_code: string | null
    reason: string | null
    effective_date: string | null
    signature_date: string | null
    signature_place: string | null
    status: string | null
  }
  entity: DocumentPartyEntity
  representative: DocumentRepresentative
  worker: DocumentWorker
  /** field_code (JOB, SALARY, …) → valor anterior congelado en el anexo. */
  previous_conditions: Record<string, AddendumConditionSide>
  /** field_code → valor nuevo congelado en el anexo. */
  new_conditions: Record<string, AddendumConditionSide>
  totals: {
    before: number | null
    after: number | null
    currency: string | null
  }
}

export type DocumentData = ContractDocumentData | AddendumDocumentData | Sc404DocumentData

export type Sc404SourceType = "VACATION" | "MEDICAL_CERTIFICATE"

export interface Sc404DocumentData {
  document_type: "SC_4_04"
  origin: {
    source_type: Sc404SourceType
    source_id: string
    /** Vacaciones y certificado: fecha de inicio del período / salida. */
    start_date: string | null
    /** Solo vacaciones: end_date del período (§20: no se inventa para médico). */
    end_date: string | null
    /** Solo vacaciones: días naturales persistidos (§14/§15). */
    natural_days: number | null
    /** Solo vacaciones: días consumidos (ledger). */
    charged_days: number | null
    /** Solo certificado médico: days explícito (§18). */
    days: number | null
    /** Solo certificado médico: return_date (reincorporación). */
    return_date: string | null
    /**
     * Fecha de incorporación (§2 Fase 21):
     *   · VACATION → primer día hábil posterior a end_date según el horario
     *     del Puesto de la asignación vigente en el período (calculada, no persistida).
     *   · MEDICAL_CERTIFICATE → return_date (fuente de verdad; nunca se consulta horario).
     */
    incorporation_date: string | null
  }
  entity: {
    name: string | null
    code: string | null
  }
  worker: {
    full_name: string | null
    identification: string | null
  }
  area_name: string | null
  /** Fecha de emisión del documento (día de la generación). */
  issued_at: string
}

const fullNameOf = (row: {
  first_name: string | null
  first_surname: string | null
  second_surname: string | null
}): string | null => {
  const name = [row.first_name, row.first_surname, row.second_surname]
    .filter((part) => part && part.trim() !== "")
    .join(" ")
    .trim()
  return name === "" ? null : name
}

/**
 * Datos documentales del SC-4-04. La entidad y el área se resuelven desde la
 * relación REAL del trabajador del registro (§30/§31/§32), nunca desde la
 * entidad seleccionada en el frontend.
 */
export async function getSc404DocumentData(
  sourceType: Sc404SourceType,
  sourceId: string
): Promise<Sc404DocumentData> {
  const issuedAt = new Date().toISOString().slice(0, 10)

  if (sourceType === "VACATION") {
    const { data, error } = await supabase
      .from("worker_vacations")
      .select(
        `id, worker_id, start_date, end_date, natural_days, charged_days, status,
         worker:workers(
           id, first_name, first_surname, second_surname, identification, organization_entity_id,
           entity:organization_entities(id, name, code)
         )`
      )
      .eq("id", sourceId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const row = (data ?? {}) as any
    if (!row?.id) throw new Error("Período de vacaciones no encontrado")
    if (row.status === "CANCELLED") throw new Error("No se puede generar el documento de un período cancelado")

    const worker = Array.isArray(row.worker) ? row.worker[0] : row.worker
    const entity = Array.isArray(worker?.entity) ? worker.entity[0] : worker?.entity

    // §10 (Fase 21): Puesto/Assignment vigente AL PERÍODO (histórico), no el actual.
    const assignment = await fetchWorkerAssignmentContext(
      String(row.worker_id),
      String(row.start_date ?? "")
    )

    return {
      document_type: "SC_4_04",
      origin: {
        source_type: "VACATION",
        source_id: String(row.id),
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
        natural_days: row.natural_days ?? null,
        charged_days: row.charged_days ?? null,
        days: null,
        return_date: null,
        // Primer día hábil posterior al período, según el horario del Puesto real.
        incorporation_date: await computeNextWorkingDay(
          assignment?.position_id ?? null,
          row.end_date ?? null
        ),
      },
      entity: {
        name: entity?.name ?? null,
        code: entity?.code ?? null,
      },
      worker: {
        full_name: worker ? fullNameOf(worker) : null,
        identification: worker?.identification ?? null,
      },
      area_name: assignment?.area_name ?? null,
      issued_at: issuedAt,
    }
  }

  const { data, error } = await supabase
    .from("worker_medical_certificates")
    .select(
      `id, worker_id, start_date, return_date, days,
       worker:workers(
         id, first_name, first_surname, second_surname, identification, organization_entity_id,
         entity:organization_entities(id, name, code)
       )`
    )
    .eq("id", sourceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const row = (data ?? {}) as any
  if (!row?.id) throw new Error("Certificado médico no encontrado")

  const worker = Array.isArray(row.worker) ? row.worker[0] : row.worker
  const entity = Array.isArray(worker?.entity) ? worker.entity[0] : worker?.entity

  // Área de la asignación vigente a la fecha del certificado (con fallback al actual).
  const assignment = await fetchWorkerAssignmentContext(
    String(row.worker_id),
    String(row.start_date ?? "")
  )

  return {
    document_type: "SC_4_04",
    origin: {
      source_type: "MEDICAL_CERTIFICATE",
      source_id: String(row.id),
      start_date: row.start_date ?? null,
      // §20/§21: return_date es REINCORPORACIÓN; no existe fecha de fin de licencia.
      end_date: null,
      natural_days: null,
      charged_days: null,
      days: row.days ?? null,
      return_date: row.return_date ?? null,
      // §12 (Fase 21): return_date ES la reincorporación; jamás se consulta el horario.
      incorporation_date: row.return_date ?? null,
    },
    entity: {
      name: entity?.name ?? null,
      code: entity?.code ?? null,
    },
    worker: {
      full_name: worker ? fullNameOf(worker) : null,
      identification: worker?.identification ?? null,
    },
    area_name: assignment?.area_name ?? null,
    issued_at: issuedAt,
  }
}

/**
 * Asignación del trabajador VIGENTE en `atDate` (§10 Fase 21): la que cubre la
 * fecha (start_date ≤ fecha ≤ end_date/null), la más reciente iniciada. Fallback:
 * asignación actual y, en último caso, la última asignación histórica.
 * Devuelve el puesto (para el horario) y el área (asignación → puesto → cargo → área).
 */
async function fetchWorkerAssignmentContext(
  workerId: string,
  atDate: string
): Promise<{ position_id: string | null; area_name: string | null } | null> {
  const { data } = await supabase
    .from("worker_position_assignments")
    .select(
      `id, start_date, end_date, is_current,
       position:organization_positions(
         id,
         job:organization_jobs(id, area:organization_areas(name))
       )`
    )
    .eq("worker_id", workerId)
    .order("start_date", { ascending: false })

  const rows = ((data || []) as any[]).map((a) => ({
    position:
      a.position && (Array.isArray(a.position) ? a.position[0] : a.position) || null,
    start_date: String(a.start_date ?? ""),
    end_date: a.end_date ? String(a.end_date) : null,
    is_current: !!a.is_current,
  }))

  const active =
    rows.find(
      (a) => atDate && a.start_date <= atDate && (!a.end_date || a.end_date >= atDate)
    ) ||
    rows.find((a) => a.is_current && !a.end_date) ||
    rows[0] ||
    null

  if (!active?.position) return null
  const position = active.position
  const job = position.job && (Array.isArray(position.job) ? position.job[0] : position.job)
  const area = job && (Array.isArray(job.area) ? job.area[0] : job.area)
  return { position_id: position.id ?? null, area_name: area?.name ?? null }
}

/**
 * Primer día hábil estrictamente posterior a `endDateIso`, según el horario REAL
 * del Puesto (position_schedule_segments, misma fuente que el devengo de
 * vacaciones; réplica de position_working_weekdays). §4 Fase 21:
 *   fecha = end + 1; while (día no laborable) fecha += 1.
 * Sin horario configurado o sin fecha de fin → null (no se inventa nada).
 */
async function computeNextWorkingDay(
  positionId: string | null,
  endDateIso: string | null
): Promise<string | null> {
  if (!positionId || !endDateIso) return null

  const segments = await fetchPositionScheduleSegments(positionId)
  const workingDays = new Set(
    segments.map((segment) => segment.day_of_week)
  )
  if (workingDays.size === 0) return null

  const cursor = new Date(`${String(endDateIso).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(cursor.getTime())) return null

  // ISO-8601: 1=Lunes … 7=Domingo (misma convención que position_schedule_segments).
  for (let i = 0; i < 60; i += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const isoDay = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay()
    if (workingDays.has(isoDay)) {
      return cursor.toISOString().slice(0, 10)
    }
  }
  return null
}

export interface DocumentDataValidation {
  document_type: string
  contract_type_code?: string | null
  addendum_status?: string | null
  ready: boolean
  missing: { key: string; label: string }[]
}

/** Datos documentales completos de un contrato (§11–§20). */
export async function getContractDocumentData(contractId: string): Promise<ContractDocumentData> {
  const { data, error } = await supabase.rpc("get_contract_document_data", {
    p_contract_id: contractId,
  })
  if (error) throw error
  return data as ContractDocumentData
}

/** Datos documentales completos de un anexo (§22–§25). */
export async function getAddendumDocumentData(addendumId: string): Promise<AddendumDocumentData> {
  const { data, error } = await supabase.rpc("get_addendum_document_data", {
    p_addendum_id: addendumId,
  })
  if (error) throw error
  return data as AddendumDocumentData
}

/** Información pendiente para poder generar el contrato (§47/§49/§50). */
export async function validateContractDocumentData(
  contractId: string
): Promise<DocumentDataValidation> {
  const { data, error } = await supabase.rpc("validate_contract_document_data", {
    p_contract_id: contractId,
  })
  if (error) throw error
  return data as DocumentDataValidation
}

/** Información pendiente para poder generar el anexo (§47/§51). */
export async function validateAddendumDocumentData(
  addendumId: string
): Promise<DocumentDataValidation> {
  const { data, error } = await supabase.rpc("validate_addendum_document_data", {
    p_addendum_id: addendumId,
  })
  if (error) throw error
  return data as DocumentDataValidation
}
