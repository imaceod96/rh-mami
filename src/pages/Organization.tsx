import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Building2, ChevronDown, ChevronRight, Factory, Layers, Pencil, Plus, Search, Trash2, Users } from "lucide-react"

interface Tenant {
  id: string
  name: string
  [key: string]: any
}
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OrganizationEntityDialog } from "@/components/organization-entity-dialog"

interface OrganizationEntity {
  id: string
  tenant_id: string
  parent_id: string | null
  entity_type: "business_group" | "company" | "ueb"
  name: string
  code: string
  regime_id: string
  status: string
  description: string | null
  address: string | null
  municipality: string | null
  province: string | null
  postal_code: string | null
  is_active: boolean
  is_sitecorp_account: boolean
  account_is_active: boolean
  account_code: string | null
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

const Organization = () => {
  const { currentTenant } = useCurrentTenant()
  const { isPlatformSuperAdmin } = useAuth()
  const navigate = useNavigate()
  
  const [entities, setEntities] = React.useState<OrganizationEntity[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [entityDialogOpen, setEntityDialogOpen] = React.useState(false)
  const [editingEntity, setEditingEntity] = React.useState<OrganizationEntity | null>(null)
  const [deleteEntity, setDeleteEntity] = React.useState<OrganizationEntity | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [canDeleteEntities, setCanDeleteEntities] = React.useState(false)
  
  const loadEntities = React.useCallback(async () => {
    if (!currentTenant) return
    
    try {
      setError(null)
      setLoading(true)
      
      const entitiesResult = await supabase
        .from("organization_entities")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("name")
      
      if (entitiesResult.error) throw entitiesResult.error
      setEntities(entitiesResult.data || [])
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la organización")
    } finally {
      setLoading(false)
    }
  }, [currentTenant?.id])
  
  React.useEffect(() => {
    loadEntities()
  }, [loadEntities])
  
  const checkDeletePermissions = React.useCallback(async () => {
    if (!currentTenant) return
    
    try {
      const { data } = await supabase.rpc("can_access_entity", {
        target_entity_id: currentTenant.id,
        permission_code: "organization.manage"
      })
      
      setCanDeleteEntities(!!data)
    } catch (err) {
      console.error("Error checking delete permissions:", err)
      setCanDeleteEntities(false)
    }
  }, [currentTenant?.id])
  
  React.useEffect(() => {
    checkDeletePermissions()
  }, [checkDeletePermissions])
  
  const openCreateEntity = () => {
    setEditingEntity(null)
    setEntityDialogOpen(true)
  }
  
  const openEditEntity = (entity: OrganizationEntity) => {
    setEditingEntity(entity)
    setEntityDialogOpen(true)
  }
  
  const deleteOrganizationEntity = async () => {
    if (!deleteEntity) return
    
    try {
      setDeleting(true)
      const response = await supabase
        .from("organization_entities")
        .delete()
        .eq("id", deleteEntity.id)
      
      if (response.error) throw response.error
      
      setDeleteEntity(null)
      loadEntities()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la entidad")
    } finally {
      setDeleting(false)
    }
  }
  
  const filteredEntities = entities.filter(entity =>
    entity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entity.code.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  const renderEntityTree = (entityList: OrganizationEntity[], level = 0) => {
    return entityList.map((entity) => {
      const hasChildren = entities.some(e => e.parent_id === entity.id)
      
      return (
        <div key={entity.id} className="space-y-2">
          <div
            className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 transition-all hover:bg-muted/50 cursor-pointer"
            style={{ marginLeft: `${level * 24}px` }}
            onClick={() => navigate(`/organization/${entity.id}`)}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {hasChildren && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              {typeIcon(entity.entity_type)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{entity.name}</p>
                <p className="truncate text-xs text-muted-foreground">{entity.code}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SiteCorpStatusBadge
                status={entity.is_active ? "success" : "danger"}
              >
                {entity.is_active ? "Activa" : "Inactiva"}
              </SiteCorpStatusBadge>
              {entity.is_sitecorp_account && (
                <SiteCorpStatusBadge status="info">
                  Cuenta
                </SiteCorpStatusBadge>
              )}
              {isPlatformSuperAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation()
                      openEditEntity(entity)
                    }}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    {canDeleteEntities && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteEntity(entity)
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          {hasChildren && renderEntityTree(
            entities.filter(e => e.parent_id === entity.id),
            level + 1
          )}
        </div>
      )
    })
  }
  
  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Organización"
        description="Gestión de la estructura organizativa"
      />
      
      {error && (
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
      )}
      
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <SiteCorpInput
          placeholder="Buscar entidades..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-80"
        />
        
        {isPlatformSuperAdmin && (
          <SiteCorpButton
            onClick={openCreateEntity}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva entidad
          </SiteCorpButton>
        )}
      </div>
      
      {loading ? (
        <SiteCorpLoading rows={3} />
      ) : filteredEntities.length === 0 ? (
        <SiteCorpCard title="No hay entidades" description="No se encontraron entidades en el workspace actual">
          <p className="text-sm text-muted-foreground">
            {searchTerm ? "No se encontraron entidades con el término de búsqueda." : "No hay entidades en el workspace actual."}
          </p>
        </SiteCorpCard>
      ) : (
        <SiteCorpCard title="Estructura organizativa" description="Visualización del organigrama de entidades">
          <div className="space-y-2">
            {renderEntityTree(
              filteredEntities.filter(e => !e.parent_id)
            )}
          </div>
        </SiteCorpCard>
      )}
      
      <OrganizationEntityDialog
        open={entityDialogOpen}
        onOpenChange={setEntityDialogOpen}
        onSaved={loadEntities}
        tenants={currentTenant ? [currentTenant as Tenant] : []}
        entities={entities}
        editingEntity={editingEntity}
        defaultTenantId={currentTenant?.id || ""}
      />
      
      <Dialog
        open={Boolean(deleteEntity)}
        onOpenChange={(open) => !open && setDeleteEntity(null)}
      >
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
              onClick={deleteOrganizationEntity}
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

export default Organization