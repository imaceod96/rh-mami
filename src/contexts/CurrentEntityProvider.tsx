import * as React from "react"
import {
  CurrentEntityContext,
  type OrganizationEntityRow,
} from "@/contexts/CurrentEntityContext"

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
