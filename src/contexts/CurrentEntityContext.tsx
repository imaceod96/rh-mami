import * as React from "react"

interface CurrentEntityContextType {
  currentEntity: Record<string, any> | null
  setCurrentEntity: (entity: Record<string, any> | null) => void
  clearCurrentEntity: () => void
}

const CurrentEntityContext = React.createContext<CurrentEntityContextType | undefined>(undefined)

export const CurrentEntityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentEntity, setCurrentEntity] = React.useState<Record<string, any> | null>(null)

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
