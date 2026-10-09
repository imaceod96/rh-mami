import * as React from "react"
import {
  CurrentTenantContext,
  type TenantSummary,
} from "@/contexts/CurrentTenantContext"

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
