import * as React from "react"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Building2, Layers, Factory, Users, Briefcase, FileText } from "lucide-react"

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

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon }) => (
  <SiteCorpCard>
    <div className="flex items-start justify-between">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-ink">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {icon && <div className="rounded-lg bg-sitecorp-primary/10 p-2">{icon}</div>}
    </div>
  </SiteCorpCard>
)

const EntitySummary = () => {
  const { currentEntity } = useCurrentEntity()

  if (!currentEntity) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Cargando resumen..." description="Obteniendo información de la entidad" />
        <SiteCorpCard title="Cargando">
          <p className="text-sm text-muted-foreground">Cargando resumen de la entidad...</p>
        </SiteCorpCard>
      </div>
    )
  }

  const entityType = entityTypeLabels[currentEntity.entity_type] || "Entidad"
  const regime = currentEntity.regime_id || "—"
  const accountCode = currentEntity.account_code || "—"
  const parentEntity = currentEntity.parent_entity_id ? (
    <span className="text-sm text-ink">{currentEntity.parent_entity_id}</span>
  ) : null

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title={`Resumen — ${currentEntity.name}`}
        description={`${entityType} • ${currentEntity.code}`}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Empleados activos"
          value="—"
          subtitle="Sin datos aún"
          icon={<Users className="h-5 w-5 text-sitecorp-primary" />}
        />
        <KpiCard
          title="Plazas vacantes"
          value="—"
          subtitle="Disponible al configurar la plantilla"
          icon={<Briefcase className="h-5 w-5 text-sitecorp-primary" />}
        />
        <KpiCard
          title="Candidatos"
          value="—"
          subtitle="Sin datos aún"
          icon={<Users className="h-5 w-5 text-sitecorp-primary" />}
        />
        <KpiCard
          title="Plazas aprobadas"
          value="—"
          subtitle="Sin datos aún"
          icon={<FileText className="h-5 w-5 text-sitecorp-primary" />}
        />
      </div>

      {/* Quick Access */}
      <SiteCorpCard title="Accesos rápidos">
        <div className="grid gap-2 sm:grid-cols-3">
          <a
            href="#organization"
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-ink hover:bg-muted transition-colors"
          >
            <Building2 className="h-4 w-4 text-sitecorp-primary" />
            Ver organización
          </a>
          <a
            href="#candidates"
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-ink hover:bg-muted transition-colors"
          >
            <Users className="h-4 w-4 text-sitecorp-primary" />
            Ver candidatos
          </a>
          <a
            href="#staffing"
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-ink hover:bg-muted transition-colors"
          >
            <FileText className="h-4 w-4 text-sitecorp-primary" />
            Ver plantilla
          </a>
        </div>
      </SiteCorpCard>

      {/* Compact General Information */}
      <SiteCorpCard title="Información general">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Tipo de entidad</p>
            <p className="text-sm font-medium text-ink">{entityType}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Régimen</p>
            <p className="text-sm font-medium text-ink">{regime}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Estado</p>
            <SiteCorpStatusBadge status={currentEntity.is_active ? "success" : "danger"}>
              {currentEntity.is_active ? "Activa" : "Inactiva"}
            </SiteCorpStatusBadge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Cuenta SiteCorp</p>
            <p className="text-sm font-mono text-ink">{accountCode}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Código interno</p>
            <p className="text-sm font-mono text-ink">{currentEntity.code}</p>
          </div>
          {parentEntity && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Entidad superior</p>
              <p className="text-sm font-mono text-ink">{currentEntity.parent_entity_id}</p>
            </div>
          )}
        </div>
      </SiteCorpCard>
    </div>
  )
}

export default EntitySummary