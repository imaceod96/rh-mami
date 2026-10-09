/**
 * Shim de compatibilidad.
 *
 * Reexporta explícitamente la interfaz pública original del módulo, ahora migrada
 * al contexto DDD `src/domains/organization-structure/`.
 *
 * La dirección de dependencias es shim → dominio. Nunca dominio → shim.
 */

export type { SalaryValue } from "@/domains/organization-structure"
export type { SalaryGroupRef } from "@/domains/organization-structure"

export { resolveApplicableScaleId } from "@/domains/organization-structure"
export { fetchSalaryValuesForGroups } from "@/domains/organization-structure"
export { salaryForGroup } from "@/domains/organization-structure"
export { formatSalary } from "@/domains/organization-structure"
