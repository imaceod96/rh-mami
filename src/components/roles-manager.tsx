import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SelectItem } from "@/components/ui/select"
import {
  BadgeCheck,
  Eye,
  Pencil,
  Plus,
  Power,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react"

export type RoleScope = "platform" | "organization"

interface PermissionOption {
  id: string
  code: string
  description: string | null
}

interface RoleRecord {
  id: string
  name: string
  description: string | null
  is_system_role: boolean
  is_active: boolean
  created_at: string
  permissionIds: string[]
  permissionCodes: string[]
  assignedUserCount: number
  organizationEntityId: string | null
}

interface RoleForm {
  name: string
  description: string
  is_active: boolean
}

interface PermissionGroup {
  title: string
  codes: string[]
}

const emptyForm: RoleForm = {
  name: "",
  description: "",
  is_active: true,
}

const platformLabels: Record<string, string> = {
  "tenants.view": "Ver clientes / workspaces",
  "tenants.create": "Crear clientes / workspaces",
  "tenants.edit": "Editar clientes / workspaces",
  "tenants.activate": "Activar clientes / workspaces",
  "tenants.deactivate": "Desactivar clientes / workspaces",
  "tenants.delete": "Eliminar clientes / workspaces",
  "tenants.enter": "Abrir clientes / workspaces",
  "organizations.view_all": "Ver todas las organizaciones",
  "organizations.manage_all": "Gestionar todas las organizaciones",
  "organizations.delete": "Eliminar organizaciones",
  "users.view_all": "Ver usuarios globales",
  "users.manage_all": "Crear, editar y gestionar usuarios globales",
  "users.invite": "Invitar usuarios",
  "platform_roles.view": "Ver roles de plataforma",
  "platform_roles.manage": "Crear y editar roles de plataforma",
  "tenant_roles.view": "Ver roles de organización",
  "tenant_roles.manage": "Crear y editar roles de organización",
  "reports.cross_tenant": "Ver informes globales",
  "platform_settings.view": "Ver configuración de plataforma",
  "platform_settings.manage": "Gestionar configuración de plataforma",
}

const organizationLabels: Record<string, string> = {
  "organization.view": "Ver organización",
  "organization.manage": "Gestionar organización",
  "users.view": "Ver usuarios",
  "users.manage": "Crear, editar y gestionar usuarios",
  "users.invite": "Invitar usuarios",
  "roles.view": "Ver roles de organización",
  "roles.manage": "Crear y editar roles de organización",
  "candidates.view": "Ver candidatos",
  "candidates.manage": "Gestionar candidatos",
  "staffing.view": "Ver plantilla / puestos",
  "staffing.manage": "Gestionar plantilla / puestos",
  "hiring.view": "Ver contratación",
  "hiring.manage": "Gestionar contratación",
  "salary.view": "Ver compensación",
  "salary.manage": "Gestionar compensación",
  "reports.view": "Ver informes",
}

const platformGroups: PermissionGroup[] = [
  {
    title: "CLIENTES / ORGANIZACIONES",
    codes: [
      "tenants.view",
      "tenants.create",
      "tenants.edit",
      "tenants.activate",
      "tenants.deactivate",
      "tenants.delete",
      "tenants.enter",
      "organizations.view_all",
      "organizations.manage_all",
      "organizations.delete",
    ],
  },
  {
    title: "USUARIOS",
    codes: ["users.view_all", "users.manage_all", "users.invite"],
  },
  {
    title: "ROLES Y PERMISOS",
    codes: [
      "platform_roles.view",
      "platform_roles.manage",
      "tenant_roles.view",
      "tenant_roles.manage",
    ],
  },
  {
    title: "INFORMES",
    codes: ["reports.cross_tenant"],
  },
  {
    title: "CONFIGURACIÓN",
    codes: ["platform_settings.view", "platform_settings.manage"],
  },
]

const organizationGroups: PermissionGroup[] = [
  {
    title: "ORGANIZACIÓN",
    codes: ["organization.view", "organization.manage"],
  },
  {
    title: "USUARIOS",
    codes: ["users.view", "users.manage", "users.invite"],
  },
  {
    title: "ROLES DE ORGANIZACIÓN",
    codes: ["roles.view", "roles.manage"],
  },
  {
    title: "CANDIDATOS",
    codes: ["candidates.view", "candidates.manage"],
  },
  {
    title: "PLANTILLA / PUESTOS",
    codes: ["staffing.view", "staffing.manage"],
  },
  {
    title: "CONTRATACIÓN",
    codes: ["hiring.view", "hiring.manage"],
  },
  {
    title: "COMPENSACIÓN",
    codes: ["salary.view", "salary.manage"],
  },
  {
    title: "INFORMES",
    codes: ["reports.view"],
  },
]

const permissionLabel = (scope: RoleScope, permission: PermissionOption) =>
  (scope === "platform" ? platformLabels : organizationLabels)[permission.code] ||
  permission.description ||
  permission.code

const groupsForScope = (scope: RoleScope) =>
  scope === "platform" ? platformGroups : organizationGroups

const friendlySaveError = (scope: RoleScope, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const normalized = message.toLowerCase()
  const roleLabel = scope === "platform" ? "rol de plataforma" : "rol de organización"

  if (
    normalized.includes("already exists") ||
    normalized.includes("duplicate key") ||
    normalized.includes("23505")
  ) {
    return `Ya existe un ${roleLabel} con ese nombre en este ámbito.`
  }
  if (normalized.includes("role name is required")) {
    return "El nombre del rol es obligatorio."
  }
  if (normalized.includes("reserved system role")) {
    return "SuperAdmin es un nombre reservado y no puede usarse en un rol personalizado."
  }
  if (normalized.includes("system role names cannot be changed")) {
    return "El nombre de un rol del sistema no puede cambiarse."
  }
  if (normalized.includes("activation status cannot be changed")) {
    return "El estado de un rol del sistema no puede cambiarse."
  }
  if (normalized.includes("superadmin permissions cannot")) {
    return "Los permisos reservados de SuperAdmin no pueden reducirse ni cambiarse."
  }
  if (normalized.includes("permission denied") || normalized.includes("row-level security")) {
    return "No tienes permiso para gestionar roles en este ámbito."
  }
  if (normalized.includes("permissions are invalid")) {
    return "Uno o más permisos seleccionados no son válidos."
  }
  if (normalized.includes("only assign platform permissions")) {
    return "Solo puedes asignar permisos de plataforma que actualmente posees."
  }
  if (normalized.includes("workspace was not found")) {
    return "El workspace de organización no existe."
  }
  return message || `No se pudo guardar el ${roleLabel}.`
}

export const RolesManager = ({
  scope,
  tenantId,
  organizationEntityId,
}: {
  scope: RoleScope
  tenantId?: string
  organizationEntityId?: string
}) => {
  const isPlatform = scope === "platform"
  const [roles, setRoles] = React.useState<RoleRecord[]>([])
  const [permissions, setPermissions] = React.useState<PermissionOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingRole, setEditingRole] = React.useState<RoleRecord | null>(null)
  const [form, setForm] = React.useState<RoleForm>(emptyForm)
  const [selectedPermissionIds, setSelectedPermissionIds] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [viewingRole, setViewingRole] = React.useState<RoleRecord | null>(null)

  const organizationReady = scope === "organization" && Boolean(tenantId)
  const entityReady = scope === "organization" && Boolean(organizationEntityId)

  const loadData = React.useCallback(async () => {
    if (scope === "organization" && !tenantId) {
      setRoles([])
      setLoading(false)
      return
    }

    try {
      setError(null)
      setLoading(true)

      const rolesRequest = isPlatform
        ? supabase.from("platform_roles").select("*").order("name")
        : supabase
            .from("tenant_roles")
            .select("*")
            .eq("tenant_id", tenantId as string)
            .eq("organization_entity_id", organizationEntityId as string)
            .order("name")

      const [rolesResult, permissionsResult] = await Promise.all([
        rolesRequest,
        isPlatform
          ? supabase.from("platform_permissions").select("*").order("code")
          : supabase.from("tenant_permissions").select("*").order("code"),
      ])

      if (rolesResult.error) throw rolesResult.error
      if (permissionsResult.error) throw permissionsResult.error

      const roleRows = rolesResult.data || []
      const roleIds = roleRows.map((role: { id: string }) => role.id)

      const mappingsRequest =
        roleIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : isPlatform
            ? supabase
                .from("platform_role_permissions")
                .select("platform_role_id,platform_permission_id")
                .in("platform_role_id", roleIds)
            : supabase
                .from("tenant_role_permissions")
                .select("tenant_role_id,tenant_permission_id")
                .in("tenant_role_id", roleIds)

      const mappingsResult = await mappingsRequest
      if (mappingsResult.error) throw mappingsResult.error

      let assignmentRows: Record<string, string>[] = []

      if (roleIds.length > 0) {
        if (isPlatform) {
          const platformAssignments = await supabase
            .from("platform_user_roles")
            .select("platform_role_id,user_id")
            .in("platform_role_id", roleIds)
          if (platformAssignments.error) throw platformAssignments.error
          assignmentRows = (platformAssignments.data || []).map((row: any) => ({
            roleId: row.platform_role_id,
            userId: row.user_id,
          }))
        } else {
          const entityAssignments = await supabase
            .from("entity_user_access")
            .select("tenant_role_id,tenant_membership_id")
            .in("tenant_role_id", roleIds)
          if (entityAssignments.error) throw entityAssignments.error

          const legacyAssignments = await supabase
            .from("tenant_user_roles")
            .select("tenant_role_id,tenant_membership_id")
            .in("tenant_role_id", roleIds)
          if (legacyAssignments.error) throw legacyAssignments.error

          assignmentRows = [...entityAssignments.data || [], ...legacyAssignments.data || []].map(
            (row: any) => ({
              roleId: row.tenant_role_id,
              userId: row.tenant_membership_id,
            })
          )
        }
      }

      const mappings = (mappingsResult.data || []) as any[]
      const roleRecords = roleRows.map((role: any) => {
        const roleMappings = mappings.filter((mapping) =>
          isPlatform
            ? mapping.platform_role_id === role.id
            : mapping.tenant_role_id === role.id
        )
        const permissionIds = isPlatform
          ? roleMappings.map((mapping) => mapping.platform_permission_id)
          : roleMappings.map((mapping) => mapping.tenant_permission_id)

        return {
          ...role,
          permissionIds,
          permissionCodes: permissionIds
            .map(
              (permissionId) =>
                (permissionsResult.data || []).find(
                  (permission: PermissionOption) => permission.id === permissionId
                )?.code
            )
            .filter(Boolean),
          assignedUserCount: new Set(
            assignmentRows.filter((assignment) => assignment.roleId === role.id).map(
              (assignment) => assignment.userId
            )
          ).size,
          organizationEntityId: role.organization_entity_id || null,
        } as RoleRecord
      })

      setRoles(roleRecords)
      setPermissions(permissionsResult.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la información de roles.")
    } finally {
      setLoading(false)
    }
  }, [isPlatform, scope, tenantId, organizationEntityId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const openCreate = () => {
    setEditingRole(null)
    setForm(emptyForm)
    setSelectedPermissionIds([])
    setFormError(null)
    setDialogOpen(true)
  }

  const openEdit = (role: RoleRecord) => {
    setEditingRole(role)
    setForm({
      name: role.name,
      description: role.description || "",
      is_active: role.is_active,
    })
    setSelectedPermissionIds(role.permissionIds)
    setFormError(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingRole(null)
    setForm(emptyForm)
    setSelectedPermissionIds([])
    setFormError(null)
  }

  const permissionsLocked =
    isPlatform &&
    editingRole?.name === "SuperAdmin" &&
    Boolean(editingRole?.is_system_role)

  const saveRole = async (
    nextForm: RoleForm,
    nextPermissionIds: string[],
    role: RoleRecord | null
  ) => {
    const request = isPlatform
      ? supabase.rpc("save_platform_role", {
          p_role_id: role?.id || null,
          p_name: nextForm.name,
          p_description: nextForm.description,
          p_is_active: nextForm.is_active,
          p_permission_ids: nextPermissionIds,
        })
      : supabase.rpc("save_tenant_role", {
          p_role_id: role?.id || null,
          p_tenant_id: tenantId,
          p_organization_entity_id: organizationEntityId,
          p_name: nextForm.name,
          p_description: nextForm.description,
          p_is_active: nextForm.is_active,
          p_permission_ids: nextPermissionIds,
        })

    const { error: saveError } = await request
    if (saveError) throw saveError
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      setFormError(null)
      if (!form.name.trim()) {
        throw new Error("Role name is required")
      }

      setSaving(true)
      await saveRole(form, selectedPermissionIds, editingRole)
      setSuccess(
        editingRole
          ? "Rol actualizado correctamente."
          : isPlatform
            ? "Rol de plataforma creado correctamente."
            : "Rol de organización creado correctamente."
      )
      closeDialog()
      await loadData()
    } catch (err) {
      setFormError(friendlySaveError(scope, err))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (role: RoleRecord) => {
    try {
      setError(null)
      setSuccess(null)
      setSaving(true)

      await saveRole(
        {
          name: role.name,
          description: role.description || "",
          is_active: !role.is_active,
        },
        role.permissionIds,
        role
      )

      setSuccess(`Rol ${role.is_active ? "desactivado" : "activado"} correctamente.`)
      await loadData()
    } catch (err) {
      setError(friendlySaveError(scope, err))
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async (role: RoleRecord) => {
    try {
      setError(null)
      setSuccess(null)
      setSaving(true)

      if (isPlatform && role.name === "SuperAdmin" && role.is_system_role) {
        throw new Error("El rol SuperAdmin no puede eliminarse")
      }

      // Check if role has assigned users
      if (role.assignedUserCount > 0) {
        throw new Error("No se puede eliminar un rol que tiene usuarios asignados")
      }

      const request = isPlatform
        ? supabase.from("platform_roles").delete().eq("id", role.id)
        : supabase.from("tenant_roles").delete().eq("id", role.id)

      const { error: deleteError } = await request
      if (deleteError) throw deleteError

      setSuccess("Rol eliminado correctamente.")
      await loadData()
    } catch (err) {
      setError(friendlySaveError(scope, err))
    } finally {
      setSaving(false)
    }
  }

  const togglePermission = (permissionId: string) => {
    setSelectedPermissionIds((current) =>
      current.includes(permissionId)
        ? current.filter((id) => id !== permissionId)
        : [...current, permissionId]
    )
  }

  const groupedPermissions = groupsForScope(scope)
  const groupedCodes = new Set(groupedPermissions.flatMap((group) => group.codes))
  const additionalPermissions = permissions.filter(
    (permission) => !groupedCodes.has(permission.code)
  )
  const allGroups: PermissionGroup[] = [...groupedPermissions]

  if (additionalPermissions.length > 0) {
    allGroups.push({
      title: "OTROS PERMISOS DEL SISTEMA",
      codes: additionalPermissions.map((permission) => permission.code),
    })
  }

  const renderPermissionCheckbox = (permission: PermissionOption) => {
    const checked = selectedPermissionIds.includes(permission.id)

    return (
      <label
        key={permission.id}
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white p-3 text-sm transition-colors hover:border-sitecorp-primary/40"
      >
        <Checkbox
          className="mt-0.5"
          checked={checked}
          disabled={permissionsLocked}
          onCheckedChange={() => togglePermission(permission.id)}
        />
        <span className="min-w-0">
          <span className="block font-medium text-ink">
            {permissionLabel(scope, permission)}
          </span>
          <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
            {permission.code}
          </span>
        </span>
      </label>
    )
  }

  return (
    <SiteCorpCard
      title={isPlatform ? "Roles de plataforma" : "Roles de organización"}
      description={
        isPlatform
          ? "Controlan qué pueden hacer los administradores y operadores de SiteCorp."
          : "Definen QUÉ puede hacer un usuario; el acceso a entidades define DÓNDE puede hacerlo."
      }
    >
      <div className="space-y-4">
        {error && (
          <SiteCorpAlert type="danger" title="Error">
            {error}
          </SiteCorpAlert>
        )}
        {success && (
          <SiteCorpAlert type="success" title="Operación realizada">
            {success}
          </SiteCorpAlert>
        )}
        {!organizationReady && scope === "organization" && (
          <SiteCorpAlert type="warning" title="Workspace requerido">
            Selecciona un workspace de organización para gestionar sus roles.
          </SiteCorpAlert>
        )}
        {!entityReady && scope === "organization" && (
          <SiteCorpAlert type="warning" title="Entidad requerida">
            Selecciona una entidad organizativa para gestionar sus roles.
          </SiteCorpAlert>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <BadgeCheck className="h-4 w-4 text-sitecorp-primary" />
            {roles.length} {roles.length === 1 ? "rol" : "roles"} · {permissions.length} permisos del
            sistema
          </div>
          <SiteCorpButton
            onClick={openCreate}
            disabled={scope === "organization" && !entityReady}
          >
            <Plus className="mr-2 h-4 w-4" />
            {isPlatform ? "Nuevo rol de plataforma" : "Nuevo rol"}
          </SiteCorpButton>
        </div>

        {loading ? (
          <SiteCorpLoading rows={5} />
        ) : roles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {isPlatform
              ? "No hay roles de plataforma disponibles."
              : "Esta entidad aún no tiene roles de organización."}
          </div>
        ) : (
          <div className="space-y-3">
            {roles.map((role) => (
              <article
                key={role.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{role.name}</h3>
                    {role.is_system_role ? (
                      <SiteCorpStatusBadge status="info">Rol del sistema</SiteCorpStatusBadge>
                    ) : (
                      <SiteCorpStatusBadge status="neutral">Personalizado</SiteCorpStatusBadge>
                    )}
                    <SiteCorpStatusBadge status={role.is_active ? "success" : "warning"}>
                      {role.is_active ? "Activo" : "Inactivo"}
                    </SiteCorpStatusBadge>
                    {isPlatform && role.name === "SuperAdmin" && role.is_system_role && (
                      <SiteCorpStatusBadge status="success">Acceso completo reservado</SiteCorpStatusBadge>
                    )}
                  </div>

                  {role.description && (
                    <p className="max-w-3xl text-sm text-muted-foreground">{role.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-sitecorp-primary" />
                      {isPlatform && role.name === "SuperAdmin"
                        ? "Acceso completo por diseño"
                        : `${role.permissionIds.length} permisos`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-sitecorp-primary" />
                      {role.assignedUserCount} usuarios asignados
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <SiteCorpButton size="sm" variant="outline" onClick={() => setViewingRole(role)}>
                    <Eye className="mr-1 h-3.5 w-3.5" /> Ver permisos
                  </SiteCorpButton>
                  <SiteCorpButton
                    size="sm"
                    variant="outline"
                    disabled={isPlatform && role.name === "SuperAdmin" && role.is_system_role}
                    onClick={() => openEdit(role)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </SiteCorpButton>
                  {!role.is_system_role && (
                    <SiteCorpButton
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => deleteRole(role)}
                    >
                      <Power className="mr-1 h-3.5 w-3.5" />
                      {role.is_active ? "Desactivar" : "Activar"}
                    </SiteCorpButton>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
          <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="h-5 w-5 text-sitecorp-primary" />
                {editingRole
                  ? `Editar ${editingRole.name}`
                  : isPlatform
                    ? "Nuevo rol de plataforma"
                    : "Nuevo rol de organización"}
              </DialogTitle>
              <DialogDescription>
                {isPlatform
                  ? "Los permisos seleccionados controlan la administración de la plataforma SiteCorp."
                  : "El rol define las capacidades. El acceso a entidades organizativas se gestiona por separado."}
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <SiteCorpAlert type="danger" title="Error">
                {formError}
              </SiteCorpAlert>
            )}

            {permissionsLocked && (
              <SiteCorpAlert type="info" title="Rol reservado">
                SuperAdmin tiene acceso completo mediante la función reservada del sistema. Sus
                permisos normales no pueden reducirse ni cambiarse.
              </SiteCorpAlert>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">Nombre</label>
                  <SiteCorpInput
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    disabled={Boolean(editingRole?.is_system_role)}
                    required
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-ink">Descripción</label>
                  <SiteCorpInput
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="Descripción opcional"
                  />
                </div>
              </div>

              <SiteCorpSelect
                label="Estado"
                value={form.is_active ? "active" : "inactive"}
                onValueChange={(value) => setForm({ ...form, is_active: value === "active" })}
                disabled={Boolean(editingRole?.is_system_role)}
              >
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SiteCorpSelect>

              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">Permisos del sistema</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedPermissionIds.length} seleccionados · catálogo controlado por base de
                      datos
                    </p>
                  </div>
                </div>

                {allGroups.map((group) => {
                  const groupPermissions = permissions.filter((permission) =>
                    group.codes.includes(permission.code)
                  )

                  if (groupPermissions.length === 0) return null

                  return (
                    <section key={group.title} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.title}
                      </p>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {groupPermissions.map(renderPermissionCheckbox)}
                      </div>
                    </section>
                  )
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <SiteCorpButton type="button" variant="outline" onClick={closeDialog} disabled={saving}>
                  Cancelar
                </SiteCorpButton>
                <SiteCorpButton type="submit" disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Guardando..." : editingRole ? "Guardar cambios" : "Crear rol"}
                </SiteCorpButton>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(viewingRole)}
          onOpenChange={(open) => {
            if (!open) setViewingRole(null)
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="h-5 w-5 text-sitecorp-primary" />
                Permisos de {viewingRole?.name}
              </DialogTitle>
              <DialogDescription>
                {viewingRole?.is_system_role
                  ? "Rol del sistema con controles protegidos."
                  : "Rol personalizado construido a partir del catálogo de permisos."}
              </DialogDescription>
            </DialogHeader>

            {viewingRole && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <SiteCorpStatusBadge
                    status={viewingRole.is_active ? "success" : "warning"}
                  >
                    {viewingRole.is_active ? "Activo" : "Inactivo"}
                  </SiteCorpStatusBadge>
                  <SiteCorpStatusBadge status="neutral">
                    {viewingRole.permissionIds.length} permisos
                  </SiteCorpStatusBadge>
                  <SiteCorpStatusBadge status="neutral">
                    {viewingRole.assignedUserCount} usuarios
                  </SiteCorpStatusBadge>
                </div>

                {isPlatform && viewingRole.name === "SuperAdmin" ? (
                  <SiteCorpAlert type="info" title="Acceso completo reservado">
                    SuperAdmin no depende de la lista normal de permisos. La autorización reservada le
                    otorga acceso completo a la plataforma.
                  </SiteCorpAlert>
                ) : viewingRole.permissionCodes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                    Este rol no tiene permisos asignados.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {viewingRole.permissionCodes.map((code) => {
                      const permission = permissions.find((item) => item.code === code)
                      return (
                        <span
                          key={code}
                          className="inline-flex items-center rounded-lg border border-border bg-sitecorp-background px-3 py-1.5 text-xs font-medium text-ink"
                        >
                          {permission ? permissionLabel(scope, permission) : code}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
          </SiteCorpCard>
        )
      }
      
      export default RolesManager