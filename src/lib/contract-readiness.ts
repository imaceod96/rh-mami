import { supabase } from "@/lib/supabase"

/**
 * Capa central de preparación contractual (integridad desde el origen).
 *
 * Los validadores viven como funciones SQL (una única fuente de verdad,
 * reutilizada por frontend y por las RPC de contratación/formalización). Este
 * módulo sólo las invoca y tipa el resultado estructurado `{ ready, missing }`.
 */

export interface ReadinessItem {
  code: string
  label: string
  source: string | null
  sourceId: string | null
  section: string
}

export interface ReadinessSection {
  key: string
  label: string
  ready: boolean
  missing: ReadinessItem[]
}

export interface ReadinessResult {
  ready: boolean
  missing: ReadinessItem[]
  sections?: ReadinessSection[]
}

export interface HiringReadinessParams {
  candidateId?: string | null
  workerId?: string | null
  positionId?: string | null
  signatureDate?: string | null
  contractTypeId?: string | null
  signaturePlace?: string | null
  paymentMethodId?: string | null
  representativeAssignmentId?: string | null
  contractStartDate?: string | null
  contractEndDate?: string | null
}

export async function validateHiringReadiness(
  params: HiringReadinessParams
): Promise<ReadinessResult> {
  const { data, error } = await supabase.rpc("validate_hiring_readiness", {
    p_candidate_id: params.candidateId || null,
    p_worker_id: params.workerId || null,
    p_position_id: params.positionId || null,
    p_signature_date: params.signatureDate || null,
    p_contract_type_id: params.contractTypeId || null,
    p_signature_place: params.signaturePlace || null,
    p_payment_method_id: params.paymentMethodId || null,
    p_representative_assignment_id: params.representativeAssignmentId || null,
    p_contract_start_date: params.contractStartDate || null,
    p_contract_end_date: params.contractEndDate || null,
  })
  if (error) throw error
  return data as ReadinessResult
}

export async function validateCandidateContractReadiness(
  candidateId: string
): Promise<ReadinessResult> {
  const { data, error } = await supabase.rpc("validate_candidate_contract_readiness", {
    p_candidate_id: candidateId,
  })
  if (error) throw error
  return data as ReadinessResult
}

export async function validatePositionContractReadiness(
  positionId: string
): Promise<ReadinessResult> {
  const { data, error } = await supabase.rpc("validate_position_contract_readiness", {
    p_position_id: positionId,
  })
  if (error) throw error
  return data as ReadinessResult
}

/** Mapea los títulos técnicos de sección a las etiquetas de la lista de verificación. */
export const READINESS_SECTION_LABELS: Record<string, string> = {
  Entidad: "Entidad",
  Representante: "Representante",
  Candidato: "Datos personales",
  Trabajador: "Datos personales",
  Cargo: "Cargo",
  Puesto: "Puesto y jornada",
  Contrato: "Condiciones contractuales",
}

const SECTION_ORDER = [
  "Candidato",
  "Trabajador",
  "Entidad",
  "Representante",
  "Cargo",
  "Puesto",
  "Contrato",
]

/** Construye el mensaje humano (§38) a partir de los datos faltantes. */
export function formatReadinessMessage(
  readiness: ReadinessResult | null | undefined,
  title = "No se puede realizar la contratación."
): string {
  const missing = readiness?.missing
  if (!missing || missing.length === 0) return ""

  const grouped = new Map<string, string[]>()
  for (const item of missing) {
    const key = READINESS_SECTION_LABELS[item.section] || item.section
    const list = grouped.get(key) || []
    if (!list.includes(item.label)) list.push(item.label)
    grouped.set(key, list)
  }

  const ordered = [...grouped.keys()].sort((a, b) => {
    const ai = SECTION_ORDER.findIndex(
      (s) => (READINESS_SECTION_LABELS[s] || s) === a
    )
    const bi = SECTION_ORDER.findIndex(
      (s) => (READINESS_SECTION_LABELS[s] || s) === b
    )
    return ai - bi
  })

  let out = `${title}\n\nFalta completar:`
  for (const section of ordered) {
    out += `\n\n${section}`
    for (const label of grouped.get(section) || []) {
      out += `\n• ${label}`
    }
  }
  return out
}
