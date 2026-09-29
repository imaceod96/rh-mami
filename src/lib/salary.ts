import { supabase } from "@/lib/supabase"

export interface SalaryValue {
  amount: number
  currency_code: string
  effective_from?: string | null
}

export interface SalaryGroupRef {
  id: string
  salary_scale_id: string
  sequence_number: number
}

/**
 * Resuelve la escala salarial aplicable a una entidad.
 * PRESUPUESTADA → escala presupuestada global.
 * EMPRESARIAL → escala empresarial de ESA organization_entity.
 * Devuelve null si no hay escala configurada (no hay fallback entre regímenes).
 */
export async function resolveApplicableScaleId(entityId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_salary_scale_for_entity", {
    entity_id: entityId,
  })
  if (error) throw error
  return (data as string | null) || null
}

/**
 * Resuelve el valor salarial vigente para una fecha (por defecto, hoy).
 * El valor vigente se determina por la vigencia temporal (effective_from / effective_to)
 * del histórico de valores del grupo, nunca por un flag mutable.
 */
export async function fetchSalaryValuesForGroups(
  groupIds: string[],
  effectiveDate?: string
): Promise<Record<string, SalaryValue | null>> {
  const map: Record<string, SalaryValue | null> = {}
  const uniqueIds = Array.from(new Set(groupIds.filter((id): id is string => !!id)))
  if (uniqueIds.length === 0) return map

  const { data, error } = await supabase.rpc("resolve_salary_group_values", {
    p_group_ids: uniqueIds,
    p_effective_date: effectiveDate || null,
  })
  if (error) throw error

  ;(
    data as
      | { salary_group_id: string; amount: number; currency_code: string; effective_from: string }[]
      | null
  )?.forEach((v) => {
    map[v.salary_group_id] = {
      amount: v.amount,
      currency_code: v.currency_code,
      effective_from: v.effective_from,
    }
  })

  uniqueIds.forEach((id) => {
    if (map[id] === undefined) map[id] = null
  })

  return map
}

/**
 * Salario de referencia derivado: Grupo → escala aplicable → importe vigente.
 * Sin fallback: si el grupo no pertenece a la escala aplicable, devuelve null.
 */
export function salaryForGroup(
  applicableScaleId: string | null,
  group: SalaryGroupRef | null | undefined,
  valuesByGroup: Record<string, SalaryValue | null>
): SalaryValue | null {
  if (!applicableScaleId || !group) return null
  if (group.salary_scale_id !== applicableScaleId) return null
  return valuesByGroup[group.id] || null
}

export const formatSalary = (v: { amount: number; currency_code: string }) =>
  `${v.amount.toLocaleString("es-CU", { minimumFractionDigits: 2 })} ${v.currency_code}`
