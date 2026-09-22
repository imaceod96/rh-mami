import * as React from "react"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"

const Organization = () => {
  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Organización"
        description="Gestión de la estructura organizativa"
      />

      <SiteCorpAlert type="info">
        Este módulo está en desarrollo. Pronto podrás gestionar la estructura organizativa de tu empresa.
      </SiteCorpAlert>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SiteCorpCard title="Estructura actual" description="Visualización del organigrama">
          <p className="text-sm text-muted-foreground">
            Contenido del organigrama en desarrollo.
          </p>
        </SiteCorpCard>
        <SiteCorpCard title="Departamentos" description="Gestión de departamentos">
          <p className="text-sm text-muted-foreground">
            Lista de departamentos en desarrollo.
          </p>
        </SiteCorpCard>
        <SiteCorpCard title="Puestos" description="Definición de puestos">
          <p className="text-sm text-muted-foreground">
            Catálogo de puestos en desarrollo.
          </p>
        </SiteCorpCard>
      </div>
    </div>
  )
}

export default Organization