import * as React from "react"
import {
  CurrentCompanyClientContext,
  type CompanyClientSummary,
} from "@/contexts/CurrentCompanyClientContext"

/**
 * ÚNICA fuente de verdad del cliente activo.
 *
 * Sustituye a `CurrentTenantProvider` conservando EXACTAMENTE el mismo
 * comportamiento: estado en memoria, sin persistencia, con el mismo
 * establecimiento, cambio y limpieza. No concede permisos: la autorización real
 * sigue siendo RLS + las RPC de Supabase.
 */
export const CurrentCompanyClientProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentCompanyClient, setCurrentCompanyClient] =
    React.useState<CompanyClientSummary | null>(null)

  const clearCurrentCompanyClient = React.useCallback(() => {
    setCurrentCompanyClient(null)
  }, [])

  return (
    <CurrentCompanyClientContext.Provider
      value={{
        currentCompanyClient,
        setCurrentCompanyClient,
        clearCurrentCompanyClient,
      }}
    >
      {children}
    </CurrentCompanyClientContext.Provider>
  )
}
