import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
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
import EntityUsersDialog, {
  type OrganizationEntity,
} from "@/components/entity-users-dialog"
import {
  OrganizationEntityDialog,
} from "@/components/organization-entity-dialog"
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Factory,
  Landmark,
  Layers,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  LogIn,
} from "lucide-react"

interface Tenant {
  id: string
  name: string
  code: string
  description: string | null
  is_active: boolean
  created_at?: string
}

interface TenantForm {
  name: string
  code: string
  description: string
  is_active: boolean
}

const emptyTenantForm: TenantForm = {
  name: "",
  code: "",
  description: "",
  is_active: true,
}

const entityTypeLabels: Record<OrganizationEntity["entity_type"], string> = {
  business_group: "Grupo empresarial",
  company: "Empresa",
  ueb: "UEB / Unidad Empresarial de Base",
}

const typeIcon = (type: OrganizationEntity["entity_type"]) => {
  if (type === "business_group") return <Layers className="h-4 w-4 text-sitecorp-primary" />
  if (type === "company") return <Building2 className="h-4 w-4 text-sitecorp-primary" />
  return <Factory className="h-4 w-4 text-sitecorp-primary" />
}

const friendlyTenantError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const normalized = message.toLowerCase()

  if (normalized.includes("tenants_code_key")) {
    return "Ya existe un workspace con ese código."
  }
  if (normalized.includes("row-level security")) {
    return "No tienes permiso para crear o editar workspaces."
  }
  return message || "No se pudo guardar el workspace."
}

const Organizations = () => {
  const { isPlatformSuperAdmin, hasPlatformPermission } = useAuth()
  const { setCurrentTenant } = useCurrentTenant()
  const navigate = useNavigate()
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [entities, setEntities] = React.useState<OrganizationEntity[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})

  const [tenantDialogOpen, setTenantDialogOpen] = React.useState(false)
  const [editingTenant, setEditingTenant] = React.useState<Tenant | null>(null)
  const [tenantForm, setTenantForm] = React.useState<TenantForm>(emptyTenantForm)
  const [tenantSaving, setTenantSaving] = React.useState(false)
  const [tenantError, setTenantError] = React.useState<string | null>(null)

  const [entityDialogOpen, setEntityDialogOpen] = React.useState(false)
  const [editingEntity, setEditingEntity] = React.useState<OrganizationEntity | null>(null)
  const [entityDefaultTenant, setEntityDefaultTenant] = React.useState("")
  const [entityDefaultParent, setEntityDefaultParent] = React.useState<string | undefined>()
  const [entityDefaultType, setEntityDefaultType] = React.useState<
    OrganizationEntity["entity_type"]
  >("business_group")

  const [usersEntity, setUsersEntity] = React.useState<OrganizationEntity | null>(null)
  const [deleteEntity, setDeleteEntity] = React.useState<OrganizationEntity | null>(null)
  const [deleteTenant, setDeleteTenant] = React.useState<Tenant | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [canDeleteEntities, setCanDeleteEntities] = React.useState(false)
  const [canDeleteTenants, setCanDeleteTenants] = React.useState(false)
  
    const loadData = React.useCallback(async () => {
    try {
      setError(null)
      setLoading(true)

      const [tenantResult, entityResult] = await Promise.all([
        supabase.from("tenants").select("*").order("name"),
        supabase.from("organization_entities").select("*").order("name"),
      ])

      if (tenantResult.error) throw tenantResult.error
      if (entityResult.error) throw entityResult.error

      const tenantRows = (tenantResult.data || []) as Tenant[]
      const entityRows = (entityResult.data || []) as OrganizationEntity[]

      setTenants(tenantRows)
      setEntities(entityRows)
      setExpanded((current) => {
        if (Object.keys(current).length > 0) return current
        return entityRows.reduce<Record<string, boolean>>((map, entity) => {
          if (entity.parent_id) map[entity.id] = true
          return map
        }, {})
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la organización.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    const checkDeletePermissions = async () => {
      const [entitiesPermission, tenantsPermission] = await Promise.all([
        hasPlatformPermission("organizations.delete"),
        hasPlatformPermission("tenants.delete"),
      ])

      setCanDeleteEntities(entitiesPermission)
      setCanDeleteTenants(tenantsPermission)
    }

    checkDeletePermissions()
  }, [hasPlatformPermission])

  const childrenByParent = React.useMemo(() => {
    return entities.reduce<Record<string, OrganizationEntity[]>>((map, entity) => {
      if (!entity.parent_id) return map
      map[entity.parent_id] = [...(map[entity.parent_id] || []), entity]
      return map
    }, {})
  }, [entities])

  const rootsByTenant = React.useMemo(() => {
    return entities.reduce<Record<string, OrganizationEntity[]>>((map, entity) => {
      if (entity.parent_id) return map
      map[entity.tenant_id] = [...(map[entity.tenant_id] || []), entity]
      return map
    }, {})
  }, [entities])

  const normalizedSearch = search.trim().toLowerCase()

  const entityMatchesSearch = (entity: OrganizationEntity) => {
    if (!normalizedSearch) return true
    return [entity.name, entity.code, entity.account_code || "", entityTypeLabels[entity.entity_type]]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch)
  }

  const subtreeMatchesSearch = (entity: OrganizationEntity): boolean => {
    if (entityMatchesSearch(entity)) return true
    return (childrenByParent[entity.id] || []).some((child) => subtreeMatchesSearch(child))
  }

  const tenantMatchesSearch = (tenant: Tenant) => {
    if (!normalizedSearch) return true
    const tenantMatches = [tenant.name, tenant.code, tenant.description || ""]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch)
    return tenantMatches || (rootsByTenant[tenant.id] || []).some((root) => subtreeMatchesSearch(root))
  }

  const openCreateTenant = () => {
    setEditingTenant(null)
    setTenantForm(emptyTenantForm)
    setTenantError(null)
    setTenantDialogOpen(true)
  }

  const openEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant)
    setTenantForm({
      name: tenant.name,
      code: tenant.code,
      description: tenant.description || "",
      is_active: tenant.is_active,
    })
    setTenantError(null)
    setTenantDialogOpen(true)
  }

  const submitTenant = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      setTenantError(null)
      if (!tenantForm.name.trim()) throw new Error("El nombre es obligatorio.")
      if (!tenantForm.code.trim()) throw new Error("El código es obligatorio.")

      setTenantSaving(true)
      const payload = {
        name: tenantForm.name.trim(),
        code: tenantForm.code.trim().toUpperCase(),
        description: tenantForm.description.trim() || null,
        is_active: tenantForm.is_active,
      }

      const response = editingTenant
        ? await supabase.from("tenants").update(payload).eq("id", editingTenant.id)
        : await supabase.from("tenants").insert(payload)

      if (response.error) throw response.error

      setTenantDialogOpen(false)
      setEditingTenant(null)
      setTenantForm(emptyTenantForm)
      await loadData()
    } catch (err) {
      setTenantError(friendlyTenantError(err))
    } finally {
      setTenantSaving(false)
    }
  }

  const openCreateRootEntity = (tenantId: string) => {
    setEditingEntity(null)
    setEntityDefaultTenant(tenantId)
    setEntityDefaultParent(undefined)
    setEntityDefaultType("business_group")
    setEntityDialogOpen(true)
  }

  const openCreateChildEntity = (parent: OrganizationEntity) => {
    setEditingEntity(null)
    setEntityDefaultTenant(parent.tenant_id)
    setEntityDefaultParent(parent.id)
    setEntityDefaultType(parent.entity_type === "business_group" ? "company" : "ueb")
    setEntityDialogOpen(true)
  }

  const openEditEntity = (entity: OrganizationEntity) => {
    setEditingEntity(entity)
    setEntityDefaultTenant(entity.tenant_id)
    setEntityDefaultParent(entity.parent_id || undefined)
    setEntityDefaultType(entity.entity_type)
    setEntityDialogOpen(true)
  }

  const deleteOrganizationEntity = async (entity: OrganizationEntity) => {
    try {
      setDeleting(true)
      const response = await supabase.from("organization_entities").delete().eq("id", entity.id)
      if (response.error) throw response.error
      setDeleteEntity(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la organización.")
    } finally {
      setDeleting(false)
    }
  }

  const deleteWorkspaceTenant = async (tenant: Tenant) => {
    try {
      setDeleting(true)
      const response = await supabase.from("tenants").delete().eq("id", tenant.id)
      if (response.error) throw response.error
      setDeleteTenant(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el workspace.")
    } finally {
      setDeleting(false)
    }
  }

  const enterWorkspace = (tenant: Tenant) => {
      setCurrentTenant(tenant)
      navigate("/")
    }
  
    const enterEntity = (entity: OrganizationEntity) => {
      navigate(`/entity/${entity.id}/panel`)
    }

  const renderEntity = (entity: OrganizationEntity, depth: number): React.ReactNode => {
    if (normalizedSearch && !subtreeMatchesSearch(entity)) return null

    const children = childrenByParent[entity.id] || []
    const isOpen = normalizedSearch ? true : expanded[entity.id] === true
    const hasChildren = children.length > 0

    return (
      <div key={entity.id} className="min-w-0">
        <div
          className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-3 transition-colors hover:border-sitecorp-primary/30 sm:flex-row sm:items-center sm:justify-between"
          style={{ marginLeft: depth === 0 ? undefined : depth * 14 }}
        >
          <div className="flex min-w-0 items-start gap-3">
            {hasChildren ? (
              <button
                type="button"
                aria-label={isOpen ? "Colapsar entidad" : "Expandir entidad"}
                onClick={() => setExpanded((current) => ({ ...current, [entity.id]: !isOpen }))}
                className="mt-0.5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-sitecorp-primary"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="mt-0.5 h-6 w-6" />
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {typeIcon(entity.entity_type)}
                <p className="truncate text-sm font-semibold text-ink">{entity.name}</p>
                <SiteCorpStatusBadge status="neutral">{entityTypeLabels[entity.entity_type]}</SiteCorpStatusBadge>
                <SiteCorpStatusBadge status="info">{entity.regime_id}</SiteCorpStatusBadge>
                {entity.is_sitecorp_account ? (
                  <>
                    <SiteCorpStatusBadge status="success">Cuenta SiteCorp</SiteCorpStatusBadge>
                    <SiteCorpStatusBadge status={entity.account_is_active ? "success" : "warning"}>
                      {entity.account_is_active ? "Cuenta activa" : "Cuenta suspendida"}
                    </SiteCorpStatusBadge>
                  </>
                ) : (
                  <SiteCorpStatusBadge status="neutral">Sin cuenta propia</SiteCorpStatusBadge>
                )}
                {!entity.is_active && <SiteCorpStatusBadge status="danger">Entidad inactiva</SiteCorpStatusBadge>}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Código interno: {entity.code}
                {entity.account_code ? ` · Cuenta: ${entity.account_code}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {entity.entity_type === "business_group" && (
                          <>
                            <SiteCorpButton size="sm" variant="outline" onClick={() => openCreateChildEntity(entity)}>
                              <Plus className="mr-1 h-3.5 w-3.5" /> Empresa
                            </SiteCorpButton>
                            <SiteCorpButton size="sm" variant="outline" onClick={() => enterEntity(entity)}>
                              <LogIn className="mr-1 h-3.5 w-3.5" /> Entrar
                            </SiteCorpButton>
                          </>
                        )}
                        {entity.entity_type === "company" && (
                          <>
                            <SiteCorpButton size="sm" variant="outline" onClick={() => openCreateChildEntity(entity)}>
                              <Plus className="mr-1 h-3.5 w-3.5" /> UEB
                            </SiteCorpButton>
                            <SiteCorpButton size="sm" variant="outline" onClick={() => enterEntity(entity)}>
                              <LogIn className="mr-1 h-3.5 w-3.5" /> Entrar
                            </SiteCorpButton>
                          </>
                        )}
                        {entity.entity_type === "ueb" && (
                          <SiteCorpButton size="sm" variant="outline" onClick={() => enterEntity(entity)}>
                            <LogIn className="mr-1 h-3.5 w-3.5" /> Entrar
                          </SiteCorpButton>
                        )}
                        <SiteCorpButton size="sm" variant="outline" onClick={() => openEditEntity(entity)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                        </SiteCorpButton>
                        {canDeleteEntities && (
                          <SiteCorpButton
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteEntity(entity)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                          </SiteCorpButton>
                        )}
                        <SiteCorpButton size="sm" onClick={() => setUsersEntity(entity)}>
                          <Users className="mr-1 h-3.5 w-3.5" /> Usuarios
                        </SiteCorpButton>
                      </div>
                    </div>

        {hasChildren && isOpen && (
          <div className="mt-2 space-y-2">
            {children.map((child) => renderEntity(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const sitecorpAccountCount = entities.filter((entity) => entity.is_sitecorp_account).length
  const activeAccountCount = entities.filter(
    (entity) => entity.is_sitecorp_account && entity.account_is_active
  ).length

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Clientes / Organizaciones"
        description="Workspaces independientes con grupos empresariales, empresas y UEB. Cada nodo puede tener su propia cuenta SiteCorp."
        actions={
          <SiteCorpButton onClick={openCreateTenant}>
            <Plus className="mr-2 h-4 w-4" /> Crear workspace
          </SiteCorpButton>
        }
      />

      {error && (
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
        )}
      {!isPlatformSuperAdmin && (
        <SiteCorpAlert type="info" title="Vista autorizada">
          Solo se muestran los workspaces y entidades a los que tu usuario tiene acceso.
        </SiteCorpAlert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SiteCorpCard title="Workspaces">
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold text-ink">{tenants.length}</p>
            <Landmark className="h-8 w-8 text-sitecorp-primary" />
          </div>
        </SiteCorpCard>
        <SiteCorpCard title="Entidades organizativas">
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold text-ink">{entities.length}</p>
            <Layers className="h-8 w-8 text-sitecorp-primary" />
          </div>
        </SiteCorpCard>
        <SiteCorpCard title="Cuentas SiteCorp">
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold text-ink">{sitecorpAccountCount}</p>
            <ShieldCheck className="h-8 w-8 text-sitecorp-primary" />
          </div>
        </SiteCorpCard>
        <SiteCorpCard title="Cuentas activas">
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold text-sitecorp-success">{activeAccountCount}</p>
            <Building2 className="h-8 w-8 text-sitecorp-success" />
          </div>
        </SiteCorpCard>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <SiteCorpInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar workspace, grupo, empresa, UEB o código..."
          className="pl-9"
        />
      </div>

      <SiteCorpCard
        title="Árbol organizativo"
        description="La jerarquía permanece visible aunque un nodo no sea cuenta SiteCorp."
      >
        {loading ? (
          <SiteCorpLoading rows={6} />
        ) : tenants.filter(tenantMatchesSearch).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No se encontraron workspaces o entidades.
          </div>
        ) : (
          <div className="space-y-5">
            {tenants.filter(tenantMatchesSearch).map((tenant) => {
              const roots = (rootsByTenant[tenant.id] || []).filter(
                (root) => !normalizedSearch || subtreeMatchesSearch(root)
              )

              return (
                <section
                  key={tenant.id}
                  className="rounded-2xl border border-border bg-sitecorp-background/60 p-3 sm:p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Landmark className="h-5 w-5 text-sitecorp-primary" />
                        <h3 className="text-base font-semibold text-ink">{tenant.name}</h3>
                        <SiteCorpStatusBadge status="neutral">{tenant.code}</SiteCorpStatusBadge>
                        <SiteCorpStatusBadge status={tenant.is_active ? "success" : "warning"}>
                          {tenant.is_active ? "Workspace activo" : "Workspace inactivo"}
                        </SiteCorpStatusBadge>
                      </div>
                      {tenant.description && (
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                          {tenant.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <SiteCorpButton size="sm" variant="outline" onClick={() => openEditTenant(tenant)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                      </SiteCorpButton>
                      <SiteCorpButton size="sm" variant="outline" onClick={() => openCreateRootEntity(tenant.id)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Grupo
                      </SiteCorpButton>
                      {canDeleteTenants && (
                        <SiteCorpButton size="sm" variant="outline" onClick={() => setDeleteTenant(tenant)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                        </SiteCorpButton>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {roots.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-white/70 p-5 text-sm text-muted-foreground">
                        Este workspace aún no tiene grupos empresariales.
                      </div>
                    ) : (
                      roots.map((root) => renderEntity(root, 0))
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </SiteCorpCard>

      <Dialog open={tenantDialogOpen} onOpenChange={setTenantDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Landmark className="h-5 w-5 text-sitecorp-primary" />
              {editingTenant ? `Editar ${editingTenant.name}` : "Crear workspace"}
            </DialogTitle>
            <DialogDescription>
              Un workspace es un árbol organizativo aislado técnicamente. No sustituye a las cuentas
              SiteCorp de cada entidad.
            </DialogDescription>
          </DialogHeader>

          {tenantError && (
            <SiteCorpAlert type="danger" title="Error">
              {tenantError}
            </SiteCorpAlert>
          )}

          <form onSubmit={submitTenant} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">Nombre</label>
                <SiteCorpInput
                  value={tenantForm.name}
                  onChange={(event) =>
                    setTenantForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">Código</label>
                <SiteCorpInput
                  value={tenantForm.code}
                  onChange={(event) =>
                    setTenantForm((current) => ({ ...current, code: event.target.value }))
                  }
                  placeholder="WORKSPACE-A"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Descripción</label>
              <SiteCorpInput
                value={tenantForm.description}
                onChange={(event) =>
                  setTenantForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <Checkbox
                checked={tenantForm.is_active}
                onCheckedChange={(checked) =>
                  setTenantForm((current) => ({ ...current, is_active: checked === true }))
                }
              />
              Workspace activo
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <SiteCorpButton
                type="button"
                variant="outline"
                onClick={() => setTenantDialogOpen(false)}
                disabled={tenantSaving}
              >
                Cancelar
              </SiteCorpButton>
              <SiteCorpButton type="submit" disabled={tenantSaving}>
                <Save className="mr-2 h-4 w-4" />
                {tenantSaving ? "Guardando..." : editingTenant ? "Guardar cambios" : "Crear workspace"}
              </SiteCorpButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <OrganizationEntityDialog
        open={entityDialogOpen}
        onOpenChange={setEntityDialogOpen}
        onSaved={loadData}
        tenants={tenants}
        entities={entities}
        editingEntity={editingEntity}
        defaultTenantId={entityDefaultTenant || tenants[0]?.id || ""}
        defaultParentId={entityDefaultParent}
        defaultEntityType={entityDefaultType}
      />

      <EntityUsersDialog
              entity={usersEntity}
              onClose={() => setUsersEntity(null)}
              onAccessChanged={loadData}
            />

            <Dialog open={Boolean(deleteEntity)} onOpenChange={(open) => !open && setDeleteEntity(null)}>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <Trash2 className="h-5 w-5 text-destructive" />
                    Eliminar entidad
                  </DialogTitle>
                  <DialogDescription>
                    ¿Estás seguro de que deseas eliminar la entidad "{deleteEntity?.name}"?
                    Esta acción no se puede deshacer.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <SiteCorpButton
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteEntity(null)}
                    disabled={deleting}
                  >
                    Cancelar
                  </SiteCorpButton>
                  <SiteCorpButton
                    type="button"
                    variant="destructive"
                    onClick={() => deleteEntity && deleteOrganizationEntity(deleteEntity)}
                    disabled={deleting}
                  >
                    {deleting ? "Eliminando..." : "Eliminar"}
                  </SiteCorpButton>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={Boolean(deleteTenant)} onOpenChange={(open) => !open && setDeleteTenant(null)}>
                          <DialogContent className="max-w-md rounded-2xl">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2 text-xl">
                                <Trash2 className="h-5 w-5 text-destructive" />
                                Eliminar workspace
                              </DialogTitle>
                              <DialogDescription>
                                ¿Estás seguro de que deseas eliminar el workspace "{deleteTenant?.name}"?
                                Esta acción no se puede deshacer.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                              <SiteCorpButton
                                type="button"
                                variant="outline"
                                onClick={() => setDeleteTenant(null)}
                                disabled={deleting}
                              >
                                Cancelar
                              </SiteCorpButton>
                              <SiteCorpButton
                                type="button"
                                variant="destructive"
                                onClick={() => deleteTenant && deleteWorkspaceTenant(deleteTenant)}
                                disabled={deleting}
                              >
                                {deleting ? "Eliminando..." : "Eliminar"}
                              </SiteCorpButton>
                            </div>
                          </DialogContent>
                        </Dialog>
                </div>
              )
            }
            
            export default Organizations