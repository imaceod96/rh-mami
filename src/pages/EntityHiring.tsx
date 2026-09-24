import * as React from "react"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { ShieldCheck } from "lucide-react"

const EntityHiring = () => {
  const { currentEntity } = useCurrentEntity()

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Contratación"
        description="Gestión de procesos de contratación"
      />

      <SiteCorpAlert type="info" title="Módulo en desarrollo">
        El módulo de contratación se implementará en la siguiente fase.
      </SiteCorpAlert>

      <SiteCorpCard title="Contexto actual">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Entidad actual: <strong className="text-ink">{currentEntity?.name || "No seleccionada"}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            organization_entity_id: {currentEntity?.id || "N/A"}
          </p>
        </div>
      </SiteCorpCard>
    </div>
  )
}

export default EntityHiring