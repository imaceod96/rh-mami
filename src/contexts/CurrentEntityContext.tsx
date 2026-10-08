import * as React from "react"

export interface OrganizationEntityRow {
  id: string
  tenant_id: string
  parent_id: string | null
  entity_type: string
  name: string
  code: string
  regime_id: string
  status: string | null
  description: string | null
  created_at: string | null
  updated_at: string | null
  is_active: boolean | null
  is_sitecorp_account: boolean | null
  account_is_active: boolean | null
  account_code: string | null
  address: string | null
  municipality: string | null
  province: string | null
  postal_code: string | null
  organism: string | null
  branch: string | null
  labor_identification_code: string | null
  revolution_year: string | null
}

interface CurrentEntityContextType {
  currentEntity: OrganizationEntityRow | null
  setCurrentEntity: (entity: OrganizationEntityRow | null) => void
  clearCurrentEntity: () => void
}

const CurrentEntityContext = React.createContext<CurrentEntityContextType | undefined>(undefined)

export const CurrentEntityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentEntity, setCurrentEntity] = React.useState<OrganizationEntityRow | null>(null)

  const clearCurrentEntity = React.useCallback(() => {
    setCurrentEntity(null)
  }, [])

  return (
    <CurrentEntityContext.Provider
      value={{
        currentEntity,
        setCurrentEntity,
        clearCurrentEntity,
      }}
    >
      {children}
    </CurrentEntityContext.Provider>
  )
}

export const useCurrentEntity = (): CurrentEntityContextType => {
  const context = React.useContext(CurrentEntityContext)
  if (context === undefined) {
    throw new Error("useCurrentEntity must be used within a CurrentEntityProvider")
  }
  return context
}

export { CurrentEntityContext }
