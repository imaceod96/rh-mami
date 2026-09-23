import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SelectItem } from "@/components/ui/select"
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
        title="Roles y permisos"
        description="Gestión separada de roles de plataforma y roles de organización"
      />

      {error && (
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
        )}

      <RolesManager scope="platform" />

      <SiteCorpCard
        title="Roles de organización"
        description="Cada conjunto de roles pertenece a un workspace independiente."
      >
        <div className="grid gap-4 lg:max-w-2xl">
          <SiteCorpSelect
            label="Workspace / cliente"
            value={selectedTenantId}
            onValueChange={setSelectedTenantId}
          >
            {tenants.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.code})
              </SelectItem>
            ))}
          </SiteCorpSelect>

          {loading ? (
            <SiteCorpLoading rows={3} />
          ) : tenants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No hay workspaces disponibles. Primero crea un cliente / organización.
            </div>
          ) : selectedTenant ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-sitecorp-background/60 p-3 text-sm">
              <Building2 className="h-4 w-4 text-sitecorp-primary" />
              <span className="font-medium text-ink">{selectedTenant.name}</span>
              <span className="text-muted-foreground">{selectedTenant.code}</span>
            </div>
          ) : null}
        </div>
      </SiteCorpCard>

      {!loading && selectedTenantId && (
        <RolesManager key={selectedTenantId} scope="organization" tenantId={selectedTenantId} />
      )}

      <SiteCorpAlert type="info" title="Separación de conceptos">
        <span className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          El rol define QUÉ puede hacer un usuario. El acceso a entidades organizativas define
          DÓNDE puede hacerlo. Los dos conceptos se gestionan por separado.
        </span>
      </SiteCorpAlert>
    </div>
  )
}

export default RolesPermissions
