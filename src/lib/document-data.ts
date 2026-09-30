import { supabase } from "@/lib/supabase"

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

export type DocumentData = ContractDocumentData | AddendumDocumentData

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
