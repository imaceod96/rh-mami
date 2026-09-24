import * as React from "react"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { RolesManager } from "@/components/roles-manager"

const EntitySettingsRoles = () => {
  const { currentEntity } = useCurrentEntity()

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Roles y permisos"
        description="Roles y permisos específicos de esta entidad organizativa"
      />

      {currentEntity ? (
        <RolesManager
          scope="organization"
          organizationEntityId={currentEntity.id}
        />
      ) : (
        <div className="space-y-6 p-6">
          <div className="space-y-6 p-6">
            <p className="text-sm text-muted-foreground">Cargando entidad...</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default EntitySettingsRoles