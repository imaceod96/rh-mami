import * as React from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toRomanNumeral } from '@/utils/roman-numerals'

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

export const SalaryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isPlatformSuperAdmin } = useAuth()

  const resolveScaleForEntity = React.useCallback(async (entityId: string): Promise<SalaryScale | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase.rpc('resolve_salary_scale_for_entity', {
        entity_id: entityId
      })
      if (error) throw error
      if (!data) return null
      
      const { data: scaleData, error: scaleError } = await supabase
        .from('salary_scales')
        .select('*')
        .eq('id', data)
        .single()
      
      if (scaleError) throw scaleError
      return scaleData as SalaryScale
    } catch (err) {
      console.error('[SalaryContext] Error resolving scale for entity:', err)
      return null
    }
  }, [user])

  const fetchScaleWithGroups = React.useCallback(async (scaleId: string): Promise<SalaryScaleWithGroups | null> => {
    if (!user) return null
    try {
      const { data: scaleData, error: scaleError } = await supabase
        .from('salary_scales')
        .select('*')
        .eq('id', scaleId)
        .single()
      
      if (scaleError) throw scaleError
      const scale = scaleData as SalaryScale
      
      const { data: groupsData, error: groupsError } = await supabase
        .from('salary_groups')
        .select('*')
        .eq('salary_scale_id', scaleId)
        .eq('is_active', true)
        .order('sequence_number')
      
      if (groupsError) throw groupsError
      const groups = groupsData as SalaryGroup[]

      // Importe vigente por grupo resuelto por vigencia temporal (la fecha es la fuente de verdad)
      const valuesByGroup: Record<string, SalaryGroupCurrentValue> = {}
      if (groups.length > 0) {
        const { data: valuesData, error: valuesError } = await supabase.rpc(
          'resolve_salary_group_values',
          {
            p_group_ids: groups.map(g => g.id),
            p_effective_date: null
          }
        )
        if (valuesError) throw valuesError
        ;((valuesData as any[]) || []).forEach(v => {
          valuesByGroup[v.salary_group_id] = {
            amount: v.amount,
            currency_code: v.currency_code,
            effective_from: v.effective_from,
            effective_to: v.effective_to
          }
        })
      }

      const groupsWithValues: SalaryGroupWithCurrent[] = groups.map(group => ({
        group,
        current_value: valuesByGroup[group.id] || null,
        roman_numeral: toRomanNumeral(group.sequence_number)
      }))

      return { scale, groups: groupsWithValues }
    } catch (err) {
      console.error('[SalaryContext] Error fetching scale with groups:', err)
      return null
    }
  }, [user])

  const fetchGlobalPresupuestadaScale = React.useCallback(async (): Promise<SalaryScale | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase
        .from('salary_scales')
        .select('*')
        .eq('scope_type', 'PRESUPUESTADA_GLOBAL')
        .eq('is_active', true)
        .single()
      
      if (error) throw error
      return data as SalaryScale
    } catch (err) {
      console.error('[SalaryContext] Error fetching global presupuestada scale:', err)
      return null
    }
  }, [user])

  const fetchEntityEmpresarialScale = React.useCallback(async (entityId: string): Promise<SalaryScale | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase
        .from('salary_scales')
        .select('*')
        .eq('scope_type', 'EMPRESARIAL_ENTITY')
        .eq('organization_entity_id', entityId)
        .eq('is_active', true)
        .single()
      
      if (error) throw error
      return data as SalaryScale
    } catch (err) {
      console.error('[SalaryContext] Error fetching entity empresarial scale:', err)
      return null
    }
  }, [user])

  const createGlobalPresupuestadaScale = React.useCallback(async (name: string, currencyCode: string, effectiveFrom: string): Promise<SalaryScale | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase
        .from('salary_scales')
        .insert({
          scope_type: 'PRESUPUESTADA_GLOBAL',
          tenant_id: null,
          organization_entity_id: null,
          regime_id: 'PRESUPUESTADA',
          name,
          description: 'Escala salarial presupuestada general de SiteCorp',
          currency_code: currencyCode,
          is_active: true
        })
        .select()
        .single()
      
      if (error) throw error
      return data as SalaryScale
    } catch (err) {
      console.error('[SalaryContext] Error creating global presupuestada scale:', err)
      throw err
    }
  }, [user])

  const createEntityEmpresarialScale = React.useCallback(async (entityId: string, name: string, currencyCode: string, effectiveFrom: string): Promise<SalaryScale | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase
        .from('salary_scales')
        .insert({
          scope_type: 'EMPRESARIAL_ENTITY',
          tenant_id: null,
          organization_entity_id: entityId,
          regime_id: 'EMPRESARIAL',
          name,
          description: 'Escala salarial empresarial de la entidad',
          currency_code: currencyCode,
          is_active: true
        })
        .select()
        .single()
      
      if (error) throw error
      return data as SalaryScale
    } catch (err) {
      console.error('[SalaryContext] Error creating entity empresarial scale:', err)
      throw err
    }
  }, [user])

  const addSalaryGroup = React.useCallback(async (scaleId: string, description?: string): Promise<SalaryGroup | null> => {
    if (!user) return null
    try {
      // Get the next sequence number
      const { data: maxData, error: maxError } = await supabase
        .from('salary_groups')
        .select('sequence_number')
        .eq('salary_scale_id', scaleId)
        .order('sequence_number', { ascending: false })
        .limit(1)
      
      if (maxError) throw maxError
      
      const nextSequence = maxData && maxData.length > 0 
        ? Math.max(...maxData.map(g => g.sequence_number)) + 1 
        : 1
      
      const { data, error } = await supabase
        .from('salary_groups')
        .insert({
          salary_scale_id: scaleId,
          sequence_number: nextSequence,
          description: description || null,
          is_active: true
        })
        .select()
        .single()
      
      if (error) throw error
      return data as SalaryGroup
    } catch (err) {
      console.error('[SalaryContext] Error adding salary group:', err)
      throw err
    }
  }, [user])

  const updateSalaryGroup = React.useCallback(async (groupId: string, updates: Partial<SalaryGroup>): Promise<SalaryGroup | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase
        .from('salary_groups')
        .update(updates)
        .eq('id', groupId)
        .select()
        .single()
      
      if (error) throw error
      return data as SalaryGroup
    } catch (err) {
      console.error('[SalaryContext] Error updating salary group:', err)
      throw err
    }
  }, [user])

  const deactivateSalaryGroup = React.useCallback(async (groupId: string): Promise<boolean> => {
    if (!user) return false
    try {
      const { error } = await supabase
        .from('salary_groups')
        .update({ is_active: false })
        .eq('id', groupId)
      
      if (error) throw error
      return true
    } catch (err) {
      console.error('[SalaryContext] Error deactivating salary group:', err)
      return false
    }
  }, [user])

  /**
   * Registra una nueva vigencia del importe salarial a través de la función atómica
   * `apply_salary_group_value_change` (nunca sobrescribe valores anteriores).
   * Para cambios de importe sobre un grupo existente usar el flujo de revisión
   * (ReviewSalaryChangeDialog), que muestra el impacto antes de aplicar.
   */
  const addSalaryValue = React.useCallback(async (
    groupId: string,
    amount: number,
    currencyCode: string,
    effectiveFrom: string
  ): Promise<SalaryGroupValue | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase.rpc('apply_salary_group_value_change', {
        p_salary_group_id: groupId,
        p_new_amount: amount,
        p_currency_code: currencyCode || null,
        p_effective_from: effectiveFrom,
        p_notes: null
      })
      if (error) throw error

      const valueId = (data as { salary_group_value_id?: string } | null)?.salary_group_value_id
      if (!valueId) return null

      const { data: row, error: rowError } = await supabase
        .from('salary_group_values')
        .select('*')
        .eq('id', valueId)
        .single()
      if (rowError) throw rowError
      return row as SalaryGroupValue
    } catch (err) {
      console.error('[SalaryContext] Error adding salary value:', err)
      throw err
    }
  }, [user])

  const fetchSalaryHistory = React.useCallback(async (groupId: string): Promise<SalaryGroupValue[]> => {
    if (!user) return []
    try {
      const { data, error } = await supabase
        .from('salary_group_values')
        .select('*')
        .eq('salary_group_id', groupId)
        .order('effective_from', { ascending: false })
      
      if (error) throw error
      return data as SalaryGroupValue[]
    } catch (err) {
      console.error('[SalaryContext] Error fetching salary history:', err)
      return []
    }
  }, [user])

  const getCurrentSalaryValue = React.useCallback(async (groupId: string): Promise<SalaryGroupValue | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase
        .from('salary_group_values')
        .select('*')
        .eq('salary_group_id', groupId)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single()
      
      if (error && error.code !== 'PGRST116') throw error
      return data as SalaryGroupValue | null
    } catch (err) {
      console.error('[SalaryContext] Error getting current salary value:', err)
      return null
    }
  }, [user])

  const resolveSalaryValue = React.useCallback(async (
    entityId: string, 
    groupId: string, 
    effectiveDate?: string
  ): Promise<SalaryGroupValue | null> => {
    if (!user) return null
    try {
      const { data, error } = await supabase.rpc('resolve_salary_value', {
        entity_id: entityId,
        salary_group_id: groupId,
        effective_date: effectiveDate || new Date().toISOString().split('T')[0]
      })
      
      if (error) throw error
      if (!data || data.length === 0) return null
      
      return data[0] as SalaryGroupValue
    } catch (err) {
      console.error('[SalaryContext] Error resolving salary value:', err)
      return null
    }
  }, [user])

  const canViewSalary = React.useCallback(async (entityId?: string): Promise<boolean> => {
    if (!user) return false
    try {
      if (isPlatformSuperAdmin) return true
      
      const { data, error } = await supabase.rpc('has_platform_permission', {
        permission_code: 'salary.view'
      })
      
      if (error) throw error
      if (data) return true
      
      if (entityId) {
        const { data: entityAccess, error: entityError } = await supabase.rpc('can_access_entity', {
          target_entity_id: entityId,
          permission_code: 'salary.view'
        })
        
        if (entityError) throw entityError
        return !!entityAccess
      }
      
      return false
    } catch (err) {
      console.error('[SalaryContext] Error checking salary view permission:', err)
      return false
    }
  }, [user, isPlatformSuperAdmin])

  const canManageSalary = React.useCallback(async (entityId?: string): Promise<boolean> => {
    if (!user) return false
    try {
      if (isPlatformSuperAdmin) return true
      
      const { data, error } = await supabase.rpc('has_platform_permission', {
        permission_code: 'salary.manage'
      })
      
      if (error) throw error
      if (data) return true
      
      if (entityId) {
        const { data: entityAccess, error: entityError } = await supabase.rpc('can_access_entity', {
          target_entity_id: entityId,
          permission_code: 'salary.manage'
        })
        
        if (entityError) throw entityError
        return !!entityAccess
      }
      
      return false
    } catch (err) {
      console.error('[SalaryContext] Error checking salary manage permission:', err)
      return false
    }
  }, [user, isPlatformSuperAdmin])

  const canManageGlobalSalary = React.useCallback(async (): Promise<boolean> => {
    if (!user) return false
    try {
      if (isPlatformSuperAdmin) return true
      
      const { data, error } = await supabase.rpc('has_platform_permission', {
        permission_code: 'salary.manage'
      })
      
      if (error) throw error
      return !!data
    } catch (err) {
      console.error('[SalaryContext] Error checking global salary manage permission:', err)
      return false
    }
  }, [user, isPlatformSuperAdmin])

  return (
    <SalaryContext.Provider value={{
          resolveScaleForEntity,
          fetchScaleWithGroups,
          fetchGlobalPresupuestadaScale,
          fetchEntityEmpresarialScale,
          createGlobalPresupuestadaScale,
          createEntityEmpresarialScale,
          addSalaryGroup,
          updateSalaryGroup,
          deactivateSalaryGroup,
          addSalaryValue,
          fetchSalaryHistory,
          getCurrentSalaryValue,
          resolveSalaryValue,
          canViewSalary,
          canManageSalary,
          canManageGlobalSalary
        }}>
      {children}
    </SalaryContext.Provider>
  )
}
