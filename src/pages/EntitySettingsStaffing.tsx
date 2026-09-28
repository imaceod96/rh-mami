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
  Search,
  Trash2,
} from "lucide-react"
import { toRomanNumeral } from "@/utils/roman-numerals"
import { JobForm } from "@/components/JobForm"
import { AreaForm } from "@/components/AreaForm"
import { PositionForm, type PositionJobOption, type PositionEditingData } from "@/components/PositionForm"

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

interface OrganizationJob {
  id: string
  organization_entity_id: string
  area_id: string
  code: string
  name: string
  description: string | null
  salary_group_id: string
  hierarchy_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  area: {
    id: string
    name: string
    code: string
    is_active: boolean
    organization_entity_id: string
  }
  salary_group: {
    id: string
    salary_scale_id: string
    sequence_number: number
    description: string | null
    is_active: boolean
    current_value: {
      amount: number
      currency_code: string
    } | null
  } | null
}

type StatusFilter = "active" | "inactive" | "all"

interface OrganizationPosition {
  id: string
  organization_entity_id: string
  job_id: string
  code: string
  name: string
  description: string | null
  position_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  job: {
    id: string
    name: string
    code: string
    is_active: boolean
    area_id: string
    area: {
      id: string
      name: string
      code: string
    }
    salary_group: {
      id: string
      salary_scale_id: string
      sequence_number: number
    } | null
  } | null
}

interface SalaryValue {
  amount: number
  currency_code: string
}

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
  const [jobs, setJobs] = React.useState<OrganizationJob[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [canManage, setCanManage] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("active")
  const [areaFilter, setAreaFilter] = React.useState<string>("all")
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [notice, setNotice] = React.useState<{ type: "success" | "danger"; message: string } | null>(null)

  // Separate dialog states for Areas and Jobs
  const [areaDialogOpen, setAreaDialogOpen] = React.useState(false)
  const [jobDialogOpen, setJobDialogOpen] = React.useState(false)
  const [editingArea, setEditingArea] = React.useState<OrganizationArea | null>(null)
  const [editingJob, setEditingJob] = React.useState<OrganizationJob | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  // Positions state (separate dialog state to avoid cross-contamination)
  const [positions, setPositions] = React.useState<OrganizationPosition[]>([])
  const [applicableScaleId, setApplicableScaleId] = React.useState<string | null>(null)
  const [salaryValuesByGroup, setSalaryValuesByGroup] = React.useState<Record<string, SalaryValue | null>>({})
  const [positionSearch, setPositionSearch] = React.useState("")
  const [jobFilter, setJobFilter] = React.useState<string>("all")
  const [positionDialogOpen, setPositionDialogOpen] = React.useState(false)
  const [editingPosition, setEditingPosition] = React.useState<PositionEditingData | null>(null)
  const [activeTab, setActiveTab] = React.useState("areas")

  const showNotice = (type: "success" | "danger", message: string) => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 5000)
  }

  const loadData = React.useCallback(async () => {
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
        permission_code: "staffing.view",
      })
      const { data: canViewManage } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "staffing.manage",
      })
      if (!canView && !canViewManage) {
        setJobs([])
        setPositions([])
        setError("No tiene permiso para ver la configuración de plantilla de esta entidad")
        return
      }

      const { data: canManageData } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "staffing.manage",
      })
      setCanManage(!!canManageData)

      // Load areas
      const { data: areasData, error: areasError } = await supabase
        .from("organization_areas")
        .select("*")
        .eq("organization_entity_id", entityId)

      if (areasError) throw areasError
      setAreas((areasData as OrganizationArea[]) || [])

      // Load jobs with area and salary group info
      const { data: jobsData, error: jobsError } = await supabase
        .from("organization_jobs")
        .select(`
          *,
          area:organization_areas(id, name, code, is_active, organization_entity_id),
          salary_group:salary_groups(
            id,
            salary_scale_id,
            sequence_number,
            description,
            is_active,
            salary_group_values(
              id,
              amount,
              currency_code,
              effective_from,
              effective_to,
              is_active
            )
          )
        `)
        .eq("organization_entity_id", entityId)
        .order("hierarchy_order")

      if (jobsError) throw jobsError

      // Transform jobs to include current salary value
      const jobsWithCurrentValue = (jobsData as any[])?.map((job: any) => {
        const currentValue = job.salary_group?.salary_group_values?.length > 0
          ? job.salary_group.salary_group_values[0]
          : null

        return {
          ...job,
          salary_group: job.salary_group
            ? {
                ...job.salary_group,
                current_value: currentValue
                  ? {
                      amount: currentValue.amount,
                      currency_code: currentValue.currency_code,
                    }
                  : null,
              }
            : null,
        }
      }) as OrganizationJob[]

      setJobs(jobsWithCurrentValue || [])

      // Escala salarial aplicable a la entidad:
      // PRESUPUESTADA → escala global; EMPRESARIAL → escala de esta entidad (sin fallback)
      const { data: scaleIdData, error: scaleError } = await supabase.rpc(
        "resolve_salary_scale_for_entity",
        { entity_id: entityId }
      )
      if (scaleError) throw scaleError
      const scaleId = (scaleIdData as string | null) || null
      setApplicableScaleId(scaleId)

      // Valores vigentes por grupo salarial (uno por grupo, effective_from más reciente)
      const groupIds = Array.from(
        new Set(
          (jobsWithCurrentValue || [])
            .map(j => j.salary_group?.id)
            .filter((id): id is string => !!id)
        )
      )
      const valuesMap: Record<string, SalaryValue | null> = {}
      if (groupIds.length > 0) {
        const { data: valuesData, error: valuesError } = await supabase
          .from("salary_group_values")
          .select("salary_group_id, amount, currency_code, effective_from")
          .in("salary_group_id", groupIds)
          .eq("is_active", true)
          .order("effective_from", { ascending: false })

        if (valuesError) throw valuesError
        ;(valuesData as any[])?.forEach(v => {
          if (valuesMap[v.salary_group_id] === undefined) {
            valuesMap[v.salary_group_id] = {
              amount: v.amount,
              currency_code: v.currency_code,
            }
          }
        })
      }
      setSalaryValuesByGroup(valuesMap)

      // Cargar puestos con Cargo → Área y Grupo salarial
      const { data: positionsData, error: positionsError } = await supabase
        .from("organization_positions")
        .select(`
          *,
          job:organization_jobs(
            id,
            name,
            code,
            is_active,
            area_id,
            area:organization_areas(id, name, code),
            salary_group:salary_groups(id, salary_scale_id, sequence_number)
          )
        `)
        .eq("organization_entity_id", entityId)
        .order("created_at")

      if (positionsError) throw positionsError
      setPositions((positionsData as OrganizationPosition[]) || [])
    } catch (err) {
      console.error("Error loading data:", err)
      setError(err instanceof Error ? err.message : "Error al cargar los datos")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

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

  const filteredJobs = React.useMemo(() => {
    let result = jobs

    // Filter by area
    if (areaFilter !== "all") {
      result = result.filter(j => j.area_id === areaFilter)
    }

    // Filter by status
    if (statusFilter === "active") {
      result = result.filter(j => j.is_active)
    } else if (statusFilter === "inactive") {
      result = result.filter(j => !j.is_active)
    }

    return result
  }, [jobs, areaFilter, statusFilter])

  const activeJobs = React.useMemo(() => jobs.filter(j => j.is_active), [jobs])

  // Opciones del filtro Cargo: cargos de la entidad, acotados al área filtrada
  const jobFilterOptions = React.useMemo(() => {
    if (areaFilter !== "all") {
      return jobs.filter(j => j.area_id === areaFilter)
    }
    return jobs
  }, [jobs, areaFilter])

  const filteredPositions = React.useMemo(() => {
    const search = positionSearch.trim().toLowerCase()
    let result = positions

    if (areaFilter !== "all") {
      result = result.filter(p => p.job?.area_id === areaFilter)
    }
    if (jobFilter !== "all") {
      result = result.filter(p => p.job_id === jobFilter)
    }
    if (statusFilter === "active") {
      result = result.filter(p => p.is_active)
    } else if (statusFilter === "inactive") {
      result = result.filter(p => !p.is_active)
    }
    if (search) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.code.toLowerCase().includes(search) ||
        (p.job?.name || "").toLowerCase().includes(search) ||
        (p.job?.area?.name || "").toLowerCase().includes(search)
      )
    }

    return [...result].sort((a, b) =>
      (a.job?.name || "").localeCompare(b.job?.name || "") ||
      a.position_order - b.position_order ||
      a.name.localeCompare(b.name)
    )
  }, [positions, areaFilter, jobFilter, statusFilter, positionSearch])

  // Salario resuelto: Puesto → Cargo → Grupo salarial → Escala aplicable → valor vigente
  const resolvePositionSalary = React.useCallback(
    (position: OrganizationPosition): SalaryValue | null => {
      if (!applicableScaleId) return null
      const group = position.job?.salary_group
      if (!group || group.salary_scale_id !== applicableScaleId) return null
      return salaryValuesByGroup[group.id] || null
    },
    [applicableScaleId, salaryValuesByGroup]
  )

  // Opciones de cargo para el formulario (área incluida para info derivada)
  const positionJobOptions: PositionJobOption[] = React.useMemo(
    () =>
      jobs.map(j => ({
        id: j.id,
        name: j.name,
        code: j.code,
        is_active: j.is_active,
        area_id: j.area_id,
        area: j.area
          ? { id: j.area.id, name: j.area.name, code: j.area.code }
          : { id: j.area_id, name: "—", code: "—" },
        salary_group: j.salary_group
          ? {
              id: j.salary_group.id,
              salary_scale_id: j.salary_group.salary_scale_id,
              sequence_number: j.salary_group.sequence_number,
            }
          : null,
      })),
    [jobs]
  )

  // Position dialog handlers
  const openCreatePositionDialog = () => {
    setEditingPosition(null)
    setFormError(null)
    setPositionDialogOpen(true)
  }

  const openEditPositionDialog = (position: OrganizationPosition) => {
    setEditingPosition({
      id: position.id,
      job_id: position.job_id,
      code: position.code,
      name: position.name,
      description: position.description,
    })
    setFormError(null)
    setPositionDialogOpen(true)
  }

  const handlePositionSave = async () => {
    await loadData()
    setPositionDialogOpen(false)
    setEditingPosition(null)
  }

  const handleToggleActivePosition = async (position: OrganizationPosition) => {
    if (position.is_active) {
      if (!confirm(`¿Desactivar el puesto "${position.name}"?`)) return
    } else {
      const job = jobs.find(j => j.id === position.job_id)
      if (job && !job.is_active) {
        showNotice("danger", "No se puede reactivar este puesto porque su cargo está inactivo. Reactiva primero el cargo.")
        return
      }
      if (!confirm(`¿Reactivar el puesto "${position.name}"?`)) return
    }

    try {
      const { error: updateError } = await supabase
        .from("organization_positions")
        .update({ is_active: !position.is_active })
        .eq("id", position.id)
      if (updateError) throw updateError
      await loadData()
      showNotice("success", position.is_active ? "Puesto desactivado" : "Puesto reactivado")
    } catch (err) {
      console.error("Error toggling position state:", err)
      const message = err instanceof Error ? err.message : "Error al cambiar el estado del puesto"
      showNotice("danger", message)
    }
  }

  const tree = React.useMemo(() => buildTree(areas), [areas])

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

  // Area dialog handlers
  const openCreateAreaDialog = () => {
    setEditingArea(null)
    setFormError(null)
    setAreaDialogOpen(true)
  }

  const openEditAreaDialog = (area: OrganizationArea) => {
    setEditingArea(area)
    setFormError(null)
    setAreaDialogOpen(true)
  }

  // Job dialog handlers
  const openCreateJobDialog = () => {
    setEditingJob(null)
    setFormError(null)
    setJobDialogOpen(true)
  }

  const openEditJobDialog = (job: OrganizationJob) => {
    setEditingJob(job)
    setFormError(null)
    setJobDialogOpen(true)
  }

  const handleAreaSave = async () => {
    await loadData()
    setAreaDialogOpen(false)
    setEditingArea(null)
  }

  const handleJobSave = async () => {
    await loadData()
    setJobDialogOpen(false)
    setEditingJob(null)
  }

  const handleToggleActiveArea = async (area: OrganizationArea) => {
        if (area.is_active) {
          if (!confirm(`¿Desactivar el área "${area.name}"?`)) return
        } else {
          if (!confirm(`¿Reactivar el área "${area.name}"?`)) return
        }
    
        try {
          const { error: updateError } = await supabase
            .from("organization_areas")
            .update({ is_active: !area.is_active })
            .eq("id", area.id)
          if (updateError) throw updateError
          await loadData()
          showNotice("success", area.is_active ? "Área desactivada" : "Área reactivada")
        } catch (err) {
          console.error("Error toggling area state:", err)
          const message = err instanceof Error ? err.message : "Error al cambiar el estado del área"
          showNotice("danger", message)
        }
      }
  
    const handleToggleActiveJob = async (job: OrganizationJob) => {
        if (job.is_active) {
          if (!confirm(`¿Desactivar el cargo "${job.name}"?`)) return
        } else {
          // Validate that the area is active before allowing reactivation
          const area = areas.find(a => a.id === job.area_id)
          if (area && !area.is_active) {
            showNotice("danger", "No se puede reactivar este cargo porque su área está inactiva. Reactiva primero el área.")
            return
          }
          if (!confirm(`¿Reactivar el cargo "${job.name}"?`)) return
        }
    
        try {
          const { error: updateError } = await supabase
            .from("organization_jobs")
            .update({ is_active: !job.is_active })
            .eq("id", job.id)
          if (updateError) throw updateError
          await loadData()
          showNotice("success", job.is_active ? "Cargo desactivado" : "Cargo reactivado")
        } catch (err) {
          console.error("Error toggling job state:", err)
          const message = err instanceof Error ? err.message : "Error al cambiar el estado del cargo"
          showNotice("danger", message)
        }
      }

  const handleDelete = async (job: OrganizationJob) => {
    if (!confirm(`¿Desactivar el cargo "${job.name}"?`)) return

    try {
      const { error: updateError } = await supabase
        .from("organization_jobs")
        .update({ is_active: false })
        .eq("id", job.id)
      if (updateError) throw updateError
      await loadData()
      showNotice("success", "Cargo desactivado")
    } catch (err) {
      console.error("Error deactivating job:", err)
      const message = err instanceof Error ? err.message : "Error al desactivar el cargo"
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
                  onClick={() => openEditAreaDialog(node)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => openEditAreaDialog(node)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink hover:bg-muted"
                >
                  <ArrowRightLeft className="h-4 w-4" /> Mover
                </button>
                {node.is_active && (
                  <button
                    type="button"
                    onClick={() => openCreateAreaDialog()}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink hover:bg-muted"
                  >
                    <CornerDownRight className="h-4 w-4" /> Añadir subárea
                  </button>
                )}
                <div className="my-1 h-px bg-border" />
                {node.is_active ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActiveArea(node)}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-sitecorp-danger hover:bg-muted"
                                  >
                                    <PowerOff className="h-4 w-4" /> Desactivar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActiveArea(node)}
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
          description="Cargando estructura de áreas, cargos y puestos..."
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="areas">
              <FolderTree className="mr-2 h-4 w-4" /> Áreas
            </TabsTrigger>
            <TabsTrigger value="cargos">
              <Briefcase className="mr-2 h-4 w-4" /> Cargos
            </TabsTrigger>
            <TabsTrigger value="puestos">
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
                  <SiteCorpButton onClick={openCreateAreaDialog}>
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
                  <SiteCorpButton onClick={openCreateAreaDialog}>
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

          {/* ================= CARGOS ================= */}
          <TabsContent value="cargos" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">Cargos</h3>
                <p className="text-sm text-muted-foreground">
                  Define los cargos de la entidad, su área y grupo salarial.
                </p>
              </div>
              {canManage && (
                <SiteCorpButton onClick={openCreateJobDialog}>
                  <Plus className="mr-2 h-4 w-4" /> Nuevo cargo
                </SiteCorpButton>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SiteCorpSelect
                value={areaFilter}
                onValueChange={(value) => setAreaFilter(value)}
              >
                <SelectItem value="all">Todas las áreas</SelectItem>
                {areas.filter(a => a.is_active).map(area => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name} ({area.code})
                  </SelectItem>
                ))}
              </SiteCorpSelect>
              <SiteCorpSelect
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SiteCorpSelect>
            </div>

            {/* Empty state */}
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <Briefcase className="mb-4 h-12 w-12 text-muted-foreground" />
                <h4 className="mb-1 text-base font-semibold text-ink">No hay cargos configurados.</h4>
                <p className="mb-4 text-sm text-muted-foreground">
                  Comienza creando los cargos que conformarán la plantilla de esta entidad.
                </p>
                {canManage && (
                  <SiteCorpButton onClick={openCreateJobDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Crear primer cargo
                  </SiteCorpButton>
                )}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <p className="text-sm text-muted-foreground">
                  {statusFilter === "inactive"
                    ? "No hay cargos inactivos."
                    : "No hay cargos que coincidan con el filtro seleccionado."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group jobs by area */}
                {areas.filter(a => a.is_active).map(area => {
                  const areaJobs = filteredJobs.filter(j => j.area_id === area.id)
                  if (areaJobs.length === 0) return null

                  return (
                    <div key={area.id} className="space-y-2">
                      <h4 className="text-sm font-semibold text-ink">
                        {area.name} ({area.code})
                      </h4>
                      <div className="space-y-2">
                        {areaJobs.map(job => (
                          <div
                            key={job.id}
                            className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="text-sm font-medium text-ink">
                                {job.name}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                {job.code}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Grupo: {job.salary_group
                                  ? toRomanNumeral(job.salary_group.sequence_number)
                                  : "N/A"}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {job.salary_group?.current_value
                                  ? `${job.salary_group.current_value.amount.toLocaleString("es-CU", {
                                      minimumFractionDigits: 2,
                                    })} ${job.salary_group.current_value.currency_code}`
                                  : "Sin salario"}
                              </span>
                              <SiteCorpStatusBadge status={job.is_active ? "success" : "neutral"}>
                                {job.is_active ? "Activo" : "Inactivo"}
                              </SiteCorpStatusBadge>
                            </div>

                            {canManage && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditJobDialog(job)}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
                                  aria-label="Editar cargo"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                {job.is_active ? (
                                                                                                  <button
                                                                                                    type="button"
                                                                                                    onClick={() => handleToggleActiveJob(job)}
                                                                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-sitecorp-danger"
                                                                                                    aria-label="Desactivar cargo"
                                                                                                  >
                                                                                                    <PowerOff className="h-4 w-4" />
                                                                                                  </button>
                                                                                                ) : (
                                                                                                  <button
                                                                                                    type="button"
                                                                                                    onClick={() => handleToggleActiveJob(job)}
                                                                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
                                                                                                    aria-label="Reactivar cargo"
                                                                                                  >
                                                                                                    <Power className="h-4 w-4" />
                                                                                                  </button>
                                                                                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ================= PUESTOS ================= */}
          <TabsContent value="puestos" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">Puestos</h3>
                <p className="text-sm text-muted-foreground">
                  Define los puestos autorizados de la plantilla a partir de los cargos.
                </p>
              </div>
              {canManage && activeJobs.length > 0 && (
                <SiteCorpButton onClick={openCreatePositionDialog}>
                  <Plus className="mr-2 h-4 w-4" /> Nuevo puesto
                </SiteCorpButton>
              )}
            </div>

            {/* Sin cargos activos: requisito previo */}
            {activeJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <Briefcase className="mb-4 h-12 w-12 text-muted-foreground" />
                <h4 className="mb-1 text-base font-semibold text-ink">No hay cargos activos.</h4>
                <p className="mb-4 text-sm text-muted-foreground">
                  Primero debes crear al menos un cargo para poder crear puestos.
                </p>
                <SiteCorpButton variant="outline" onClick={() => setActiveTab("cargos")}>
                  <Briefcase className="mr-2 h-4 w-4" /> Ir a Cargos
                </SiteCorpButton>
              </div>
            ) : positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <Network className="mb-4 h-12 w-12 text-muted-foreground" />
                <h4 className="mb-1 text-base font-semibold text-ink">No hay puestos configurados todavía.</h4>
                <p className="mb-4 text-sm text-muted-foreground">
                  Crea los puestos autorizados a partir de los cargos de esta entidad.
                </p>
                {canManage && (
                  <SiteCorpButton onClick={openCreatePositionDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Crear primer puesto
                  </SiteCorpButton>
                )}
              </div>
            ) : (
              <>
                {/* Filtros y búsqueda */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <SiteCorpInput
                      value={positionSearch}
                      onChange={(e) => setPositionSearch(e.target.value)}
                      placeholder="Buscar por puesto, código, cargo o área..."
                      className="pl-9"
                    />
                  </div>
                  <SiteCorpSelect
                    value={areaFilter}
                    onValueChange={(value) => {
                      setAreaFilter(value)
                      setJobFilter("all")
                    }}
                  >
                    <SelectItem value="all">Todas las áreas</SelectItem>
                    {areas.filter(a => a.is_active).map(area => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name} ({area.code})
                      </SelectItem>
                    ))}
                  </SiteCorpSelect>
                  <SiteCorpSelect
                    value={jobFilter}
                    onValueChange={(value) => setJobFilter(value)}
                  >
                    <SelectItem value="all">Todos los cargos</SelectItem>
                    {jobFilterOptions.map(job => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.name}{!job.is_active ? " (inactivo)" : ""}
                      </SelectItem>
                    ))}
                  </SiteCorpSelect>
                  <SiteCorpSelect
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                  >
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Inactivos</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SiteCorpSelect>
                </div>

                {filteredPositions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                    <p className="text-sm text-muted-foreground">
                      No hay puestos que coincidan con la búsqueda o el filtro seleccionado.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredPositions.map(position => {
                      const salary = resolvePositionSalary(position)
                      return (
                        <div
                          key={position.id}
                          className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-sm font-medium text-ink">
                              {position.name}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                              {position.code}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Área: {position.job?.area?.name || "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Cargo: {position.job?.name || "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Grupo:{" "}
                              {position.job?.salary_group
                                ? toRomanNumeral(position.job.salary_group.sequence_number)
                                : "N/A"}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {salary ? (
                                `${salary.amount.toLocaleString("es-CU", {
                                  minimumFractionDigits: 2,
                                })} ${salary.currency_code}`
                              ) : (
                                <span className="italic">
                                  {applicableScaleId ? "Salario no configurado" : "Sin escala configurada"}
                                </span>
                              )}
                            </span>
                            <SiteCorpStatusBadge status={position.is_active ? "success" : "neutral"}>
                              {position.is_active ? "Activo" : "Inactivo"}
                            </SiteCorpStatusBadge>
                          </div>

                          {canManage && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditPositionDialog(position)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
                                aria-label="Editar puesto"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {position.is_active ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleActivePosition(position)}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-sitecorp-danger"
                                  aria-label="Desactivar puesto"
                                >
                                  <PowerOff className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleActivePosition(position)}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
                                  aria-label="Reactivar puesto"
                                >
                                  <Power className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </SiteCorpCard>

      {/* New / Edit Area Dialog */}
      <Dialog
        open={areaDialogOpen}
        onOpenChange={(open) => {
          setAreaDialogOpen(open)
          if (!open) {
            setEditingArea(null)
            setFormError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingArea ? "Editar área" : "Nueva área"}</DialogTitle>
            <DialogDescription>
              {editingArea
                ? "Modifica los datos del área."
                : "Crea una nueva área para esta entidad."}
            </DialogDescription>
          </DialogHeader>
          <AreaForm
            entityId={entityId!}
            areas={areas}
            editingArea={editingArea}
            onSuccess={handleAreaSave}
            onCancel={() => {
              setAreaDialogOpen(false)
              setEditingArea(null)
              setFormError(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* New / Edit Job Dialog */}
      <Dialog
        open={jobDialogOpen}
        onOpenChange={(open) => {
          setJobDialogOpen(open)
          if (!open) {
            setEditingJob(null)
            setFormError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Editar cargo" : "Nuevo cargo"}</DialogTitle>
            <DialogDescription>
              {editingJob
                ? "Modifica los datos del cargo."
                : "Crea un nuevo cargo para esta entidad."}
            </DialogDescription>
          </DialogHeader>
          <JobForm
            entityId={entityId!}
            editingJob={editingJob}
            onSuccess={handleJobSave}
            onCancel={() => {
              setJobDialogOpen(false)
              setEditingJob(null)
              setFormError(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* New / Edit Position Dialog */}
      <Dialog
        open={positionDialogOpen}
        onOpenChange={(open) => {
          setPositionDialogOpen(open)
          if (!open) {
            setEditingPosition(null)
            setFormError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPosition ? "Editar puesto" : "Nuevo puesto"}</DialogTitle>
            <DialogDescription>
              {editingPosition
                ? "Modifica los datos del puesto."
                : "Crea uno o varios puestos a partir de un cargo de esta entidad."}
            </DialogDescription>
          </DialogHeader>
          <PositionForm
            entityId={entityId!}
            jobs={positionJobOptions}
            applicableScaleId={applicableScaleId}
            salaryValuesByGroup={salaryValuesByGroup}
            editingPosition={editingPosition}
            onSuccess={handlePositionSave}
            onCancel={() => {
              setPositionDialogOpen(false)
              setEditingPosition(null)
              setFormError(null)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EntitySettingsStaffing