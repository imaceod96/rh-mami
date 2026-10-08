import { supabase } from "@/lib/supabase"

/**
 * Fase 11A.5 — Condiciones específicas del contrato de trabajo.
 *
 * Distinción clave:
 *   SALARIO ACTUAL      → Puesto → Cargo → Grupo → Escala aplicable → valor vigente (derivado)
 *   SALARIO FORMALIZADO → snapshot del contrato (firmado e histórico, nunca recalculado)
 *
 * El salario de escala y el total contractual SIEMPRE los calcula el backend:
 * el frontend sólo los muestra (vista previa) y envía los conceptos específicos.
 */

export interface PaymentMethodOption {
  id: string
  name: string
  code: string
}

export type CompensationComponentType =
  | "ADDITIONAL_PAYMENT"
  | "ABNORMAL_CONDITIONS"
  | "OTHER"

export interface CompensationComponentTypeMeta {
  code: CompensationComponentType
  /** Título de la sección en el formulario */
  label: string
  /** Texto de la fila de concepto */
  hint: string
}

/** Tipos de componente retributivo aprobados (no hay clasificación por texto libre). */
export const COMPENSATION_COMPONENT_TYPES: CompensationComponentTypeMeta[] = [
  {
    code: "ADDITIONAL_PAYMENT",
    label: "Pagos adicionales",
    hint: "Ej.: responsabilidad, antigüedad, coeficiente",
  },
  {
    code: "ABNORMAL_CONDITIONS",
    label: "Condiciones laborales anormales",
    hint: "Ej.: nocturnidad, trabajo en altura, ambiente insalubre",
  },
  {
    code: "OTHER",
    label: "Otros pagos",
    hint: "Otros conceptos específicos del contrato",
  },
]

export const componentTypeLabel = (code: string): string =>
  COMPENSATION_COMPONENT_TYPES.find((type) => type.code === code)?.label || code

/** Concepto retributivo en edición (importe como texto para el input). */
export interface CompensationComponentDraft {
  /** Identificador local de la fila (no se persiste) */
  key: string
  component_type: CompensationComponentType
  description: string
  amount: string
}

export const newComponentDraft = (
  componentType: CompensationComponentType = "ADDITIONAL_PAYMENT"
): CompensationComponentDraft => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  component_type: componentType,
  description: "",
  amount: "",
})

/** Concepto persistido (histórico del contrato). */
export interface ContractCompensationComponent {
  id: string
  component_type: string
  description: string
  amount: number
  display_order: number
}

/** Concepto persistido con el contrato al que pertenece (historial por contrato). */
interface CompensationComponentWithContract extends ContractCompensationComponent {
  employment_contract_id: string
}

export interface ContractConditionsSnapshot {
  id: string
  signature_date: string | null
  signature_place: string | null
  payment_method_id: string | null
  payment_method_name: string | null
  payment_method_code: string | null
  payment_schedule_text: string | null
  salary_amount: number | null
  salary_currency_code: string | null
  salary_snapshot_status: string
  total_compensation_snapshot: number | null
  components: ContractCompensationComponent[]
}

export interface ContractFormalizationPending {
  blocking: string[]
  warnings: string[]
}

/**
 * Fila de `employment_contracts` + `payment_methods` tal como la devuelve la
 * consulta del snapshot. La relación to-one con `payment_methods` llega como
 * objeto; se admite también array porque el código normaliza ambos casos.
 */
interface ContractConditionsRow {
  id: string
  signature_date: string | null
  signature_place: string | null
  payment_method_id: string | null
  payment_schedule_text: string | null
  salary_amount: number | null
  salary_currency_code: string | null
  salary_snapshot_status: string
  total_compensation_snapshot: number | null
  payment_method: { name: string; code: string } | { name: string; code: string }[] | null
}

/** Catálogo global de formas de pago (A tiempo / A rendimiento). */
export const fetchPaymentMethods = async (): Promise<PaymentMethodOption[]> => {
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, name, code")
    .eq("is_active", true)
    .order("display_order")

  if (error) throw error
  return (data as PaymentMethodOption[]) || []
}

/**
 * Checklist de formalización calculado por el backend (§47/§48):
 * `blocking` impide formalizar; `warnings` sólo advierte.
 */
export const fetchContractFormalizationPending = async (input: {
  entityId: string
  positionId: string | null
  signatureDate: string | null
  signaturePlace: string | null
  paymentMethodId: string | null
  representativeAssignmentId: string | null
}): Promise<ContractFormalizationPending> => {
  const { data, error } = await supabase.rpc("pending_contract_formalization", {
    p_entity_id: input.entityId,
    p_position_id: input.positionId,
    p_signature_date: input.signatureDate || null,
    p_signature_place: input.signaturePlace || null,
    p_payment_method_id: input.paymentMethodId || null,
    p_representative_assignment_id: input.representativeAssignmentId || null,
  })

  if (error) throw error
  const result = (data as ContractFormalizationPending | null) || { blocking: [], warnings: [] }
  return {
    blocking: result.blocking || [],
    warnings: result.warnings || [],
  }
}

/** Conceptos retributivos persistidos de un contrato (histórico). */
export const fetchContractCompensationComponents = async (
  contractId: string
): Promise<ContractCompensationComponent[]> => {
  const { data, error } = await supabase
    .from("employment_contract_compensation_components")
    .select("id, component_type, description, amount, display_order")
    .eq("employment_contract_id", contractId)
    .order("display_order")

  if (error) throw error
  return ((data as ContractCompensationComponent[]) || []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  })) as ContractCompensationComponent[]
}

/**
 * Conceptos retributivos de VARIOS contratos, agrupados por contrato.
 * Se usa para mostrar el historial contractual con sus propios snapshots.
 */
export const fetchComponentsByContract = async (
  contractIds: string[]
): Promise<Record<string, ContractCompensationComponent[]>> => {
  const map: Record<string, ContractCompensationComponent[]> = {}
  const ids = Array.from(new Set(contractIds.filter((id): id is string => !!id)))
  if (ids.length === 0) return map

  const { data, error } = await supabase
    .from("employment_contract_compensation_components")
    .select("id, employment_contract_id, component_type, description, amount, display_order")
    .in("employment_contract_id", ids)
    .order("display_order")

  if (error) throw error
  ;((data as CompensationComponentWithContract[]) || []).forEach((row) => {
    const list =
      map[row.employment_contract_id] || (map[row.employment_contract_id] = [])
    list.push({
      id: row.id,
      component_type: row.component_type,
      description: row.description,
      amount: Number(row.amount),
      display_order: row.display_order,
    })
  })

  return map
}

/** Condiciones formalizadas de un contrato (snapshot histórico). */
export const fetchContractConditions = async (
  contractId: string
): Promise<ContractConditionsSnapshot | null> => {
  const { data, error } = await supabase
    .from("employment_contracts")
    .select(
      `id, signature_date, signature_place, payment_method_id, payment_schedule_text,
       salary_amount, salary_currency_code,
       salary_snapshot_status, total_compensation_snapshot,
       payment_method:payment_methods(name, code)`
    )
    .eq("id", contractId)
    .single()

  if (error) throw error
  if (!data) return null

  const row = data as ContractConditionsRow
  const payment = Array.isArray(row.payment_method) ? row.payment_method[0] : row.payment_method

  return {
    id: row.id,
    signature_date: row.signature_date ?? null,
    signature_place: row.signature_place ?? null,
    payment_method_id: row.payment_method_id ?? null,
    payment_method_name: payment?.name ?? null,
    payment_method_code: payment?.code ?? null,
    payment_schedule_text: row.payment_schedule_text ?? null,
    salary_amount: row.salary_amount === null ? null : Number(row.salary_amount),
    salary_currency_code: row.salary_currency_code ?? null,
    salary_snapshot_status: row.salary_snapshot_status,
    total_compensation_snapshot:
      row.total_compensation_snapshot === null ? null : Number(row.total_compensation_snapshot),
    components: await fetchContractCompensationComponents(contractId),
  }
}

/** Importe de un concepto: sólo números finitos y no negativos. */
export const componentAmountValue = (draft: CompensationComponentDraft): number | null => {
  const raw = draft.amount.trim().replace(",", ".")
  if (!raw) return 0
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

/** Suma de conceptos (los importes inválidos no se suman; el backend los rechaza). */
export const componentsTotal = (drafts: CompensationComponentDraft[]): number =>
  drafts.reduce((total, draft) => total + (componentAmountValue(draft) || 0), 0)

/** ¿Hay alguna fila de concepto incompleta o con importe inválido? */
export const hasInvalidComponent = (drafts: CompensationComponentDraft[]): boolean =>
  drafts.some(
    (draft) =>
      draft.description.trim() === "" ||
      componentAmountValue(draft) === null
  )

/** Payload que viaja al backend: tipo, descripción e importe (nunca el total). */
export const buildComponentsPayload = (
  drafts: CompensationComponentDraft[]
): { component_type: string; description: string; amount: number }[] =>
  drafts
    .filter((draft) => draft.description.trim() !== "" || draft.amount.trim() !== "")
    .map((draft) => ({
      component_type: draft.component_type,
      description: draft.description.trim(),
      amount: componentAmountValue(draft) ?? 0,
    }))

/** Convierte conceptos persistidos en filas editables (precarga de revisión). */
export const toComponentDrafts = (
  components: ContractCompensationComponent[]
): CompensationComponentDraft[] =>
  components.map((component) => ({
    key: component.id,
    component_type: (component.component_type as CompensationComponentType) || "OTHER",
    description: component.description,
    amount: String(component.amount),
  }))

export const formatContractMoney = (amount: number | null, currency?: string | null): string => {
  if (amount === null || amount === undefined) return "—"
  const value = `${amount.toLocaleString("es-CU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  return currency ? `${value} ${currency}` : value
}

/** Fecha ISO (aaaa-mm-dd) → dd/mm/aaaa. */
export const formatConditionDate = (isoDate: string | null | undefined): string => {
  if (!isoDate) return "—"
  const [year, month, day] = isoDate.split("-")
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}
