import * as React from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { MigratedWorkerDialog } from "@/components/migration/MigratedWorkerDialog"
import { LinkWorkerToPositionDialog } from "@/components/migration/LinkWorkerToPositionDialog"
import {
  ArrowLeft,
  Users,
  Network,
  Plus,
  Pencil,
  Search,
  Settings,
  UserCheck,
  Briefcase,
  Download,
  Loader2,
  UserPlus,
} from "lucide-react"
import { toRomanNumeral } from "@/utils/roman-numerals"
import {
  fetchStaffingExportRows,
  buildStaffingWorkbookBlob,
  saveStaffingExcelBlob,
} from "@/lib/staffing-export"
import {
  WorkerForm,
  type WorkerPositionOption,
  type WorkerEditingData,
} from "@/components/workers/WorkerForm"
import {
  resolveApplicableScaleId,
  fetchSalaryValuesForGroups,
  salaryForGroup,
  formatSalary,
} from "@/lib/salary"
import {
  fetchEntityScheduleSegments,
  type PositionScheduleSegment,
} from "@/lib/position-schedule"

interface OrganizationArea {
  id: string
  name: string
  code: string
  is_active: boolean
}

interface SalaryGroupRef {
  id: string
  salary_scale_id: string
  sequence_number: number
}

interface JobRef {
  id: string
  name: string
  code: string
  is_active: boolean
  area_id: string
  area: { id: string; name: string } | null
  salary_group: SalaryGroupRef | null
}

interface PositionRow {
  id: string
  name: string
  code: string
  is_active: boolean
  job_id: string
  authorized_quantity: number
  // Fase 11A.3: información laboral del puesto (solo lectura)
  work_location: string | null
  daily_hours: number | null
  weekly_hours: number | null
  monthly_hours: number | null
  break_minutes: number | null
  schedule_notes: string | null
  job: JobRef | null
}

interface WorkerRow {
  id: string
  code: string
  first_name: string
  first_surname: string
  second_surname: string | null
  identification: string
  hire_date: string
  employment_start_date?: string | null
  employment_status: string
  assignments: {
    id: string
    position_id: string
    start_date: string
    end_date: string | null
    is_current: boolean
    position: PositionRow | null
  }[] | null
}

interface SalaryValue {
  amount: number
  currency_code: string
}

type WorkerStatusFilter = "active" | "inactive" | "all"

const fullName = (w: WorkerRow) =>
  [w.first_name, w.first_surname, w.second_surname].filter(Boolean).join(" ")

const EntityStaffing = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()

  const [areas, setAreas] = React.useState<OrganizationArea[]>([])
  const [jobs, setJobs] = React.useState<JobRef[]>([])
  const [positions, setPositions] = React.useState<PositionRow[]>([])
  const [segmentsByPosition, setSegmentsByPosition] = React.useState<
    Record<string, PositionScheduleSegment[]>
  >({})
  const [workers, setWorkers] = React.useState<WorkerRow[]>([])
  const [applicableScaleId, setApplicableScaleId] = React.useState<string | null>(null)
  const [salaryValuesByGroup, setSalaryValuesByGroup] = React.useState<Record<string, SalaryValue | null>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [canManage, setCanManage] = React.useState(false)
  const [notice, setNotice] = React.useState<{ type: "success" | "danger" | "info"; message: string } | null>(null)
  const [entityName, setEntityName] = React.useState("")
  const [exporting, setExporting] = React.useState(false)

  const [workerSearch, setWorkerSearch] = React.useState("")
  const [areaFilter, setAreaFilter] = React.useState("all")
  const [jobFilter, setJobFilter] = React.useState("all")
  const [positionFilter, setPositionFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState<WorkerStatusFilter>("active")
  const [assignmentFilter, setAssignmentFilter] = React.useState("all")

  const [workerDialogOpen, setWorkerDialogOpen] = React.useState(false)
  const [migrationDialogOpen, setMigrationDialogOpen] = React.useState(false)
  const [linkWorkerId, setLinkWorkerId] = React.useState<string | null>(null)
  const [editingWorker, setEditingWorker] = React.useState<WorkerEditingData | null>(null)

  const queryClient = useQueryClient()

  const showNotice = (type: "success" | "danger" | "info", message: string) => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 5000)
  }

  const currentAssignment = (w: WorkerRow) =>
    (w.assignments || []).find(a => a.is_current && !a.end_date && a.position?.is_active) || null

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
        permission_code: "workers.view",
      })
      const { data: canViewManage } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "workers.manage",
      })
      if (!canView && !canViewManage) {
        setError("No tiene permiso para ver la plantilla operativa de esta entidad")
        return
      }
      setCanManage(!!canViewManage)

      const { data: entityData } = await supabase
        .from("organization_entities")
        .select("name")
        .eq("id", entityId)
        .maybeSingle()
      setEntityName((entityData as { name: string } | null)?.name || "")

      const { data: areasData, error: areasError } = await supabase
        .from("organization_areas")
        .select("id, name, code, is_active")
        .eq("organization_entity_id", entityId)
        .order("hierarchy_order")
      if (areasError) throw areasError
      setAreas((areasData as OrganizationArea[]) || [])

      const { data: jobsData, error: jobsError } = await supabase
              .from("organization_jobs")
              .select(`
                id, name, code, is_active, area_id,
                area:organization_areas(id, name),
                salary_group:salary_groups(id, salary_scale_id, sequence_number)
              `)
              .eq("organization_entity_id", entityId)
              .order("name")
            if (jobsError) throw jobsError
            const jobsRows = ((jobsData as any[])?.map((j: any) => ({
              ...j,
              area: j.area ? { id: j.area[0]?.id || null, name: j.area[0]?.name || null } : null,
            })) as unknown as JobRef[]) || []
            setJobs(jobsRows)

      const { data: positionsData, error: positionsError } = await supabase
                    .from("organization_positions")
                    .select(`
                      id, name, code, is_active, job_id, authorized_quantity,
                      work_location, daily_hours, weekly_hours, monthly_hours, break_minutes, schedule_notes,
                      job:organization_jobs(
                        id, name, code, is_active, area_id,
                        area:organization_areas(id, name),
                        salary_group:salary_groups(id, salary_scale_id, sequence_number)
                      )
                    `)
                    .eq("organization_entity_id", entityId)
                    .order("name")
                  if (positionsError) throw positionsError
                  const positionsRows = ((positionsData as any[])?.map((p: any) => ({
                    ...p,
                    job: p.job
                      ? {
                          ...p.job,
                          area: p.job.area
                            ? { id: p.job.area[0]?.id || null, name: p.job.area[0]?.name || null }
                            : null,
                        }
                      : null,
                  })) as unknown as PositionRow[]) || []
                  setPositions(positionsRows)

                  // Fase 11A.3: horarios habituales de los puestos (solo lectura)
                  setSegmentsByPosition(await fetchEntityScheduleSegments(entityId))

      const { data: workersData, error: workersError } = await supabase
        .from("workers")
        .select(`
          *,
          assignments:worker_position_assignments(
            id, position_id, start_date, end_date, is_current,
            position:organization_positions(
              id, name, code, is_active, job_id,
              job:organization_jobs(
                id, name, code, is_active, area_id,
                area:organization_areas(id, name),
                salary_group:salary_groups(id, salary_scale_id, sequence_number)
              )
            )
          )
        `)
        .eq("organization_entity_id", entityId)
        .order("created_at", { ascending: false })
      if (workersError) throw workersError
      setWorkers((workersData as WorkerRow[]) || [])

      // Escala aplicable (PRESUPUESTADA global / EMPRESARIAL de la entidad)
      setApplicableScaleId(await resolveApplicableScaleId(entityId))

      const groupIds = jobsRows
        .map(j => j.salary_group?.id)
        .filter((id): id is string => !!id)
      setSalaryValuesByGroup(await fetchSalaryValuesForGroups(groupIds))
    } catch (err) {
      console.error("Error loading plantilla operativa:", err)
      setError(err instanceof Error ? err.message : "Error al cargar la plantilla operativa")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // ---------- Derivaciones ----------

  const activeWorkers = React.useMemo(
    () => workers.filter(w => w.employment_status === "active"),
    [workers]
  )

  // Ocupación: asignación actual con trabajador activo
  const occupiedPositionIds = React.useMemo(() => {
    const ids = new Set<string>()
    activeWorkers.forEach(w => {
      const a = currentAssignment(w)
      if (a) ids.add(a.position_id)
    })
    return ids
  }, [activeWorkers])

  const activePositions = React.useMemo(
    () => positions.filter(p => p.is_active),
    [positions]
  )

  // Cantidad total de plazas autorizadas (SUM de authorized_quantity)
  const totalAuthorized = React.useMemo(
    () => activePositions.reduce((sum, p) => sum + (p.authorized_quantity || 0), 0),
    [activePositions]
  )

  // Conteo de asignaciones activas por puesto (para calcular vacantes reales)
    const assignmentsPerPosition = React.useMemo(() => {
      const counts = new Map<string, number>()
      activeWorkers.forEach(w => {
        const a = currentAssignment(w)
        if (a) {
          counts.set(a.position_id, (counts.get(a.position_id) || 0) + 1)
        }
      })
      return counts
    }, [activeWorkers])
  
    const pendingWorkers = React.useMemo(
      () => activeWorkers.filter((worker) => currentAssignment(worker) === null),
      [activeWorkers]
    )
  
    // Número de trabajadores con asignación activa
  const occupiedCount = React.useMemo(
    () => activeWorkers.filter(w => currentAssignment(w) !== null).length,
    [activeWorkers]
  )

  const kpis = React.useMemo(() => {
    return {
      activeWorkers: activeWorkers.length,
      activePositions: activePositions.length,
      totalAuthorized,
      occupied: occupiedCount,
      vacant: totalAuthorized - occupiedCount,
    }
  }, [activePositions, totalAuthorized, occupiedCount, activeWorkers])

  const isOccupied = (positionId: string) => occupiedPositionIds.has(positionId)

  // Salario de referencia: Grupo → escala aplicable → valor vigente
  const salaryForPosition = React.useCallback(
    (position: PositionRow | null): SalaryValue | null =>
      salaryForGroup(applicableScaleId, position?.job?.salary_group, salaryValuesByGroup),
    [applicableScaleId, salaryValuesByGroup]
  )

  const positionOptions: WorkerPositionOption[] = React.useMemo(
        () =>
          positions.map(p => ({
            id: p.id,
            name: p.name,
            code: p.code,
            is_active: p.is_active,
            occupied: isOccupied(p.id),
            authorized_quantity: p.authorized_quantity,
            currentAssignments: assignmentsPerPosition.get(p.id) || 0,
            work_location: p.work_location,
            daily_hours: p.daily_hours,
            weekly_hours: p.weekly_hours,
            monthly_hours: p.monthly_hours,
            break_minutes: p.break_minutes,
            schedule_notes: p.schedule_notes,
            schedule_segments: segmentsByPosition[p.id] || [],
            job: p.job
              ? {
                  id: p.job.id,
                  name: p.job.name,
                  area: p.job.area ? { id: p.job.area.id, name: p.job.area.name } : null,
                  salary_group: p.job.salary_group
                    ? {
                        id: p.job.salary_group.id,
                        salary_scale_id: p.job.salary_group.salary_scale_id,
                        sequence_number: p.job.salary_group.sequence_number,
                      }
                    : null,
                }
              : null,
          })),
        [positions, occupiedPositionIds, assignmentsPerPosition, segmentsByPosition]
      )

  // ---------- Filtros en cascada ----------

  const jobFilterOptions = React.useMemo(() => {
    if (areaFilter !== "all") return jobs.filter(j => j.area_id === areaFilter)
    return jobs
  }, [jobs, areaFilter])

  const positionFilterOptions = React.useMemo(() => {
    let list = positions
    if (jobFilter !== "all") list = list.filter(p => p.job_id === jobFilter)
    else if (areaFilter !== "all") list = list.filter(p => p.job?.area_id === areaFilter)
    return list
  }, [positions, jobFilter, areaFilter])

  const filteredWorkers = React.useMemo(() => {
    const search = workerSearch.trim().toLowerCase()
    let list = workers

    if (assignmentFilter === "linked") list = list.filter((worker) => currentAssignment(worker) !== null)
    else if (assignmentFilter === "pending") list = list.filter((worker) => worker.employment_status === "active" && currentAssignment(worker) === null)

    const aFilter = areaFilter !== "all" ? areaFilter : null
    const jFilter = jobFilter !== "all" ? jobFilter : null
    const pFilter = positionFilter !== "all" ? positionFilter : null

    if (statusFilter === "active") list = list.filter(w => w.employment_status === "active")
    else if (statusFilter === "inactive") list = list.filter(w => w.employment_status !== "active")

    list = list.filter(w => {
      const a = currentAssignment(w)
      const position = a?.position || null
      if (aFilter && position?.job?.area_id !== aFilter) return false
      if (jFilter && position?.job_id !== jFilter) return false
      if (pFilter && position?.id !== pFilter) return false
      if (search) {
        const haystack = [
          w.first_name,
          w.first_surname,
          w.second_surname,
          w.identification,
          w.code,
          position?.name,
          position?.job?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })

    return list.sort((a, b) =>
      fullName(a).localeCompare(fullName(b))
    )
  }, [workers, workerSearch, areaFilter, jobFilter, positionFilter, statusFilter, assignmentFilter])

  // ---------- Handlers ----------

  const openCreateWorkerDialog = () => {
    setEditingWorker(null)
    setWorkerDialogOpen(true)
  }

  const openEditWorkerDialog = (w: WorkerRow) => {
    setEditingWorker({
      id: w.id,
      code: w.code,
      first_name: w.first_name,
      first_surname: w.first_surname,
      second_surname: w.second_surname,
      identification: w.identification,
      birth_date: (w as any).birth_date || null,
      gender_id: (w as any).gender_id || null,
      marital_status_id: (w as any).marital_status_id || null,
      education_level_id: (w as any).education_level_id || null,
      specialty: (w as any).specialty || null,
      profession_or_trade: (w as any).profession_or_trade || null,
      skin_color_id: (w as any).skin_color_id || null,
      address: (w as any).address || null,
      province: (w as any).province || null,
      municipality: (w as any).municipality || null,
      phone: (w as any).phone || null,
      email: (w as any).email || null,
      hire_date: w.hire_date,
      employment_status: w.employment_status,
    })
    setWorkerDialogOpen(true)
  }

  const handleWorkerSaved = async (createdNew: boolean) => {
    await loadData()
    setWorkerDialogOpen(false)
    setEditingWorker(null)
    showNotice("success", createdNew ? "Trabajador creado correctamente" : "Trabajador actualizado correctamente")
  }

  const handleDownloadExcel = async () => {
    if (!entityId || exporting) return
    setExporting(true)
    try {
      const rows = await fetchStaffingExportRows(entityId)
      if (rows.length === 0) {
        showNotice("info", "Esta entidad todavía no tiene puestos configurados en su plantilla.")
        return
      }
      const blob = await buildStaffingWorkbookBlob(rows)
      saveStaffingExcelBlob(blob, entityName)
    } catch (err) {
      console.error("Error generating staffing Excel:", err)
      showNotice("danger", "No se pudo generar la plantilla. Inténtalo nuevamente.")
    } finally {
      setExporting(false)
    }
  }

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Plantilla"
          description="Cargando plantilla operativa..."
        />
        <SiteCorpLoading rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Plantilla"
          description="Gestiona los trabajadores y la ocupación actual de los puestos de la entidad."
        />
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
        <div className="flex justify-end">
          <SiteCorpButton variant="outline" onClick={() => navigate(`/entity/${entityId}/summary`)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </SiteCorpButton>
        </div>
      </div>
    )
  }

  const vacantCount = kpis.vacant
  
    const kpiCards = [
      { label: "Trabajadores activos", value: kpis.activeWorkers, icon: Users, accent: "text-sitecorp-primary" },
      { label: "Plazas autorizadas", value: kpis.totalAuthorized, icon: Network, accent: "text-sitecorp-primary" },
      { label: "Ocupados", value: kpis.occupied, icon: UserCheck, accent: "text-emerald-600" },
      { label: "Vacantes", value: kpis.vacant, icon: Briefcase, accent: "text-amber-600" },
    ]

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Plantilla"
        description="Gestiona los trabajadores y la ocupación actual de los puestos de la entidad."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SiteCorpButton
              variant="outline"
              onClick={handleDownloadExcel}
              disabled={exporting}
              title="Descargar la plantilla completa en Excel"
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exporting ? "Generando Excel..." : "Descargar Excel"}
            </SiteCorpButton>
            {canManage && (
              <SiteCorpButton variant="outline" onClick={() => setMigrationDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Migrar trabajador
              </SiteCorpButton>
            )}
            {canManage && activePositions.length > 0 && (
              <SiteCorpButton onClick={openCreateWorkerDialog} disabled={vacantCount === 0}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo trabajador
              </SiteCorpButton>
            )}
          </div>
        }
      />

      {notice && <SiteCorpAlert type={notice.type}>{notice.message}</SiteCorpAlert>}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map(kpi => (
          <SiteCorpCard key={kpi.label}>
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-muted", kpi.accent)}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-ink">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          </SiteCorpCard>
        ))}
      </div>

      {/* Si no hay puestos aún, sigue siendo posible revisar y migrar trabajadores. */}
      {activePositions.length === 0 ? (
        <SiteCorpCard>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
            <Network className="mb-4 h-12 w-12 text-muted-foreground" />
            <h4 className="mb-1 text-base font-semibold text-ink">Todavía no hay puestos configurados.</h4>
            <p className="mb-4 text-sm text-muted-foreground">Los trabajadores migrados sin puesto quedarán pendientes de vinculación.</p>
            <div className="flex gap-2">
              {canManage && <SiteCorpButton onClick={() => setMigrationDialogOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Migrar trabajador</SiteCorpButton>}
              <SiteCorpButton variant="outline" onClick={() => navigate(`/entity/${entityId}/settings/staffing`)}><Settings className="mr-2 h-4 w-4" />Configurar plantilla</SiteCorpButton>
            </div>
          </div>
          {pendingWorkers.length > 0 && <div className="mt-5 space-y-2">{pendingWorkers.map((worker) => <div key={worker.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><Link to={`/entity/${entityId}/staffing/workers/${worker.id}`} className="font-medium text-sitecorp-primary">{fullName(worker)}</Link><Badge variant="outline">Pendiente de vinculación</Badge></div>)}</div>}
        </SiteCorpCard>
      ) : (
        <SiteCorpCard>
          <Tabs defaultValue="workers" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="workers">
                <Users className="mr-2 h-4 w-4" /> Trabajadores
              </TabsTrigger>
              <TabsTrigger value="estructura">
                <Network className="mr-2 h-4 w-4" /> Estructura de plantilla
              </TabsTrigger>
            </TabsList>

            {/* ============ TRABAJADORES ============ */}
            <TabsContent value="workers" className="space-y-4">
              {canManage && vacantCount === 0 && (
                <SiteCorpAlert type="info" title="Sin puestos vacantes">
                  No hay puestos vacantes disponibles. Configura un puesto antes de añadir un trabajador.{" "}
                  <button
                    type="button"
                    onClick={() => navigate(`/entity/${entityId}/settings/staffing`)}
                    className="font-medium underline underline-offset-2"
                  >
                    Ir a Configuración de plantilla
                  </button>
                </SiteCorpAlert>
              )}

              {/* Búsqueda + filtros en cascada */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <SiteCorpInput
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                    placeholder="Buscar por nombre, CI, código, puesto o cargo..."
                    className="pl-9"
                  />
                </div>
                <SiteCorpSelect
                  value={areaFilter}
                  onValueChange={(v) => {
                    setAreaFilter(v)
                    setJobFilter("all")
                    setPositionFilter("all")
                  }}
                >
                  <SelectItem value="all">Todas las áreas</SelectItem>
                  {areas.filter(a => a.is_active).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
                <SiteCorpSelect
                  value={jobFilter}
                  onValueChange={(v) => {
                    setJobFilter(v)
                    setPositionFilter("all")
                  }}
                >
                  <SelectItem value="all">Todos los cargos</SelectItem>
                  {jobFilterOptions.map(j => (
                    <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
                <SiteCorpSelect
                  value={positionFilter}
                  onValueChange={setPositionFilter}
                >
                  <SelectItem value="all">Todos los puestos</SelectItem>
                  {positionFilterOptions.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SiteCorpSelect>
                <SiteCorpSelect
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as WorkerStatusFilter)}
                >
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SiteCorpSelect>
                <SiteCorpSelect value={assignmentFilter} onValueChange={setAssignmentFilter}>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="linked">Vinculados</SelectItem>
                  <SelectItem value="pending">Pendientes de vinculación</SelectItem>
                </SiteCorpSelect>
              </div>

              {filteredWorkers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                  <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h4 className="mb-1 text-base font-semibold text-ink">
                    {workers.length === 0 ? "No hay trabajadores en la plantilla." : "Sin resultados"}
                  </h4>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {workers.length === 0
                      ? "Añade trabajadores para ocupar los puestos configurados."
                      : "Ningún trabajador coincide con la búsqueda o los filtros."}
                  </p>
                  {canManage && workers.length === 0 && vacantCount > 0 && (
                    <SiteCorpButton onClick={openCreateWorkerDialog}>
                      <Plus className="mr-2 h-4 w-4" /> Añadir primer trabajador
                    </SiteCorpButton>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredWorkers.map(w => {
                    const assignment = currentAssignment(w)
                    const position = assignment?.position || null
                    const job = position?.job || null
                    const group = job?.salary_group || null
                    const salary = salaryForPosition(position)
                    return (
                      <div
                        key={w.id}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                          <Link
                            to={`/entity/${entityId}/staffing/workers/${w.id}`}
                            className="text-sm font-medium text-ink underline-offset-2 hover:text-sitecorp-primary hover:underline"
                          >
                            {fullName(w)}
                          </Link>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {w.code}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            CI: {w.identification}
                          </span>
                          {job?.area && (
                            <span className="text-xs text-muted-foreground">Área: {job.area.name}</span>
                          )}
                          {job && (
                            <span className="text-xs text-muted-foreground">Cargo: {job.name}</span>
                          )}
                          {position && (
                            <span className="text-xs text-muted-foreground">Puesto: {position.name}</span>
                          )}
                          {group && (
                            <span className="text-xs text-muted-foreground">
                              Grupo: {toRomanNumeral(group.sequence_number)}
                            </span>
                          )}
                          <span className="text-sm text-muted-foreground">
                            {salary ? (
                              formatSalary(salary)
                            ) : (
                              <span className="italic">Salario no configurado</span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Alta: {w.employment_start_date || w.hire_date}
                          </span>
                          <SiteCorpStatusBadge status={w.employment_status === "active" ? "success" : "neutral"}>
                            {w.employment_status === "active" ? "Activo" : "Inactivo"}
                          </SiteCorpStatusBadge>
                                          {w.employment_status === "active" && (!assignment || !position) && (
                            <Badge variant="outline" className="border-amber-500 text-amber-800">Pendiente de vinculación</Badge>
                          )}
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-1">
                            {w.employment_status === "active" && (!assignment || !position) && (
                              <SiteCorpButton variant="outline" size="sm" onClick={() => setLinkWorkerId(w.id)}>Vincular a plantilla</SiteCorpButton>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditWorkerDialog(w)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
                              aria-label="Editar trabajador"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            {/* ============ ESTRUCTURA ============ */}
            <TabsContent value="estructura" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Área → Cargo → Puesto, con su ocupante actual. La estructura se configura en
                {" "}
                <button
                  type="button"
                  onClick={() => navigate(`/entity/${entityId}/settings/staffing`)}
                  className="font-medium text-sitecorp-primary underline underline-offset-2"
                >
                  Ajustes → Configuración de plantilla
                </button>
                .
              </p>

              <div className="space-y-4">
                {areas.filter(a => a.is_active).map(area => {
                  const areaJobs = jobs.filter(j => j.is_active && j.area_id === area.id)
                  if (areaJobs.length === 0) return null

                  return (
                    <div key={area.id} className="space-y-2">
                      <h4 className="text-sm font-semibold text-ink">
                        {area.name} ({area.code})
                      </h4>
                      {areaJobs.map(job => {
                                              const jobPositions = activePositions.filter(p => p.job_id === job.id)
                                              if (jobPositions.length === 0) return null
                      
                                              // Suma de autorizados y ocupados para la cabecera del Cargo
                                              const jobAuthorized = jobPositions.reduce((s, p) => s + (p.authorized_quantity || 0), 0)
                                              const jobOccupied = jobPositions.reduce((s, p) => s + (assignmentsPerPosition.get(p.id) || 0), 0)
                      
                                              return (
                                                <div key={job.id} className="rounded-xl border border-border bg-white p-4">
                                                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                    <span className="text-sm font-medium text-ink">{job.name}</span>
                                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                                      {job.code}
                                                    </span>
                                                    {job.salary_group && (
                                                      <span className="text-xs text-muted-foreground">
                                                        Grupo: {toRomanNumeral(job.salary_group.sequence_number)}
                                                      </span>
                                                    )}
                                                    <span className="text-xs text-muted-foreground">
                                                      {jobOccupied}/{jobAuthorized} ocupados
                                                    </span>
                                                  </div>
                            <div className="space-y-1.5">
                              {jobPositions.map(position => {
                                                              const positionOccupied = assignmentsPerPosition.get(position.id) || 0
                                                              const positionAuthorized = position.authorized_quantity || 0
                                                              const positionVacant = positionAuthorized - positionOccupied
                                                              const positionWorkers = activeWorkers.filter(w => currentAssignment(w)?.position_id === position.id)
                                                              const salary = salaryForPosition(position)
                              
                                                              let statusLabel: string
                                                              let statusVariant: "success" | "warning" | "neutral"
                                                              if (positionOccupied === 0) {
                                                                statusLabel = "VACÍO"
                                                                statusVariant = "warning"
                                                              } else if (positionOccupied < positionAuthorized) {
                                                                statusLabel = "CON VACANTES"
                                                                statusVariant = "success"
                                                              } else {
                                                                statusLabel = "COMPLETO"
                                                                statusVariant = "neutral"
                                                              }
                              
                                                              return (
                                                                <div
                                                                  key={position.id}
                                                                  className="rounded-lg bg-muted/30 px-3 py-2"
                                                                >
                                                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                                    <span className="text-sm text-ink">{position.name}</span>
                                                                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                                                      {position.code}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">
                                                                      {positionOccupied}/{positionAuthorized} ocupados
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">
                                                                      {positionVacant} vacantes
                                                                    </span>
                                                                    <SiteCorpStatusBadge status={statusVariant}>{statusLabel}</SiteCorpStatusBadge>
                                                                    <span className="ml-auto text-xs text-muted-foreground">
                                                                      {salary ? (
                                                                        formatSalary(salary)
                                                                      ) : (
                                                                        <span className="italic">Salario no configurado</span>
                                                                      )}
                                                                    </span>
                                                                  </div>
                                                                  {positionWorkers.length > 0 && (
                                                                    <div className="mt-2 space-y-1 border-t border-border pt-2">
                                                                      <p className="text-xs font-medium text-muted-foreground">Trabajadores asignados:</p>
                                                                      {positionWorkers.map(w => (
                                                                        <Link
                                                                          key={w.id}
                                                                          to={`/entity/${entityId}/staffing/workers/${w.id}`}
                                                                          className="block text-sm text-sitecorp-primary underline-offset-2 hover:underline"
                                                                        >
                                                                          {fullName(w)}
                                                                        </Link>
                                                                      ))}
                                                                    </div>
                                                                  )}
                                                                </div>
                                                              )
                                                            })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>
        </SiteCorpCard>
      )}

      <Dialog open={migrationDialogOpen} onOpenChange={setMigrationDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>Migrar trabajador</DialogTitle><DialogDescription>Crea un Worker histórico directamente. Queda sin puesto y sin documentos; podrá vincularlo a la plantilla después.</DialogDescription></DialogHeader>
          <MigratedWorkerDialog
            onCancel={() => setMigrationDialogOpen(false)}
            onSuccess={async () => {
              await loadData()
              queryClient.invalidateQueries()
              setMigrationDialogOpen(false)
              setAssignmentFilter("pending")
              showNotice("success", "Trabajador creado correctamente.")
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkWorkerId} onOpenChange={(open) => { if (!open) setLinkWorkerId(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Vincular a plantilla</DialogTitle><DialogDescription>La fecha histórica de incorporación no cambia. Esta acción crea únicamente un Assignment.</DialogDescription></DialogHeader>
          {linkWorkerId && <LinkWorkerToPositionDialog
            workerId={linkWorkerId}
            positions={positionOptions}
            onCancel={() => setLinkWorkerId(null)}
            onSuccess={async () => { await loadData(); setLinkWorkerId(null); showNotice("success", "Trabajador vinculado a la plantilla. Fecha de incorporación preservada.") }}
          />}
        </DialogContent>
      </Dialog>

      {/* Nuevo / Editar Trabajador */}
      <Dialog
        open={workerDialogOpen}
        onOpenChange={(open) => {
          setWorkerDialogOpen(open)
          if (!open) setEditingWorker(null)
        }}
      >
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWorker ? "Editar trabajador" : "Nuevo trabajador"}</DialogTitle>
            <DialogDescription>
              {editingWorker
                ? "Modifica los datos personales y laborales del trabajador."
                : "Crea un trabajador y ocupe un puesto vacante de esta entidad."}
            </DialogDescription>
          </DialogHeader>
          <WorkerForm
            entityId={entityId!}
            positions={positionOptions}
            applicableScaleId={applicableScaleId}
            salaryValuesByGroup={salaryValuesByGroup}
            editingWorker={editingWorker}
            onSuccess={() => handleWorkerSaved(!editingWorker)}
            onCancel={() => {
              setWorkerDialogOpen(false)
              setEditingWorker(null)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EntityStaffing
