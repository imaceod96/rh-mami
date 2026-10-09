import * as React from 'react'

export interface SalaryScale {
  id: string
  scope_type: 'PRESUPUESTADA_GLOBAL' | 'EMPRESARIAL_ENTITY'
  tenant_id: string | null
  organization_entity_id: string | null
  regime_id: string
  name: string
  description: string | null
  currency_code: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SalaryGroup {
  id: string
  salary_scale_id: string
  sequence_number: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SalaryGroupValue {
  id: string
  salary_group_id: string
  amount: number
  currency_code: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SalaryGroupCurrentValue {
  amount: number
  currency_code: string
  effective_from: string
  effective_to: string | null
}

/** Fila devuelta por la RPC resolve_salary_group_values (vigencia temporal por grupo). */
export interface ResolvedSalaryGroupValue extends SalaryGroupCurrentValue {
  salary_group_id: string
}

export interface SalaryGroupWithCurrent {
  group: SalaryGroup
  /** Importe vigente HOY (resolución temporal por effective_from / effective_to) */
  current_value: SalaryGroupCurrentValue | null
  roman_numeral: string
}

export interface SalaryScaleWithGroups {
  scale: SalaryScale
  groups: SalaryGroupWithCurrent[]
}

interface SalaryContextType {
  // Scale operations
  resolveScaleForEntity: (entityId: string) => Promise<SalaryScale | null>
  fetchScaleWithGroups: (scaleId: string) => Promise<SalaryScaleWithGroups | null>
  fetchGlobalPresupuestadaScale: () => Promise<SalaryScale | null>
  fetchEntityEmpresarialScale: (entityId: string) => Promise<SalaryScale | null>
  createGlobalPresupuestadaScale: (name: string, currencyCode: string, effectiveFrom: string) => Promise<SalaryScale | null>
  createEntityEmpresarialScale: (entityId: string, name: string, currencyCode: string, effectiveFrom: string) => Promise<SalaryScale | null>

  // Group operations
  addSalaryGroup: (scaleId: string, description?: string) => Promise<SalaryGroup | null>
  updateSalaryGroup: (groupId: string, updates: Partial<SalaryGroup>) => Promise<SalaryGroup | null>
  deactivateSalaryGroup: (groupId: string) => Promise<boolean>

  // Value operations
  addSalaryValue: (groupId: string, amount: number, currencyCode: string, effectiveFrom: string) => Promise<SalaryGroupValue | null>
  fetchSalaryHistory: (groupId: string) => Promise<SalaryGroupValue[]>
  getCurrentSalaryValue: (groupId: string) => Promise<SalaryGroupValue | null>

  // Resolution
  resolveSalaryValue: (entityId: string, groupId: string, effectiveDate?: string) => Promise<SalaryGroupValue | null>

  // Permissions
  canViewSalary: (entityId?: string) => Promise<boolean>
  canManageSalary: (entityId?: string) => Promise<boolean>
  canManageGlobalSalary: () => Promise<boolean>
}

const SalaryContext = React.createContext<SalaryContextType | undefined>(undefined)

export const useSalary = () => {
  const context = React.useContext(SalaryContext)
  if (!context) {
    throw new Error('useSalary must be used within a SalaryProvider')
  }
  return context
}

export { SalaryContext }
