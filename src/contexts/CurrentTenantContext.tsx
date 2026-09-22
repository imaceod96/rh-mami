import * as React from "react"

interface CurrentTenantContextType {
  currentTenant: Record<string, any> | null
  setCurrentTenant: (tenant: Record<string, any> | null) => void
  clearCurrentTenant: () => void
}

const CurrentTenantContext = React.createContext<CurrentTenantContextType | undefined>(undefined)

export const CurrentTenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTenant, setCurrentTenant] = React.useState<Record<string, any> | null>(null)

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