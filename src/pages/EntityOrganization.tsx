import * as React from "react"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Building2, Layers, Factory, Users, ShieldCheck, FileText } from "lucide-react"

const entityTypeLabels: Record<string, string> = {
  business_group: "Grupo empresarial",
  company: "Empresa",
  ueb: "UEB / Unidad Empresarial de Base",
}

const typeIcon = (type: string) => {
  if (type === "business_group") return <Layers className="h-6 w-6 text-sitecorp-primary" />
  if (type === "company") return <Building2 className="h-6 w-6 text-sitecorp-primary" />
  return <Factory className="h-6 w-6 text-sitecorp-primary" />
}

const EntityOrganization = () => {
  const { currentEntity } = useCurrentEntity()

  if (!currentEntity) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Cargando entidad..."
          description="Obteniendo información de la entidad organizativa"
        />
        <SiteCorpCard title="Cargando">
          <p className="text-sm text-muted-foreground">Cargando información de la entidad...</p>
        </SiteCorpCard>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Organización"
        description="Estructura organizativa de la entidad actual"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <SiteCorpCard title="Información de la entidad">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {typeIcon(currentEntity.entity_type)}
              <p className="text-sm font-semibold text-ink">
                {entityTypeLabels[currentEntity.entity_type]}
              </p>
              <SiteCorpStatusBadge status={currentEntity.is_active ? "success" : "danger"}>
                {currentEntity.is_active ? "Activa" : "Inactiva"}
              </SiteCorpStatusBadge>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Código interno</p>
              <p className="text-base font-mono text-ink">{currentEntity.code}</p>
            </div>

            {currentEntity.description && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Descripción</p>
                <p className="text-sm text-ink">{currentEntity.description}</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Régimen</p>
              <p className="text-sm text-ink">{currentEntity.regime_id}</p>
            </div>
          </div>
        </SiteCorpCard>

        <SiteCorpCard title="Estado de la cuenta">
          <div className="space-y-4">
            {currentEntity.is_sitecorp_account ? (
              <>
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-sitecorp-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">Cuenta SiteCorp</p>
                    <p className="text-base font-mono text-ink">{currentEntity.account_code}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">Estado de la cuenta</p>
                    <SiteCorpStatusBadge
                      status={currentEntity.account_is_active ? "success" : "warning"}
                    >
                      {currentEntity.account_is_active ? "Activa" : "Suspendida"}
                    </SiteCorpStatusBadge>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">Entidad activa</p>
                    <SiteCorpStatusBadge
                      status={currentEntity.is_active ? "success" : "danger"}
                    >
                      {currentEntity.is_active ? "Sí" : "No"}
                    </SiteCorpStatusBadge>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  Esta entidad no tiene una cuenta SiteCorp propia.
                </p>
              </div>
            )}
          </div>
        </SiteCorpCard>
      </div>
    </div>
  )
}

export default EntityOrganization