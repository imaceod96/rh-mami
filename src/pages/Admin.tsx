import * as React from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Building2, Users, Settings, ArrowRight } from "lucide-react"

const Admin = () => {
  const { user, profile, isPlatformSuperAdmin } = useAuth()
  const { currentTenant } = useCurrentTenant()
  const [metrics, setMetrics] = React.useState({
    total: 0,
    active: 0,
    inactive: 0,
  })
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const loadMetrics = async () => {
      try {
        const { data: tenants } = await supabase.from("tenants").select("*")
        if (tenants) {
          setMetrics({
            total: tenants.length,
            active: tenants.filter((t: any) => t.is_active).length,
            inactive: tenants.filter((t: any) => !t.is_active).length,
          })
        }
      } catch (error) {
        console.error("Error loading metrics:", error)
      } finally {
        setLoading(false)
      }
    }
    loadMetrics()
  }, [])

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Administración Global"
        description="Gestión de la plataforma SiteCorp"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SiteCorpCard title="Total de cuentas">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-ink">{metrics.total}</p>
              <p className="text-sm text-muted-foreground">Cuentas registradas</p>
            </div>
            <Building2 className="h-8 w-8 text-sitecorp-primary" />
          </div>
        </SiteCorpCard>
        <SiteCorpCard title="Cuentas activas">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-sitecorp-success">{metrics.active}</p>
              <p className="text-sm text-muted-foreground">Cuentas activas</p>
            </div>
            <SiteCorpStatusBadge status="success">Activo</SiteCorpStatusBadge>
          </div>
        </SiteCorpCard>
        <SiteCorpCard title="Cuentas inactivas">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-sitecorp-warning">{metrics.inactive}</p>
              <p className="text-sm text-muted-foreground">Cuentas inactivas</p>
            </div>
            <SiteCorpStatusBadge status="warning">Inactivo</SiteCorpStatusBadge>
          </div>
        </SiteCorpCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SiteCorpCard title="Mi cuenta">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sitecorp-primary">
                <span className="text-sm font-bold text-white">
                  {profile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
              <div>
                <p className="font-medium text-ink">{profile?.full_name || "Sin nombre"}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SiteCorpStatusBadge status={isPlatformSuperAdmin ? "success" : "warning"} />
              <span className="text-sm text-muted-foreground">
                {isPlatformSuperAdmin ? "SuperAdmin" : "Rol de plataforma"}
              </span>
            </div>
          </div>
        </SiteCorpCard>

        <SiteCorpCard title="Acciones rápidas">
          <div className="space-y-3">
            <SiteCorpButton className="w-full justify-start" variant="outline">
              <Building2 className="h-4 w-4 mr-2" />
              Gestionar empresas
            </SiteCorpButton>
            <SiteCorpButton className="w-full justify-start" variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Configuración de plataforma
            </SiteCorpButton>
          </div>
        </SiteCorpCard>
      </div>

      <div className="mt-6">
        <SiteCorpButton>
          Ir a Empresas <ArrowRight className="h-4 w-4 ml-2" />
        </SiteCorpButton>
      </div>
    </div>
  )
}

export default Admin