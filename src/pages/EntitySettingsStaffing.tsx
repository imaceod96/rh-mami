import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SelectItem } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ArrowLeft,
  FolderTree,
  Plus,
  Pencil,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  CornerDownRight,
  ArrowRightLeft,
  PowerOff,
  Power,
  Briefcase,
  Network,
} from "lucide-react"

interface OrganizationArea {
  id: string
  organization_entity_id: string
  parent_area_id: string | null
  code: string
  name: string
  description: string | null
  hierarchy_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface AreaNode extends OrganizationArea {
  children: AreaNode[]
}

type StatusFilter = "active" | "inactive" | "all"

const ROOT_SENTINEL = "__root__"

// Build a tree from a flat area list. Areas whose parent is not present in
// the list are rendered as roots (useful when filtering by status).
const buildTree = (areas: OrganizationArea[]): AreaNode[] => {
  const byId = new Map<string, AreaNode>()
  areas.forEach(a => byId.set(a.id, { ...a, children: [] }))

  const roots: AreaNode[] = []
  byId.forEach(node => {
    const parent = node.parent_area_id ? byId.get(node.parent_area_id) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortNodes = (nodes: AreaNode[]) => {
    nodes.sort(
      (a, b) => a.hierarchy_order - b.hierarchy_order || a.name.localeCompare(b.name)
    )
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

// Ids of an area and all its descendants
const getDescendantIds = (areaId: string, all: OrganizationArea[]): Set<string> => {
  const result = new Set<string>()
  const stack = [areaId]
  while (stack.length > 0) {
    const current = stack.pop()!
    result.add(current)
    all.filter(a => a.parent_area_id === current).forEach(c => stack.push(c.id))
  }
  return result
}

const EntitySettingsStaffing = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()

  const [areas, setAreas] = React.useState<OrganizationArea[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [canManage, setCanManage] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("active")
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [notice, setNotice] = React.useState<{ type: "success" | "danger"; message: string } | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingArea, setEditingArea] = React.useState<OrganizationArea | null>(null)
  const [formName, setFormName] = React.useState("")
  const [formCode, setFormCode] = React.useState("")
  const [formDescription, setFormDescription] = React.useState("")
  const [formParentId, setFormParentId] = React.useState<string>(ROOT_SENTINEL)
  const [formOrder, setFormOrder] = React.useState("0")
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const showNotice = (type: "success" | "danger", message: string) => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 5000)
  }

  const loadAreas = React.useCallback(async () => {
    if (!entityId) {
      setError("Parámetros de URL no válidos")
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: canView } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "areas.view",
      })
      if (!canView) {
        setAreas([])
        setError("No tiene permiso para ver la configuración de plantilla de esta entidad")
        return
      }

      const { data: canManageData } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "areas.manage",
      })
      setCanManage(!!canManageData)

      const { data, error: fetchError } = await supabase
        .from("organization_areas")
        .select("*")
        .eq("organization_entity_id", entityId)

      if (fetchError) throw fetchError
      setAreas((data as OrganizationArea[]) || [])
    } catch (err) {
      console.error("Error loading areas:", err)
      setError(err instanceof Error ? err.message : "Error al cargar las áreas")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    loadAreas()
  }, [loadAreas])

  // Keep every node expanded by default when data changes
  React.useEffect(() => {
    setExpanded(new Set(areas.map(a => a.id)))
  }, [areas])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredAreas = React.useMemo(() => {
    if (statusFilter === "all") return areas
    return areas.filter(a => (statusFilter === "active" ? a.is_active : !a.is_active))
  }, [areas, statusFilter])

  const tree = React.useMemo(() => buildTree(filteredAreas), [filteredAreas])

  // Options for the parent selector: active areas of this entity.
  // When editing, exclude the area itself and all its descendants.
  const parentOptions = React.useMemo(() => {
    const excluded = editingArea ? getDescendantIds(editingArea.id, areas) : new Set<string>()
    let options = areas.filter(a => a.is_active && !excluded.has(a.id))

    // If editing, always include the current parent so the value is visible
    if (editingArea?.parent_area_id) {
      const currentParent = areas.find(a => a.id === editingArea.parent_area_id)
      if (currentParent && !options.some(o => o.id === currentParent.id)) {
        options = [...options, currentParent]
      }
    }
    return options.sort(
      (a, b) => a.hierarchy_order - b.hierarchy_order || a.name.localeCompare(b.name)
    )
  }, [areas, editingArea])

  const openCreateDialog = (presetParentId?: string) => {
    setEditingArea(null)
    setFormName("")
    setFormCode("")
    setFormDescription("")
    setFormParentId(presetParentId || ROOT_SENTINEL)
    setFormOrder("0")
    setFormError(null)
    setDialogOpen(true)
  }

  const openEditDialog = (area: OrganizationArea) => {
    setEditingArea(area)
    setFormName(area.name)
    setFormCode(area.code)
    setFormDescription(area.description || "")
    setFormParentId(area.parent_area_id || ROOT_SENTINEL)
    setFormOrder(String(area.hierarchy_order))
    setFormError(null)
    setDialogOpen(true)
  }

  const mapSaveError = (err: { code?: string; message: string }) => {
    if (err.code === "23505" || err.message.includes("organization_areas_entity_code_unique")) {
      return "Ya existe un área con ese código en esta entidad"
    }
    return err.message
  }

  const handleSave = async () => {
    if (!entityId) return

    setFormError(null)
    if (!formName.trim()) {
      setFormError("El nombre es obligatorio")
      return
    }
    if (!formCode.trim()) {
      setFormError("El código es obligatorio")
      return
    }

    const duplicate = areas.find(
      a =>
        a.code.toLowerCase() === formCode.trim().toLowerCase() &&
        a.id !== editingArea?.id
    )
    if (duplicate) {
      setFormError("Ya existe un área con ese código en esta entidad")
      return
    }

    const orderNum = parseInt(formOrder, 10)
    const payload = {
      parent_area_id: formParentId === ROOT_SENTINEL ? null : formParentId,
      code: formCode.trim(),
      name: formName.trim(),
      description: formDescription.trim() || null,
      hierarchy_order: isNaN(orderNum) ? 0 : orderNum,
    }

    setSubmitting(true)
    try {
      if (editingArea) {
        const { error: updateError } = await supabase
          .from("organization_areas")
          .update(payload)
          .eq("id", editingArea.id)
        if (updateError) throw updateError
        showNotice("success", "Área actualizada correctamente")
      } else {
        const { error: insertError } = await supabase.from("organization_areas").insert({
          ...payload,
          organization_entity_id: entityId,
          is_active: true,
        })
        if (insertError) throw insertError
        showNotice("success", "Área creada correctamente")
      }

      setDialogOpen(false)
      await loadAreas()
    } catch (err) {
      console.error("Error saving area:", err)
      const mapped = err instanceof Error ? mapSaveError(err as Error & { code?: string }) : "Error al guardar el área"
      setFormError(mapped)
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (area: OrganizationArea) => {
    if (area.is_active) {
      const activeChildren = areas.filter(a => a.parent_area_id === area.id && a.is_active)
      if (activeChildren.length > 0) {
        showNotice(
          "danger",
          "Esta área contiene subáreas activas. Debes moverlas o desactivarlas antes de desactivar el área."
        )
        return
      }
      if (!confirm(`¿Desactivar el área "${area.name}"?`)) return
    } else {
      if (area.parent_area_id) {
        const parent = areas.find(a => a.id === area.parent_area_id)
        if (parent && !parent.is_active) {
          showNotice(
            "danger",
            "No se puede reactivar esta área porque su área superior está inactiva. Reactiva primero el área superior."
          )
          return
        }
      }
      if (!confirm(`¿Reactivar el área "${area.name}"?`)) return
    }

    try {
      const { error: updateError } = await supabase
        .from("organization_areas")
        .update({ is_active: !area.is_active })
        .eq("id", area.id)
      if (updateError) throw updateError
      await loadAreas()
      showNotice("success", area.is_active ? "Área desactivada" : "Área reactivada")
    } catch (err) {
      console.error("Error toggling area state:", err)
      const message = err instanceof Error ? err.message : "Error al cambiar el estado del área"
      showNotice("danger", message)
    }
  }

  const renderNode = (node: AreaNode): React.ReactNode => {
    const hasChildren = node.children.length > 0
    const isExpanded = expanded.has(node.id)

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-muted/40",
            !node.is_active && "opacity-70"
          )}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
              aria-label={isExpanded ? "Contraer" : "Expandir"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="flex h-6 w-6 shrink-0" />
          )}

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={cn(
                "text-sm font-medium",
                node.is_active ? "text-ink" : "text-muted-foreground"
              )}
            >
              {node.name}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {node.code}
            </span>
            <SiteCorpStatusBadge status={node.is_active ? "success" : "neutral"}>
              {node.is_active ? "Activa" : "Inactiva"}
            </SiteCorpStatusBadge>
            {node.description && (
              <span className="hidden truncate text-xs text-muted-foreground md:inline">
                {node.description}
              </span>
            )}
          </div>

          {canManage && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
                  aria-label="Acciones del área"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-1">
                <button
                  type="button"
                  onClick={() => openEditDialog(node)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => openEditDialog(node)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink hover:bg-muted"
                >
                  <ArrowRightLeft className="h-4 w-4" /> Mover
                </button>
                {node.is_active && (
                  <button
                    type="button"
                    onClick={() => openCreateDialog(node.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink hover:bg-muted"
                  >
                    <CornerDownRight className="h-4 w-4" /> Añadir subárea
                  </button>
                )}
                <div className="my-1 h-px bg-border" />
                {node.is_active ? (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(node)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-sitecorp-danger hover:bg-muted"
                  >
                    <PowerOff className="h-4 w-4" /> Desactivar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(node)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink hover:bg-muted"
                  >
                    <Power className="h-4 w-4" /> Reactivar
                  </button>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-4 border-l border-border pl-2">
            {node.children.map(child => renderNode(child))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Configuración de plantilla"
          description="Cargando estructura de áreas..."
        />
        <SiteCorpLoading rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Configuración de plantilla"
          description="Define la estructura organizativa y los puestos autorizados de esta entidad."
        />
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
        <div className="flex justify-end">
          <SiteCorpButton variant="outline" onClick={() => navigate(`/entity/${entityId}/settings`)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a ajustes
          </SiteCorpButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Configuración de plantilla"
        description="Define la estructura organizativa y los puestos autorizados de esta entidad."
        actions={
          <SiteCorpButton variant="outline" onClick={() => navigate(`/entity/${entityId}/settings`)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a ajustes
          </SiteCorpButton>
        }
      />

      {notice && <SiteCorpAlert type={notice.type}>{notice.message}</SiteCorpAlert>}

      <SiteCorpCard>
        <Tabs defaultValue="areas" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="areas">
              <FolderTree className="mr-2 h-4 w-4" /> Áreas
            </TabsTrigger>
            <TabsTrigger value="cargos" disabled>
              <Briefcase className="mr-2 h-4 w-4" /> Cargos
            </TabsTrigger>
            <TabsTrigger value="puestos" disabled>
              <Network className="mr-2 h-4 w-4" /> Puestos
            </TabsTrigger>
          </TabsList>

          {/* ================= ÁREAS ================= */}
          <TabsContent value="areas" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">Áreas</h3>
                <p className="text-sm text-muted-foreground">
                  Define la estructura interna de áreas y subáreas de esta entidad.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SiteCorpSelect
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                >
                  <SelectItem value="active">Activas</SelectItem>
                  <SelectItem value="inactive">Inactivas</SelectItem>
                  <SelectItem value="all">Todas</SelectItem>
                </SiteCorpSelect>
                {canManage && (
                  <SiteCorpButton onClick={() => openCreateDialog()}>
                    <Plus className="mr-2 h-4 w-4" /> Nueva área
                  </SiteCorpButton>
                )}
              </div>
            </div>

            {areas.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <FolderTree className="mb-4 h-12 w-12 text-muted-foreground" />
                <h4 className="mb-1 text-base font-semibold text-ink">No hay áreas configuradas.</h4>
                <p className="mb-4 text-sm text-muted-foreground">
                  Comienza creando la estructura interna de esta entidad.
                </p>
                {canManage && (
                  <SiteCorpButton onClick={() => openCreateDialog()}>
                    <Plus className="mr-2 h-4 w-4" /> Crear primera área
                  </SiteCorpButton>
                )}
              </div>
            ) : tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <p className="text-sm text-muted-foreground">
                  {statusFilter === "inactive"
                    ? "No hay áreas inactivas."
                    : "No hay áreas que coincidan con el filtro seleccionado."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[320px] space-y-0.5">
                  {tree.map(node => renderNode(node))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Cargos and Puestos are intentionally NOT implemented in this phase */}
          <TabsContent value="cargos" className="space-y-4">
            <SiteCorpAlert type="info" title="Próximamente">
              Los cargos se implementarán en una fase posterior.
            </SiteCorpAlert>
          </TabsContent>
          <TabsContent value="puestos" className="space-y-4">
            <SiteCorpAlert type="info" title="Próximamente">
              Los puestos se implementarán en una fase posterior.
            </SiteCorpAlert>
          </TabsContent>
        </Tabs>
      </SiteCorpCard>

      {/* New / Edit Area Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setFormError(null)
        }}
      >
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingArea ? "Editar área" : "Nueva área"}</DialogTitle>
            <DialogDescription>
              {editingArea
                ? "Modifica los datos del área. Cambiar el área superior permite moverla dentro de la jerarquía."
                : "Las áreas definen la estructura interna de la entidad. Deja el área superior vacía para crear un área raíz."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="area-name">Nombre *</Label>
              <SiteCorpInput
                id="area-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej.: Recursos Humanos"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="area-code">Código *</Label>
                <SiteCorpInput
                  id="area-code"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="Ej.: RRHH"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="area-order">Orden</Label>
                <SiteCorpInput
                  id="area-order"
                  type="number"
                  value={formOrder}
                  onChange={(e) => setFormOrder(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Área superior</Label>
              <SiteCorpSelect
                value={formParentId}
                onValueChange={(value) => setFormParentId(value)}
              >
                <SelectItem value={ROOT_SENTINEL}>Sin área superior (área raíz)</SelectItem>
                {parentOptions.map(area => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name} ({area.code}){!area.is_active ? " — inactiva" : ""}
                  </SelectItem>
                ))}
              </SiteCorpSelect>
              <p className="text-xs text-muted-foreground">
                Solo se muestran áreas de esta entidad.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="area-description">Descripción</Label>
              <Textarea
                id="area-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descripción opcional del área"
                rows={2}
              />
            </div>
            {formError && <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>}
          </div>
          <DialogFooter>
            <SiteCorpButton
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton onClick={handleSave} disabled={submitting}>
              {submitting ? "Guardando..." : editingArea ? "Guardar cambios" : "Crear área"}
            </SiteCorpButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EntitySettingsStaffing
