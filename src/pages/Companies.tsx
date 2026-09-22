import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpTable } from "@/components/ui/sitecorp-table"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpFormSection } from "@/components/ui/sitecorp-form-section"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpError } from "@/components/ui/sitecorp-error"
import { Pencil, Plus, Power, LogIn, Trash2 } from "lucide-react"

interface Tenant {
  id: string
  name: string
  code: string
  description: string | null
  is_active: boolean
  created_at: string
}

const Companies = () => {
  const { isPlatformSuperAdmin } = useAuth()
  const { setCurrentTenant } = useCurrentTenant()
  const navigate = useNavigate()
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingTenant, setEditingTenant] = React.useState<Tenant | null>(null)
  const [formData, setFormData] = React.useState({
    name: "",
    code: "",
    description: "",
    is_active: true,
  })

  const loadTenants = React.useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false })

      if (fetchError) throw fetchError
      setTenants(data || [])
    } catch (err) {
      console.error("Error loading tenants:", err)
      setError("No se pudo cargar la lista de empresas.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadTenants()
  }, [loadTenants])

  const startCreate = () => {
    setEditingTenant(null)
    setFormData({ name: "", code: "", description: "", is_active: true })
  }

  const startEdit = (tenant: Tenant) => {
    setEditingTenant(tenant)
    setFormData({
      name: tenant.name,
      code: tenant.code,
      description: tenant.description || "",
      is_active: tenant.is_active,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingTenant) {
        const { error } = await supabase
          .from("tenants")
          .update(formData)
          .eq("id", editingTenant.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from("tenants").insert(formData)

        if (error) throw error
      }
      setEditingTenant(null)
      setFormData({ name: "", code: "", description: "", is_active: true })
      await loadTenants()
    } catch (err) {
      setError("No se pudo guardar la empresa.")
    }
  }

  const deactivate = async (tenant: Tenant) => {
    try {
      const { error } = await supabase
        .from("tenants")
        .update({ is_active: false })
        .eq("id", tenant.id)
      if (error) throw error
      await loadTenants()
    } catch (err) {
      console.error("Error deactivating tenant:", err)
      setError("No se pudo desactivar la empresa.")
    }
  }

  const activate = async (tenant: Tenant) => {
    try {
      const { error } = await supabase
        .from("tenants")
        .update({ is_active: true })
        .eq("id", tenant.id)
      if (error) throw error
      await loadTenants()
    } catch (err) {
      console.error("Error activating tenant:", err)
      setError("No se pudo reactivar la empresa.")
    }
  }

  const enterTenant = (tenant: Tenant) => {
      setCurrentTenant(tenant)
      navigate("/")
    }

  const columns = [
    { header: "Nombre", accessor: "name" },
    { header: "Código", accessor: "code" },
    { header: "Estado", accessor: "status" },
    { header: "Fecha de creación", accessor: "created_at" },
    { header: "Acciones", accessor: "actions" },
  ]

  const rows = tenants.map((tenant) => ({
    name: tenant.name,
    code: tenant.code,
    status: (
      <SiteCorpStatusBadge status={tenant.is_active ? "success" : "warning"}>
        {tenant.is_active ? "Activa" : "Inactiva"}
      </SiteCorpStatusBadge>
    ),
    created_at: new Date(tenant.created_at).toLocaleDateString("es-ES"),
    actions: (
      <div className="flex items-center gap-2">
        <SiteCorpButton size="sm" variant="outline" onClick={() => startEdit(tenant)}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
        </SiteCorpButton>
        {!tenant.is_active ? (
          <SiteCorpButton size="sm" variant="outline" onClick={() => activate(tenant)}>
            <Power className="h-3.5 w-3.5 mr-1" /> Reactivar
          </SiteCorpButton>
        ) : (
          <SiteCorpButton size="sm" variant="outline" onClick={() => deactivate(tenant)}>
            <Power className="h-3.5 w-3.5 mr-1" /> Desactivar
          </SiteCorpButton>
        )}
        <SiteCorpButton size="sm" variant="outline" onClick={() => enterTenant(tenant)}>
          <LogIn className="h-3.5 w-3.5 mr-1" /> Entrar
        </SiteCorpButton>
      </div>
    ),
  }))

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Empresas"
        description="Gestión de cuentas de clientes de la plataforma"
        actions={
          <SiteCorpButton onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" /> Crear empresa
          </SiteCorpButton>
        }
      />

      {error && (
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
      )}

      {!isPlatformSuperAdmin && (
        <SiteCorpAlert type="warning" title="Acceso restringido">
          Necesitas ser SuperAdmin para gestionar empresas.
        </SiteCorpAlert>
      )}

      <SiteCorpCard title="Cuentas de clientes">
        {loading ? (
          <SiteCorpLoading rows={5} />
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay empresas registradas.
          </div>
        ) : (
          <SiteCorpTable columns={columns} data={rows} />
        )}
      </SiteCorpCard>

      {editingTenant && (
        <SiteCorpFormSection
          title={editingTenant ? "Editar empresa" : "Crear empresa"}
          description={editingTenant ? "Actualiza los datos de la cuenta de cliente" : "Registra una nueva cuenta de cliente"}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink">Nombre</label>
                <SiteCorpInput
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink">Código</label>
                <SiteCorpInput
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Descripción</label>
              <SiteCorpInput
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <SiteCorpButton type="submit" className="w-full justify-center">
                Guardar
              </SiteCorpButton>
              <SiteCorpButton
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingTenant(null)
                  setFormData({ name: "", code: "", description: "", is_active: true })
                }}
              >
                Cancelar
              </SiteCorpButton>
            </div>
          </form>
        </SiteCorpFormSection>
      )}
    </div>
  )
}

export default Companies