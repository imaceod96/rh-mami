import { supabase } from "@/lib/supabase"

/**
 * Infraestructura de cambio salarial (Fase 11A).
 * Toda la lógica (impacto, histórico por trabajador, anexos pendientes y fecha efectiva)
 * vive en la función atómica `apply_salary_group_value_change` de la base de datos.
 */

export interface SalaryChangePreview {
  salary_group_id: string
  salary_scale_id: string
  scope_type: "PRESUPUESTADA_GLOBAL" | "EMPRESARIAL_ENTITY"
  organization_entity_id: string | null
  scale_name: string
  sequence_number: number
  group_description: string | null
  currency_code: string
  previous_amount: number | null
  previous_effective_from: string | null
  previous_effective_to: string | null
  new_amount: number
  new_effective_date: string
  difference: number | null
  variation_pct: number | null
  is_decrease: boolean
  is_retroactive: boolean
  is_future: boolean
  value_exists_on_date: boolean
  existing_amount_on_date: number | null
  workers_affected: number
  workers_with_contract: number
}

export interface SalaryChangeImpactRow {
  worker_id: string
  worker_code: string
  worker_name: string
  identification: string
  area_name: string | null
  job_name: string | null
  position_name: string | null
  group_sequence_number: number | null
  previous_amount: number
  currency_code: string
  contract_id: string | null
  contract_start_date: string | null
  contract_type_name: string | null
  assignment_id: string
  position_id: string
  job_id: string
}

export interface SalaryChangeApplyResult {
  status: "APPLIED" | "UNCHANGED"
  salary_group_value_id: string
  salary_group_id: string
  salary_scale_id: string | null
  previous_amount: number | null
  previous_effective_from: string | null
  new_amount: number
  currency_code: string
  effective_date: string
  workers_affected: number
  salary_history_created: number
  addendums_created: number
}

/** Impacto previsto del cambio, sin aplicarlo. */
export async function previewSalaryChange(
  groupId: string,
  newAmount: number,
  effectiveFrom: string
): Promise<SalaryChangePreview> {
  const { data, error } = await supabase.rpc("preview_salary_change", {
    p_salary_group_id: groupId,
    p_new_amount: newAmount,
    p_effective_from: effectiveFrom || null,
  })
  if (error) throw error
  return data as SalaryChangePreview
}

/** Trabajadores cuyo salario cambiará con el nuevo importe en la fecha efectiva. */
export async function fetchSalaryChangeImpact(
  groupId: string,
  newAmount: number,
  effectiveDate: string
): Promise<SalaryChangeImpactRow[]> {
  const { data, error } = await supabase.rpc("salary_change_impact", {
    p_salary_group_id: groupId,
    p_new_amount: newAmount,
    p_effective_date: effectiveDate || null,
  })
  if (error) throw error
  return (data as SalaryChangeImpactRow[]) || []
}

/**
 * Aplica el cambio de forma atómica: nueva versión del valor salarial, histórico
 * salarial de cada trabajador afectado y anexo contractual pendiente de generar.
 * Es idempotente: repetir el mismo cambio no duplica históricos ni anexos.
 */
export async function applySalaryChange(
  groupId: string,
  newAmount: number,
  currencyCode: string | null,
  effectiveFrom: string,
  notes?: string | null
): Promise<SalaryChangeApplyResult> {
  const { data, error } = await supabase.rpc("apply_salary_group_value_change", {
    p_salary_group_id: groupId,
    p_new_amount: newAmount,
    p_currency_code: currencyCode || null,
    p_effective_from: effectiveFrom,
    p_notes: notes?.trim() || null,
  })
  if (error) throw error
  return data as SalaryChangeApplyResult
}
