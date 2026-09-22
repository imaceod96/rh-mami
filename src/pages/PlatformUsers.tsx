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
import { Pencil, Plus, Power, UserMinus, UserCheck } from "lucide-react"

interface PlatformUser {
  id: string
  full_name: string
  username: string
  email: string
  is_active: boolean
  created_at: string
  roles: { name: string; is_system_role: boolean }[]
}

const PlatformUsers = () => {
  const { isPlatformSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = React.useState<PlatformUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingUser, setEditingUser] = React.useState<PlatformUser | null>(null)
  const [formData, setFormData] = React.useState({
    full_name: "",
    username: "",
    email: "",
  })

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

  React.useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const startCreate = () => {
    setEditingUser(null)
    setFormData({ full_name: "", username: "", email: "" })
  }

  const startEdit = (user: PlatformUser) => {
    setEditingUser(user)
    setFormData({ full_name: user.full_name, username: user.username, email: user.email })
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
        const { error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: "temp1234!",
          options: {
            data: {
              full_name: formData.full_name,
              username: formData.username,
            },
          },
        })
        if (signUpError) throw signUpError
      }
      setEditingUser(null)
      setFormData({ full_name: "", username: "", email: "" })
      await loadUsers()
    } catch (err) {
      setError("No se pudo guardar el usuario.")
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
            <Plus className="h-4 w-4 mr-2" /> Agregar administrador
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

      {editingUser && (
        <SiteCorpFormSection
          title={editingUser ? "Editar usuario" : "Crear administrador"}
          description={
            editingUser
              ? "Actualiza los datos del administrador"
              : "Registra un nuevo administrador de plataforma"
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
            <div className="flex items-center gap-3">
              <SiteCorpButton type="submit" className="w-full justify-center">
                Guardar
              </SiteCorpButton>
              <SiteCorpButton
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingUser(null)
                  setFormData({ full_name: "", username: "", email: "" })
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

export default PlatformUsers
