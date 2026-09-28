import { supabase } from "@/lib/supabase"

export interface SalaryValue {
  amount: number
  currency_code: string
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
 * Obtiene el importe vigente (último por effective_from) de cada grupo salarial.
 * Fuente de verdad única para Plantilla Operativa y la ficha del trabajador.
 */
export async function fetchActiveSalaryValuesForGroups(
  groupIds: string[]
): Promise<Record<string, SalaryValue | null>> {
  const map: Record<string, SalaryValue | null> = {}
  const uniqueIds = Array.from(new Set(groupIds.filter((id): id is string => !!id)))
  if (uniqueIds.length === 0) return map

  const { data, error } = await supabase
    .from("salary_group_values")
    .select("salary_group_id, amount, currency_code, effective_from")
    .in("salary_group_id", uniqueIds)
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
  if (error) throw error

  ;(data as { salary_group_id: string; amount: number; currency_code: string }[] | null)?.forEach(
    (v) => {
      if (map[v.salary_group_id] === undefined) {
        map[v.salary_group_id] = { amount: v.amount, currency_code: v.currency_code }
      }
    }
  )
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

export const formatSalary = (v: SalaryValue) =>
  `${v.amount.toLocaleString("es-CU", { minimumFractionDigits: 2 })} ${v.currency_code}`
