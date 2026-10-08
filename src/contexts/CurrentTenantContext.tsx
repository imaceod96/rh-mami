import * as React from "react"

export interface TenantSummary {
  id: string
  name: string
  code?: string | null
  description?: string | null
  is_active?: boolean | null
  created_at?: string | null
  updated_at?: string | null
}

interface CurrentTenantContextType {
  currentTenant: TenantSummary | null
  setCurrentTenant: (tenant: TenantSummary | null) => void
  clearCurrentTenant: () => void
}

const CurrentTenantContext = React.createContext<CurrentTenantContextType | undefined>(undefined)

export const CurrentTenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTenant, setCurrentTenant] = React.useState<TenantSummary | null>(null)

  const clearCurrentTenant = React.useCallback(() => {
    setCurrentTenant(null)
  }, [])

  return (
    <CurrentTenantContext.Provider
      value={{
        currentTenant,
        setCurrentTenant,
        clearCurrentTenant,
      }}
    >
      {children}
    </CurrentTenantContext.Provider>
  )
}

export const useCurrentTenant = (): CurrentTenantContextType => {
  const context = React.useContext(CurrentTenantContext)
  if (context === undefined) {
    throw new Error("useCurrentTenant must be used within a CurrentTenantProvider")
  }
  return context
}

export { CurrentTenantContext }