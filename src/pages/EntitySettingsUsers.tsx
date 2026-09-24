import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { EntityUsersDialog, type OrganizationEntity } from "@/components/entity-users-dialog"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Search } from "lucide-react"

const EntitySettingsUsers = () => {
  const { currentEntity } = useCurrentEntity()
  const navigate = useNavigate()
  const [usersEntity, setUsersEntity] = React.useState<OrganizationEntity | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!currentEntity) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const timer = setTimeout(() => {
      setLoading(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [currentEntity?.id])

  if (!currentEntity) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Cargando entidad..." description="Obteniendo información de la entidad organizativa" />
        <SiteCorpCard title="Cargando">
          <p className="text-sm text-muted-foreground">Cargando información de la entidad...</p>
        </SiteCorpCard>
      </div>
    )
  }

  const entityAsOrganizationEntity = currentEntity as OrganizationEntity

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Usuarios"
        description="Gestiona los usuarios relacionados con esta entidad"
      />

      <SiteCorpAlert type="info" title="Contexto actual">
        <div className="flex items-center gap-2">
          <span>Entidad actual:</span>
          <strong className="text-ink">{currentEntity.name}</strong>
          <SiteCorpStatusBadge status="neutral">
            {currentEntity.entity_type === "business_group"
              ? "Grupo empresarial"
              : currentEntity.entity_type === "company"
                ? "Empresa"
                : "UEB"}
          </SiteCorpStatusBadge>
        </div>
      </SiteCorpAlert>

      {loading ? (
        <SiteCorpLoading rows={3} />
      ) : (
        <SiteCorpCard title="Acceso a usuarios">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Search className="h-4 w-4" />
                <span>Acceso directo e inheritado a esta entidad</span>
              </div>
              <SiteCorpButton
                variant="outline"
                onClick={() => setUsersEntity(entityAsOrganizationEntity)}
              >
                <Search className="mr-2 h-4 w-4" />
                Gestionar acceso
              </SiteCorpButton>
            </div>

            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Este módulo muestra el acceso de usuarios a esta entidad.
              <br />
              <span className="text-xs">
                Usa el botón "Gestionar acceso" para ver usuarios directos e inheritados.
              </span>
            </div>
          </div>
        </SiteCorpCard>
      )}

      <EntityUsersDialog
        entity={usersEntity}
        onClose={() => setUsersEntity(null)}
        onAccessChanged={() => {}}
      />
    </div>
  )
}

export default EntitySettingsUsers