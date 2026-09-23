import * as React from "react"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import RolesManager from "@/components/roles-manager"

const TenantRoles = () => {
  const { currentTenant } = useCurrentTenant()

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Roles y permisos"
        description={`Roles de organización para ${currentTenant?.name || "el workspace actual"}`}
      />

      {!currentTenant ? (
        <SiteCorpAlert type="warning" title="Workspace requerido">
          Selecciona un workspace de organización para gestionar sus roles.
        </SiteCorpAlert>
      ) : (
        <RolesManager scope="organization" tenantId={currentTenant.id} />
      )}
    </div>
  )
}

export default TenantRoles
