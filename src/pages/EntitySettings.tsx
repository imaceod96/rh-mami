import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { Building2, Users, Shield, Scale, FileText } from "lucide-react"

const EntitySettings = () => {
  const { currentEntity } = useCurrentEntity()
  const navigate = useNavigate()

  const settingsItems = [
    {
      title: "Usuarios",
      description: "Gestiona los usuarios y accesos de esta entidad.",
      icon: Users,
      href: `/entity/${currentEntity?.id}/settings/users`,
    },
    {
      title: "Roles y permisos",
      description: "Configura los roles y capacidades de esta entidad.",
      icon: Shield,
      href: `/entity/${currentEntity?.id}/settings/roles`,
    },
    {
      title: "Escala salarial",
      description: "Consulta o gestiona la escala salarial aplicable.",
      icon: Scale,
      href: `/entity/${currentEntity?.id}/settings/salary`,
    },
    {
      title: "Documentos rectores",
      description: "Espacio reservado para la futura gestión de documentos rectores.",
      icon: FileText,
      href: `/entity/${currentEntity?.id}/settings/governing-documents`,
    },
  ]

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Ajustes"
        description="Administración y configuración de esta entidad"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {settingsItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.title}
              onClick={() => navigate(item.href)}
              className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:border-sitecorp-primary/30 hover:bg-muted/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sitecorp-primary/10">
                <Icon className="h-5 w-5 text-sitecorp-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default EntitySettings