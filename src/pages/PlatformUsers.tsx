import * as React from "react"
import { useNavigate } from "react-router-dom"
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
import { SelectItem } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Pencil, Plus, Power, UserMinus, UserCheck, Key } from "lucide-react"

interface PlatformUser {
  id: string
  full_name: string
  username: string
  email: string
  is_active: boolean
  created_at: string
  roles: { name: string; is_system_role: boolean }[]
}

interface PlatformRole {
  id: string
  name: string
  description: string | null
  is_system_role: boolean
  is_active: boolean
}

const PlatformUsers = () => {
  const { isPlatformSuperAdmin, hasPlatformPermission } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = React.useState<PlatformUser[]>([])
  const [roles, setRoles] = React.useState<PlatformRole[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingUser, setEditingUser] = React.useState<PlatformUser | null>(null)
  const [showCreateForm, setShowCreateForm] = React.useState(false)
  const [assigningRole, setAssigningRole] = React.useState<PlatformUser | null>(null)
  const [viewingPerms, setViewingPerms] = React.useState<PlatformUser | null>(null)
  const [formData, setFormData] = React.useState({
    full_name: "",
    username: "",
    email: "",
    password: "temp1234!",
    tenant_id: "",
    entity_id: "",
    tenant_role_id: "",
    access_scope: "SELF" as "SELF" | "SELF_AND_DESCENDANTS",
    is_active: true,
  })
  const [selectedRoleId, setSelectedRoleId] = React.useState("")
  const [tenants, setTenants] = React.useState<Array<{id: string; name: string; code: string; description: string | null}>>([])
  const [entities, setEntities] = React.useState<Array<{id: string; name: string; entity_type: string; code: string; regime_id: string}>>([])
  const [tenantRoles, setTenantRoles] = React.useState<Array<{id: string; name: string}>>([])
  const [loadingTenants, setLoadingTenants] = React.useState(false)
  const [loadingEntities, setLoadingEntities] = React.useState(false)
  const [loadingTenantRoles, setLoadingTenantRoles] = React.useState(false)

  const loadUsers = React.useCallback(async () => {
      try {
        setError(null)
        setLoading(true)
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
  
        if (profilesError) throw profilesError
  
        const usersWithRoles = await Promise.all(
          (profilesData || []).map(async (profile: any) => {
            const { data: roleData } = await supabase
              .from("platform_user_roles")
              .select("platform_role_id, platform_roles(name, is_system_role)")
              .eq("user_id", profile.id)
  
            const roles = (roleData || []).map((r: any) => r.platform_roles)
            return {
              ...profile,
              roles,
            }
          })
        )
  
        setUsers(usersWithRoles)
      } catch (err) {
        console.error("Error loading users:", err)
        setError("No se pudo cargar la lista de usuarios.")
      } finally {
        setLoading(false)
      }
    }, [])
  
    const loadRoles = React.useCallback(async () => {
      try {
        const { data, error } = await supabase
          .from("platform_roles")
          .select("*")
          .eq("is_active", true)
          .order("name")
  
        if (error) throw error
        setRoles(data || [])
      } catch (err) {
        console.error("Error loading roles:", err)
      }
    }, [])
  
    const loadTenants = React.useCallback(async () => {
      try {
        setLoadingTenants(true)
        const { data, error } = await supabase
          .from("tenants")
          .select("id, name, code, description")
          .order("name")
        if (error) throw error
        setTenants(data)
      } catch (err) {
        setError("No se pudo cargar la lista de workspaces.")
      } finally {
        setLoadingTenants(false)
      }
    }, [])
  
    const loadEntities = React.useCallback(async (tenantId: string) => {
      try {
        setLoadingEntities(true)
        const { data, error } = await supabase
          .from("organization_entities")
          .select("id, name, entity_type, code, regime_id")
          .eq("tenant_id", tenantId)
          .order("name")
        if (error) throw error
        setEntities(data)
      } catch (err) {
        setError("No se pudo cargar la lista de entidades.")
      } finally {
        setLoadingEntities(false)
      }
    }, [])
  
    const loadTenantRoles = React.useCallback(async (tenantId: string) => {
      try {
        setLoadingTenantRoles(true)
        const { data, error } = await supabase
          .from("tenant_roles")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .order("name")
        if (error) throw error
        setTenantRoles(data)
      } catch (err) {
        setError("No se pudo cargar la lista de roles del workspace.")
      } finally {
        setLoadingTenantRoles(false)
      }
    }, [])
  
    React.useEffect(() => {
      loadUsers()
      loadRoles()
      loadTenants()
    }, [loadUsers, loadRoles, loadTenants])
  
    React.useEffect(() => {
      if (formData.tenant_id) {
        loadEntities(formData.tenant_id)
        loadTenantRoles(formData.tenant_id)
      } else {
        setEntities([])
        setTenantRoles([])
      }
    }, [formData.tenant_id, loadEntities, loadTenantRoles])

  const startCreate = () => {
        setEditingUser(null)
        setShowCreateForm(true)
        setFormData({
          full_name: "",
          username: "",
          email: "",
          password: "temp1234!",
          tenant_id: "",
          entity_id: "",
          tenant_role_id: "",
          access_scope: "SELF",
          is_active: true,
        })
        setSelectedRoleId("")
      }

  const startEdit = (user: PlatformUser) => {
      setEditingUser(user)
      setFormData({
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        password: "",
        tenant_id: "",
        entity_id: "",
        tenant_role_id: "",
        access_scope: "SELF",
        is_active: user.is_active,
      })
    }

  const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
          if (editingUser) {
            const { error } = await supabase
              .from("profiles")
              .update({ full_name: formData.full_name, username: formData.username })
              .eq("id", editingUser.id)
            if (error) throw error
          } else {
            // Admin-provisioned users must go through the secure edge function
            const { data, error } = await supabase.functions.invoke("create-sitecorp-user", {
              body: {
                full_name: formData.full_name,
                username: formData.username,
                email: formData.email,
                password: formData.password,
                tenant_id: formData.tenant_id || undefined,
                entity_id: formData.entity_id || undefined,
                tenant_role_id: formData.tenant_role_id || undefined,
                access_scope: formData.access_scope,
                is_active: formData.is_active,
              },
            })
  
            if (error) throw error
            if (!data) throw new Error("Respuesta vacía del servidor")
          }
          setEditingUser(null)
          setShowCreateForm(false)
          setFormData({
            full_name: "",
            username: "",
            email: "",
            password: "temp1234!",
            tenant_id: "",
            entity_id: "",
            tenant_role_id: "",
            access_scope: "SELF",
            is_active: true,
          })
          setSelectedRoleId("")
          await loadUsers()
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo guardar el usuario.")
        }
      }

  const toggleActive = async (user: PlatformUser) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !user.is_active })
        .eq("id", user.id)
      if (error) throw error
      await loadUsers()
    } catch (err) {
      console.error("Error toggling user:", err)
      setError("No se pudo cambiar el estado del usuario.")
    }
  }

  const assignRole = async (user: PlatformUser) => {
    if (!selectedRoleId) return
    try {
      const { error } = await supabase
        .from("platform_user_roles")
        .insert({ user_id: user.id, platform_role_id: selectedRoleId })
      if (error) throw error
      setAssigningRole(null)
      setSelectedRoleId("")
      await loadUsers()
    } catch (err) {
      console.error("Error assigning role:", err)
      setError("No se pudo asignar el rol.")
    }
  }

  const removeRole = async (user: PlatformUser, roleName: string) => {
    try {
      const { error } = await supabase
        .from("platform_user_roles")
        .delete()
        .eq("user_id", user.id)
        .eq("platform_role_id", roles.find((r) => r.name === roleName)?.id)
      if (error) throw error
      await loadUsers()
    } catch (err) {
      console.error("Error removing role:", err)
      setError("No se pudo eliminar el rol.")
    }
  }

  const loadEffectivePermissions = async (user: PlatformUser) => {
    try {
      const { data, error } = await supabase.rpc("has_platform_permission", {
        permission_code: "users.view_all",
      })
      if (error) throw error
      console.log("Effective permissions for", user.full_name, data)
    } catch (err) {
      console.error("Error loading permissions:", err)
    }
  }

  const columns = [
    { header: "Nombre completo", accessor: "full_name" },
    { header: "Usuario", accessor: "username" },
    { header: "Email", accessor: "email" },
    { header: "Roles", accessor: "roles" },
    { header: "Estado", accessor: "status" },
    { header: "Fecha de creación", accessor: "created_at" },
    { header: "Acciones", accessor: "actions" },
  ]

  const rows = users.map((user) => ({
    full_name: user.full_name,
    username: user.username,
    email: user.email,
    roles: user.roles.map((r) => r.name).join(", ") || "Sin rol",
    status: (
      <SiteCorpStatusBadge status={user.is_active ? "success" : "warning"}>
        {user.is_active ? "Activo" : "Inactivo"}
      </SiteCorpStatusBadge>
    ),
    created_at: new Date(user.created_at).toLocaleDateString("es-ES"),
    actions: (
      <div className="flex items-center gap-2">
        <SiteCorpButton size="sm" variant="outline" onClick={() => startEdit(user)}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
        </SiteCorpButton>
        <SiteCorpButton
          size="sm"
          variant="outline"
          onClick={() => setAssigningRole(user)}
        >
          <Key className="h-3.5 w-3.5 mr-1" /> Rol
        </SiteCorpButton>
        <SiteCorpButton
          size="sm"
          variant="outline"
          onClick={() => {
            setViewingPerms(user)
            loadEffectivePermissions(user)
          }}
        >
          Permisos
        </SiteCorpButton>
        <SiteCorpButton
          size="sm"
          variant="outline"
          onClick={() => toggleActive(user)}
        >
          {user.is_active ? (
            <>
              <UserMinus className="h-3.5 w-3.5 mr-1" /> Desactivar
            </>
          ) : (
            <>
              <UserCheck className="h-3.5 w-3.5 mr-1" /> Reactivar
            </>
          )}
        </SiteCorpButton>
      </div>
    ),
  }))

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Usuarios"
        description="Gestión de administradores de plataforma"
        actions={
          <SiteCorpButton onClick={startCreate}>
                      <Plus className="h-4 w-4 mr-2" /> Agregar usuario SiteCorp
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
          Necesitas ser SuperAdmin para gestionar usuarios de plataforma.
        </SiteCorpAlert>
      )}

      <SiteCorpCard title="Administradores de plataforma">
        {loading ? (
          <SiteCorpLoading rows={5} />
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay usuarios registrados.
          </div>
        ) : (
          <SiteCorpTable columns={columns} data={rows} />
        )}
      </SiteCorpCard>

      {(editingUser || showCreateForm) && (
                    <SiteCorpFormSection
                      title={editingUser ? "Editar usuario" : "Crear usuario SiteCorp"}
                      description={
                        editingUser
                          ? "Actualiza los datos del usuario"
                          : "Registra un nuevo usuario de SiteCorp con acceso organizacional"
                      }
                    >
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-ink">Nombre completo</label>
                      <SiteCorpInput
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-ink">Usuario</label>
                      <SiteCorpInput
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-ink">Email</label>
                    <SiteCorpInput
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  
                  {/* Form fields for new user creation */}
                  {!editingUser && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-ink">Contraseña temporal</label>
                        <SiteCorpInput
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder="Mínimo 8 caracteres"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-ink">Workspace</label>
                        <SiteCorpSelect
                          value={formData.tenant_id}
                          onValueChange={(value) => {
                            setFormData({ ...formData, tenant_id: value ?? "" })
                            setSelectedRoleId("")
                          }}
                          options={tenants.map(t => ({
                            value: t.id,
                            label: t.name,
                            description: t.code || "",
                          }))}
                          disabled={loadingTenants}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-ink">Entidad organizacional</label>
                        <SiteCorpSelect
                          value={formData.entity_id}
                          onValueChange={(value) => setFormData({ ...formData, entity_id: value ?? "" })}
                          placeholder="Selecciona una entidad"
                          options={entities.map(e => ({
                            value: e.id,
                            label: e.name,
                            description: `[${e.entity_type}] ${e.code}`,
                          }))}
                          disabled={loadingEntities}
                        loadingEntities
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-ink">Rol en el workspace</label>
                        <SiteCorpSelect
                          value={formData.tenant_role_id}
                          onValueChange={(value) => setFormData({ ...formData, tenant_role_id: value ?? "" })}
                          placeholder="Selecciona un rol"
                          options={tenantRoles.map(r => ({
                            value: r.id,
                            label: r.name,
                          }))}
                          disabled={loadingTenantRoles}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-ink">Alcance de acceso</label>
                        <SiteCorpSelect
                          value={formData.access_scope}
                          onValueChange={(value) => setFormData({ ...formData, access_scope: value as "SELF" | "SELF_AND_DESCENDANTS" })}
                          placeholder="Selecciona el alcance"
                          options={[
                            { value: "SELF", label: "Solo esta entidad (SELF)" },
                            { value: "SELF_AND_DESCENDANTS", label: "Esta entidad y sus descendientes (SELF_AND_DESCENDANTS)" }
                          ]}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-ink">
                          <Checkbox
                            checked={formData.is_active}
                            onCheckedChange={(checked) =>
                              setFormData({ ...formData, is_active: checked === true })
                            }
                          />
                          Usuario activo
                        </label>
                      </div>
                    </>
                  )}
                  
                  <div className="flex items-center gap-3">
                    <SiteCorpButton type="submit" className="w-full justify-center">
                      {editingUser ? "Guardar cambios" : "Crear usuario SiteCorp"}
                    </SiteCorpButton>
                    <SiteCorpButton
                      type="button"
                      variant="outline"
                      onClick={() => {
                          setEditingUser(null)
                          setShowCreateForm(false)
                          setFormData({
                            full_name: "",
                            username: "",
                            email: "",
                            password: "temp1234!",
                            tenant_id: "",
                            entity_id: "",
                            tenant_role_id: "",
                            access_scope: "SELF",
                            is_active: true,
                          })
                          setSelectedRoleId("")
                        }}
                    >
                      Cancelar
                    </SiteCorpButton>
                  </div>
                </form>
              </SiteCorpFormSection>
            )}

      {assigningRole && (
        <SiteCorpFormSection
          title="Asignar rol"
          description={`Asigna un rol a ${assigningRole.full_name}`}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Rol</label>
              <SiteCorpSelect
                value={selectedRoleId}
                onValueChange={setSelectedRoleId}
              >
                {roles
                  .filter((r) => !assigningRole.roles.some((ur) => ur.name === r.name))
                  .map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
              </SiteCorpSelect>
            </div>
            <div className="flex items-center gap-3">
              <SiteCorpButton onClick={() => assignRole(assigningRole)}>
                Asignar
              </SiteCorpButton>
              <SiteCorpButton
                variant="outline"
                onClick={() => {
                  setAssigningRole(null)
                  setSelectedRoleId("")
                }}
              >
                Cancelar
              </SiteCorpButton>
            </div>
          </div>
        </SiteCorpFormSection>
      )}

      {viewingPerms && (
        <SiteCorpFormSection
          title="Permisos efectivos"
          description={`Permisos efectivos para ${viewingPerms.full_name}`}
        >
          <div className="space-y-3">
            {viewingPerms.roles.map((role) => (
              <div key={role.name} className="rounded-lg border p-3">
                <p className="text-sm font-medium text-ink">{role.name}</p>
                <p className="text-xs text-muted-foreground">
                  {role.is_system_role ? "Rol del sistema" : "Rol personalizado"}
                </p>
              </div>
            ))}
            {viewingPerms.roles.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin roles asignados.</p>
            )}
            <SiteCorpButton
              variant="outline"
              onClick={() => setViewingPerms(null)}
            >
              Cerrar
            </SiteCorpButton>
          </div>
        </SiteCorpFormSection>
      )}
    </div>
  )
}

export default PlatformUsers
