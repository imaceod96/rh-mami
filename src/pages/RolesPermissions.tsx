import * as React from "react"
import { useAuth } from "@/contexts/AuthContext"
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
import { Pencil, Plus, Power, Shield, Key } from "lucide-react"

interface PlatformRole {
  id: string
  name: string
  description: string | null
  is_system_role: boolean
  is_active: boolean
  created_at: string
  permissions: { code: string; description: string }[]
}

const permissionGroups = [
  {
    group: "CUENTAS",
    permissions: ["tenants.view", "tenants.create", "tenants.edit", "tenants.activate", "tenants.deactivate", "tenants.enter"],
  },
  {
    group: "ORGANIZACIÓN",
    permissions: ["organizations.view_all", "organizations.manage_all"],
  },
  {
    group: "USUARIOS",
    permissions: ["users.view_all", "users.manage_all", "users.invite"],
  },
  {
    group: "REPORTES",
    permissions: ["reports.cross_tenant"],
  },
  {
    group: "CONFIGURACIÓN",
    permissions: ["platform_settings.view", "platform_settings.manage"],
  },
]

const RolesPermissions = () => {
  const { isPlatformSuperAdmin } = useAuth()
  const [roles, setRoles] = React.useState<PlatformRole[]>([])
  const [permissions, setPermissions] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingRole, setEditingRole] = React.useState<PlatformRole | null>(null)
  const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([])
  const [formData, setFormData] = React.useState({
    name: "",
    description: "",
  })

  const loadData = React.useCallback(async () => {
    try {
      setError(null)
      setLoading(true)

      const { data: rolesData, error: rolesError } = await supabase
        .from("platform_roles")
        .select("*")
        .order("created_at", { ascending: false })

      if (rolesError) throw rolesError

      const { data: permissionsData, error: permissionsError } = await supabase
        .from("platform_permissions")
        .select("*")
        .order("code")

      if (permissionsError) throw permissionsError

      const rolesWithPermissions = await Promise.all(
        (rolesData || []).map(async (role: any) => {
          const { data: rolePerms } = await supabase
            .from("platform_role_permissions")
            .select("platform_permission_id, platform_permissions(code, description)")
            .eq("platform_role_id", role.id)

          const perms = (rolePerms || []).map((rp: any) => rp.platform_permissions)
          return {
            ...role,
            permissions: perms,
          }
        })
      )

      setRoles(rolesWithPermissions)
      setPermissions(permissionsData || [])
    } catch (err) {
      console.error("Error loading data:", err)
      setError("No se pudo cargar la información.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const startCreate = () => {
    setEditingRole(null)
    setFormData({ name: "", description: "" })
    setSelectedPermissions([])
  }

  const startEdit = (role: PlatformRole) => {
    setEditingRole(role)
    setFormData({ name: role.name, description: role.description || "" })
    setSelectedPermissions(role.permissions.map((p) => p.code))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingRole) {
        const { error } = await supabase
          .from("platform_roles")
          .update({ name: formData.name, description: formData.description })
          .eq("id", editingRole.id)
        if (error) throw error

        // Update role permissions
        await supabase
          .from("platform_role_permissions")
          .delete()
          .eq("platform_role_id", editingRole.id)

        const permInserts = selectedPermissions.map((code) => ({
          platform_role_id: editingRole.id,
          platform_permission_id: permissions.find((p) => p.code === code)?.id,
        }))

        if (permInserts.length > 0) {
          const { error: permError } = await supabase
            .from("platform_role_permissions")
            .insert(permInserts)
          if (permError) throw permError
        }
      } else {
        const { data: newRole, error: roleError } = await supabase
          .from("platform_roles")
          .insert({ name: formData.name, description: formData.description })
          .select()
          .single()

        if (roleError) throw roleError

        const permInserts = selectedPermissions.map((code) => ({
          platform_role_id: newRole.id,
          platform_permission_id: permissions.find((p) => p.code === code)?.id,
        }))

        if (permInserts.length > 0) {
          const { error: permError } = await supabase
            .from("platform_role_permissions")
            .insert(permInserts)
          if (permError) throw permError
        }
      }
      setEditingRole(null)
      setFormData({ name: "", description: "" })
      setSelectedPermissions([])
      await loadData()
    } catch (err) {
      setError("No se pudo guardar el rol.")
    }
  }

  const toggleActive = async (role: PlatformRole) => {
    try {
      const { error } = await supabase
        .from("platform_roles")
        .update({ is_active: !role.is_active })
        .eq("id", role.id)
      if (error) throw error
      await loadData()
    } catch (err) {
      console.error("Error toggling role:", err)
      setError("No se pudo cambiar el estado del rol.")
    }
  }

  const togglePermission = (code: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    )
  }

  const columns = [
    { header: "Nombre", accessor: "name" },
    { header: "Descripción", accessor: "description" },
    { header: "Permisos", accessor: "permissions" },
    { header: "Tipo", accessor: "type" },
    { header: "Estado", accessor: "status" },
    { header: "Fecha de creación", accessor: "created_at" },
    { header: "Acciones", accessor: "actions" },
  ]

  const rows = roles.map((role) => ({
    name: role.name,
    description: role.description || "Sin descripción",
    permissions: role.permissions.map((p) => p.code).join(", ") || "Sin permisos",
    type: role.is_system_role ? "Sistema" : "Personalizado",
    status: (
      <SiteCorpStatusBadge status={role.is_active ? "success" : "warning"}>
        {role.is_active ? "Activo" : "Inactivo"}
      </SiteCorpStatusBadge>
    ),
    created_at: new Date(role.created_at).toLocaleDateString("es-ES"),
    actions: (
      <div className="flex items-center gap-2">
        <SiteCorpButton size="sm" variant="outline" onClick={() => startEdit(role)}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
        </SiteCorpButton>
        {!role.is_system_role && (
          <SiteCorpButton size="sm" variant="outline" onClick={() => toggleActive(role)}>
            <Power className="h-3.5 w-3.5 mr-1" /> {role.is_active ? "Desactivar" : "Reactivar"}
          </SiteCorpButton>
        )}
      </div>
    ),
  }))

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Roles y permisos"
        description="Gestión de roles y permisos de plataforma"
        actions={
          <SiteCorpButton onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" /> Crear rol
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
          Necesitas ser SuperAdmin para gestionar roles y permisos.
        </SiteCorpAlert>
      )}

      <SiteCorpCard title="Roles de plataforma">
        {loading ? (
          <SiteCorpLoading rows={5} />
        ) : roles.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay roles registrados.
          </div>
        ) : (
          <SiteCorpTable columns={columns} data={rows} />
        )}
      </SiteCorpCard>

      {editingRole && (
        <SiteCorpFormSection
          title={editingRole ? "Editar rol" : "Crear rol"}
          description={
            editingRole
              ? "Actualiza los datos del rol y sus permisos"
              : "Crea un nuevo rol personalizado"
          }
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
                <label className="text-sm font-medium text-ink">Descripción</label>
                <SiteCorpInput
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-ink">Permisos</label>
              {permissionGroups.map((group) => (
                <div key={group.group} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.group}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.permissions.map((code) => {
                      const perm = permissions.find((p) => p.code === code)
                      if (!perm) return null
                      const isSelected = selectedPermissions.includes(code)
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => togglePermission(code)}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            isSelected
                              ? "bg-sitecorp-primary text-white"
                              : "bg-muted text-ink hover:bg-muted/80"
                          }`}
                        >
                          {isSelected && <Shield className="h-3 w-3" />}
                          {code}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <SiteCorpButton type="submit" className="w-full justify-center">
                Guardar
              </SiteCorpButton>
              <SiteCorpButton
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingRole(null)
                  setFormData({ name: "", description: "" })
                  setSelectedPermissions([])
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

export default RolesPermissions
