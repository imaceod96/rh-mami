import * as React from "react"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { FileText } from "lucide-react"

const EntitySettingsGoverningDocuments = () => {
  const { currentEntity } = useCurrentEntity()

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Documentos rectores"
        description="Gestión de documentos rectores de la entidad"
      />

      <SiteCorpAlert type="info" title="Módulo reservado">
        Esta sección permitirá gestionar los documentos rectores de la entidad.
        <br />
        Su configuración y funcionamiento se definirán en una fase posterior.
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

      <SiteCorpCard title="Estado del módulo">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>Documento de política, procedimientos y lineamientos rectores de la entidad.</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>Este espacio está reservado para la futura fase de documentación.</span>
          </div>
        </div>
      </SiteCorpCard>
    </div>
  )
}

export default EntitySettingsGoverningDocuments