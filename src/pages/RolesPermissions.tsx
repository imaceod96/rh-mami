import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import RolesManager from "@/components/roles-manager"
import { Building2, Shield } from "lucide-react"

interface TenantOption {
  id: string
  name: string
  code: string
  is_active: boolean
}

const RolesPermissions = () => {
  const [tenants, setTenants] = React.useState<TenantOption[]>([])
  const [selectedTenantId, setSelectedTenantId] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const loadTenants = async () => {
      try {
        setError(null)
        setLoading(true)

        const { data, error: tenantsError } = await supabase
          .from("tenants")
          .select("id,name,code,is_active")
          .order("name")

        if (tenantsError) throw tenantsError

        const rows = data || []
        setTenants(rows)
        setSelectedTenantId((current) => current || rows[0]?.id || "")
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los workspaces.")
      } finally {
        setLoading(false)
      }
    }

    loadTenants()
  }, [])

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId)

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Roles y permisos de plataforma"
        description="Gestión global de roles y permisos de la plataforma SiteCorp"
      />

      {error && (
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
      )}

      <RolesManager scope="platform" />

      <SiteCorpAlert type="info" title="Roles de plataforma">
        <span className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          Los roles de plataforma controlan qué pueden hacer los administradores y operadores de SiteCorp a nivel global.
        </span>
      </SiteCorpAlert>
    </div>
  )
}

export default RolesPermissions