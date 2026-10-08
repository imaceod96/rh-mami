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
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { MigratedWorkerDialog } from "@/components/migration/MigratedWorkerDialog"
import { LinkWorkerToPositionDialog } from "@/components/migration/LinkWorkerToPositionDialog"
import { FilterBuilder } from "@/components/filters/filter-builder"
import { useEntityFilters, type EntityFilterDefinition } from "@/lib/entity-filters"
import {
  ArrowLeft,
  Users,
  Network,
  Plus,
  Pencil,
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
  type StaffingExportRow,
} from "@/lib/staffing-export"
import {
  WorkerForm,
  type WorkerPositionOption,
  type WorkerEditingData,
} from "@/components/workers/WorkerForm"
import {
  resolveApplicableScaleId,
  fetchSalaryValuesForGroups,
  type SalaryValue,
} from "@/lib/salary"
import {
  fetchEntityScheduleSegments,
  type PositionScheduleSegment,
} from "@/lib/position-schedule"

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
  // Campos personales opcionales (la consulta usa `*`; no están en el resumen de plantilla)
  birth_date?: string | null
  gender_id?: string | null
  marital_status_id?: string | null
  education_level_id?: string | null
  specialty?: string | null
  has_masters_degree?: boolean | null
  has_doctorate_degree?: boolean | null
  profession_or_trade?: string | null
  skin_color_id?: string | null
  address?: string | null
  province?: string | null
  municipality?: string | null
  phone?: string | null
  email?: string | null
  assignments: {
    id: string
    position_id: string
    start_date: string
    end_date: string | null
    is_current: boolean
    position: PositionRow | null
  }[] | null
}

const fullName = (w: WorkerRow) =>
  [w.first_name, w.first_surname, w.second_surname].filter(Boolean).join(" ")

const formatAmount = (value: number | null): string =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const groupLabel = (sequence: number | null): string => {
  if (sequence === null || sequence === undefined) return "—"
  try {
    return toRomanNumeral(sequence)
  } catch {
    return String(sequence)
  }
}

const uniqueOptions = (
  rows: StaffingExportRow[],
  pick: (row: StaffingExportRow) => string | null,
  label: (value: string) => string = (value) => value
): { value: string; label: string }[] => {
  const map = new Map<string, string>()
  rows.forEach((row) => {
    const raw = pick(row)
    if (raw === null || raw === undefined || raw === "") return
    map.set(raw, label(raw))
  })
  return Array.from(map, ([value, lbl]) => ({ value, label: lbl })).sort((a, b) =>
    a.label.localeCompare(b.label)
  )
}

/**
 * PLANTILLA — vista estructural de personal (coherente con el Anexo 14).
 *
 * Fuente de verdad: `entity_staffing_export` (la MISMA RPC que genera el Excel).
 * Cada fila es una CAPACIDAD del Puesto: si tiene trabajador está Ocupada; si no,
 * es una VACANTE. La vista agrupa por Área → Cargo/Puesto y muestra, por puesto,
 * Autorizados / Ocupados / Vacantes.
 *
 * NO es el directorio de personas: eso vive en Personas → Trabajadores.
 */
const EntityStaffing = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()

  const [positions, setPositions] = React.useState<PositionRow[]>([])
  const [segmentsByPosition, setSegmentsByPosition] = React.useState<
    Record<string, PositionScheduleSegment[]>
  >({})
  const [workers, setWorkers] = React.useState<WorkerRow[]>([])
  const [exportRows, setExportRows] = React.useState<StaffingExportRow[]>([])
  const [applicableScaleId, setApplicableScaleId] = React.useState<string | null>(null)
  const [salaryValuesByGroup, setSalaryValuesByGroup] = React.useState<Record<string, SalaryValue | null>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [canManage, setCanManage] = React.useState(false)
  const [notice, setNotice] = React.useState<{ type: "success" | "danger" | "info"; message: string } | null>(null)
  const [entityName, setEntityName] = React.useState("")
  const [exporting, setExporting] = React.useState(false)

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

      // Estructura de plantilla (misma fuente que el Anexo 14).
      setExportRows(await fetchStaffingExportRows(entityId))

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

  // ---------- Derivaciones (KPIs + diálogos) ----------

  const activeWorkers = React.useMemo(
    () => workers.filter(w => w.employment_status === "active"),
    [workers]
  )

  const activePositions = React.useMemo(
    () => positions.filter(p => p.is_active),
    [positions]
  )

  const assignmentsPerPosition = React.useMemo(() => {
    const counts = new Map<string, number>()
    activeWorkers.forEach(w => {
      const a = currentAssignment(w)
      if (a) counts.set(a.position_id, (counts.get(a.position_id) || 0) + 1)
    })
    return counts
  }, [activeWorkers])

  const pendingWorkers = React.useMemo(
    () => activeWorkers.filter((worker) => currentAssignment(worker) === null),
    [activeWorkers]
  )

  const occupiedCount = React.useMemo(
    () => activeWorkers.filter(w => currentAssignment(w) !== null).length,
    [activeWorkers]
  )

  const totalAuthorized = React.useMemo(
    () => activePositions.reduce((sum, p) => sum + (p.authorized_quantity || 0), 0),
    [activePositions]
  )

  const kpis = React.useMemo(
    () => ({
      activeWorkers: activeWorkers.length,
      activePositions: activePositions.length,
      totalAuthorized,
      occupied: occupiedCount,
      vacant: Math.max(0, totalAuthorized - occupiedCount),
    }),
    [activePositions.length, totalAuthorized, occupiedCount, activeWorkers.length]
  )

  const positionOptions: WorkerPositionOption[] = React.useMemo(
    () =>
      positions.map(p => ({
        id: p.id,
        name: p.name,
        code: p.code,
        is_active: p.is_active,
        occupied: (assignmentsPerPosition.get(p.id) || 0) > 0,
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
    [positions, assignmentsPerPosition, segmentsByPosition]
  )

  // ---------- Filtros de Plantilla (criterios del módulo) ----------

  const filterDefinitions = React.useMemo<EntityFilterDefinition[]>(
    () => [
      {
        key: "area",
        label: "Área",
        type: "select",
        options: uniqueOptions(exportRows, r => r.area_name),
        getValue: r => r.area_name,
      },
      {
        key: "job",
        label: "Cargo",
        type: "select",
        options: uniqueOptions(exportRows, r => r.job_name),
        getValue: r => r.job_name,
      },
      {
        key: "position",
        label: "Puesto",
        type: "select",
        options: uniqueOptions(exportRows, r => r.position_name),
        getValue: r => r.position_name,
      },
      {
        key: "category",
        label: "Categoría ocupacional",
        type: "select",
        options: uniqueOptions(exportRows, r => r.occupational_category),
        getValue: r => r.occupational_category,
      },
      {
        key: "preparation",
        label: "Nivel de preparación",
        type: "select",
        options: uniqueOptions(exportRows, r => r.preparation_level),
        getValue: r => r.preparation_level,
      },
      {
        key: "group",
        label: "Grupo escala",
        type: "select",
        options: uniqueOptions(
          exportRows,
          r => (r.salary_group_sequence === null ? null : String(r.salary_group_sequence)),
          value => groupLabel(Number(value))
        ),
        getValue: r => (r.salary_group_sequence === null ? null : String(r.salary_group_sequence)),
      },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: [
          { value: "Ocupado", label: "Ocupado" },
          { value: "Vacante", label: "Vacante" },
        ],
        getValue: r => (r.worker_id ? "Ocupado" : "Vacante"),
      },
      {
        key: "gender",
        label: "Sexo",
        type: "select",
        options: [
          { value: "M", label: "M" },
          { value: "F", label: "F" },
        ],
        getValue: r => r.gender_code,
      },
      {
        key: "masters",
        label: "Máster",
        type: "boolean",
        getValue: r => r.has_masters_degree,
      },
      {
        key: "doctorate",
        label: "Doctorado",
        type: "boolean",
        getValue: r => r.has_doctorate_degree,
      },
    ],
    [exportRows]
  )

  const filters = useEntityFilters(exportRows, filterDefinitions)
  const visibleRows = filters.result

  // Recuentos ESTRUCTURALES por puesto (sobre TODAS las capacidades, no las
  // filtradas): Autorizados = filas de capacidad; Ocupados = con trabajador.
  const structuralByPosition = React.useMemo(() => {
    const map = new Map<string, { authorized: number; occupied: number }>()
    exportRows.forEach(row => {
      if (!row.position_id) return
      const entry = map.get(row.position_id) ?? { authorized: 0, occupied: 0 }
      entry.authorized += 1
      if (row.worker_id) entry.occupied += 1
      map.set(row.position_id, entry)
    })
    return map
  }, [exportRows])

  // Agrupación Área → Puesto respetando el orden organizativo del backend.
  const groupedRows = React.useMemo(() => {
    const areasMap = new Map<
      string,
      {
        areaKey: string
        areaName: string
        positions: Map<
          string,
          { positionId: string; jobName: string | null; positionName: string | null; salary: number | null; group: number | null; rows: StaffingExportRow[] }
        >
      }
    >()
    visibleRows.forEach(row => {
      const areaKey = row.area_id || row.area_name || "sin-area"
      let area = areasMap.get(areaKey)
      if (!area) {
        area = { areaKey, areaName: row.area_name || "SIN ÁREA ASIGNADA", positions: new Map() }
        areasMap.set(areaKey, area)
      }
      const posKey = row.position_id || row.position_name || "sin-puesto"
      let position = area.positions.get(posKey)
      if (!position) {
        position = {
          positionId: posKey,
          jobName: row.job_name,
          positionName: row.position_name,
          salary: row.salary,
          group: row.salary_group_sequence,
          rows: [],
        }
        area.positions.set(posKey, position)
      }
      position.rows.push(row)
    })
    return Array.from(areasMap.values()).map(area => ({
      ...area,
      positions: Array.from(area.positions.values()),
    }))
  }, [visibleRows])

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
      birth_date: w.birth_date || null,
      gender_id: w.gender_id || null,
      marital_status_id: w.marital_status_id || null,
      education_level_id: w.education_level_id || null,
      specialty: w.specialty || null,
      has_masters_degree: !!w.has_masters_degree,
      has_doctorate_degree: !!w.has_doctorate_degree,
      profession_or_trade: w.profession_or_trade || null,
      skin_color_id: w.skin_color_id || null,
      address: w.address || null,
      province: w.province || null,
      municipality: w.municipality || null,
      phone: w.phone || null,
      email: w.email || null,
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
      const rows = exportRows.length > 0 ? exportRows : await fetchStaffingExportRows(entityId)
      if (rows.length === 0) {
        showNotice("info", "Esta entidad todavía no tiene puestos configurados en su plantilla.")
        return
      }
      const blob = await buildStaffingWorkbookBlob(rows, {
        entityName,
        generatedAt: new Date(),
      })
      saveStaffingExcelBlob(blob, entityName)
    } catch (err) {
      console.error("Error generating Anexo 14:", err)
      showNotice("danger", "No se pudo generar el Anexo 14. Inténtalo nuevamente.")
    } finally {
      setExporting(false)
    }
  }

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Plantilla" description="Cargando plantilla operativa..." />
        <SiteCorpLoading rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Plantilla"
          description="Estructura organizativa, capacidad, ocupación y vacantes."
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

  const kpiCards = [
    { label: "Trabajadores activos", value: kpis.activeWorkers, icon: Users, accent: "text-sitecorp-primary" },
    { label: "Plazas autorizadas", value: kpis.totalAuthorized, icon: Network, accent: "text-sitecorp-primary" },
    { label: "Ocupados", value: kpis.occupied, icon: UserCheck, accent: "text-sitecorp-success" },
    { label: "Vacantes", value: kpis.vacant, icon: Briefcase, accent: "text-sitecorp-warning" },
  ]

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Plantilla"
        description="Estructura organizativa de la entidad: Área → Cargo/Puesto → capacidad autorizada, ocupación y vacantes. Es la misma estructura del Anexo 14."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SiteCorpButton
              variant="outline"
              onClick={handleDownloadExcel}
              disabled={exporting}
              title="Descargar el Anexo 14: registro de trabajadores de la plantilla"
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {exporting ? "Generando Anexo 14..." : "Descargar Anexo 14"}
            </SiteCorpButton>
            {canManage && (
              <SiteCorpButton variant="outline" onClick={() => setMigrationDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Migrar trabajador
              </SiteCorpButton>
            )}
            {canManage && activePositions.length > 0 && (
              <SiteCorpButton onClick={openCreateWorkerDialog} disabled={kpis.vacant === 0}>
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

      {activePositions.length === 0 ? (
        <SiteCorpCard>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
            <Network className="mb-4 h-12 w-12 text-muted-foreground" />
            <h4 className="mb-1 text-base font-semibold text-ink">Todavía no hay puestos configurados.</h4>
            <p className="mb-4 text-sm text-muted-foreground">
              Los trabajadores migrados sin puesto quedarán pendientes de vinculación.
            </p>
            <div className="flex gap-2">
              {canManage && (
                <SiteCorpButton onClick={() => setMigrationDialogOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />Migrar trabajador
                </SiteCorpButton>
              )}
              <SiteCorpButton variant="outline" onClick={() => navigate(`/entity/${entityId}/settings/staffing`)}>
                <Settings className="mr-2 h-4 w-4" />Configurar plantilla
              </SiteCorpButton>
            </div>
          </div>
          {pendingWorkers.length > 0 && (
            <div className="mt-5 space-y-2">
              {pendingWorkers.map(worker => (
                <div key={worker.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                  <Link to={`/entity/${entityId}/workers/${worker.id}`} className="font-medium text-sitecorp-primary">
                    {fullName(worker)}
                  </Link>
                  <Badge variant="outline">Pendiente de vinculación</Badge>
                </div>
              ))}
            </div>
          )}
        </SiteCorpCard>
      ) : (
        <SiteCorpCard>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">Plantilla de personal</h3>
                <p className="text-xs text-muted-foreground">
                  Cada fila es una capacidad del Puesto. Las capacidades sin trabajador aparecen como «VACANTE».
                </p>
              </div>
              <SiteCorpButton
                variant="outline"
                size="sm"
                onClick={() => navigate(`/entity/${entityId}/settings/staffing`)}
              >
                <Settings className="mr-2 h-4 w-4" /> Configurar estructura
              </SiteCorpButton>
            </div>

            <FilterBuilder
              definitions={filters.definitions}
              active={filters.active}
              available={filters.available}
              onAdd={filters.add}
              onRemove={filters.remove}
              onSetValues={filters.setValues}
              onClear={filters.clear}
              resultCount={visibleRows.length}
              totalCount={exportRows.length}
            />

            {visibleRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <Network className="mb-4 h-12 w-12 text-muted-foreground" />
                <h4 className="mb-1 text-base font-semibold text-ink">Sin resultados</h4>
                <p className="text-sm text-muted-foreground">
                  Ninguna capacidad coincide con los filtros aplicados.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedRows.map(area => (
                  <div key={area.areaKey} className="space-y-3">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-sitecorp-primary">
                      {area.areaName}
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Cargo / Puesto</th>
                            <th className="px-3 py-2 font-semibold">Categoría ocupacional</th>
                            <th className="px-3 py-2 font-semibold">Trabajador</th>
                            <th className="px-3 py-2 font-semibold">Sexo</th>
                            <th className="px-3 py-2 font-semibold">Carnet de identidad</th>
                            <th className="px-3 py-2 font-semibold">Nivel de preparación</th>
                            <th className="px-3 py-2 font-semibold">Grupo Escala</th>
                            <th className="px-3 py-2 text-right font-semibold">Salario</th>
                            <th className="px-3 py-2 font-semibold">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {area.positions.map(position => {
                            const counts = structuralByPosition.get(position.positionId) ?? {
                              authorized: position.rows.length,
                              occupied: position.rows.filter(r => r.worker_id).length,
                            }
                            const vacancies = Math.max(0, counts.authorized - counts.occupied)
                            return (
                              <React.Fragment key={position.positionId}>
                                <tr className="border-t border-border bg-sitecorp-primary/5">
                                  <td colSpan={9} className="px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <span className="text-sm font-medium text-ink">
                                        {position.positionName || "—"}
                                      </span>
                                      {position.jobName && (
                                        <span className="text-xs text-muted-foreground">
                                          Cargo: {position.jobName}
                                        </span>
                                      )}
                                      <span className="text-xs text-muted-foreground">
                                        Autorizados: <strong className="text-ink">{counts.authorized}</strong>
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        Ocupados: <strong className="text-sitecorp-success">{counts.occupied}</strong>
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        Vacantes:{" "}
                                        <strong className={vacancies > 0 ? "text-sitecorp-warning" : "text-ink"}>
                                          {vacancies}
                                        </strong>
                                      </span>
                                      <span className="ml-auto text-xs text-muted-foreground">
                                        {position.salary !== null
                                          ? `${formatAmount(position.salary)} CUP`
                                          : "Salario no configurado"}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                                {position.rows.map((row, index) => (
                                  <tr key={`${position.positionId}-${index}`} className="border-t border-border/60">
                                    <td className="px-3 py-2 text-ink">{row.position_name || "—"}</td>
                                    <td className="px-3 py-2 text-ink">{row.occupational_category || "—"}</td>
                                    <td className="px-3 py-2">
                                      {row.worker_id ? (
                                        <Link
                                          to={`/entity/${entityId}/workers/${row.worker_id}`}
                                          className="font-medium text-sitecorp-primary underline-offset-2 hover:underline"
                                        >
                                          {row.worker_name || "—"}
                                        </Link>
                                      ) : (
                                        <span className="inline-flex items-center rounded-full border border-dashed border-sitecorp-warning/50 bg-sitecorp-warning/10 px-2 py-0.5 text-xs font-medium text-sitecorp-warning">
                                          VACANTE
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-ink">{row.gender_code || "—"}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-ink">{row.identification || "—"}</td>
                                    <td className="px-3 py-2 text-ink">{row.preparation_level || "—"}</td>
                                    <td className="px-3 py-2 text-ink">{groupLabel(row.salary_group_sequence)}</td>
                                    <td className="px-3 py-2 text-right text-ink">
                                      {row.salary !== null ? formatAmount(row.salary) : "—"}
                                    </td>
                                    <td className="px-3 py-2">
                                      <SiteCorpStatusBadge status={row.worker_id ? "success" : "warning"}>
                                        {row.worker_id ? "Ocupado" : "Vacante"}
                                      </SiteCorpStatusBadge>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SiteCorpCard>
      )}

      {/* Trabajadores activos pendientes de vinculación (acción de vinculación) */}
      {activePositions.length > 0 && pendingWorkers.length > 0 && (
        <SiteCorpCard>
          <div className="mb-3 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-sitecorp-warning" />
            <h3 className="text-base font-semibold text-ink">
              Pendientes de vinculación ({pendingWorkers.length})
            </h3>
          </div>
          <div className="space-y-2">
            {pendingWorkers.map(worker => (
              <div
                key={worker.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    to={`/entity/${entityId}/workers/${worker.id}`}
                    className="text-sm font-medium text-ink underline-offset-2 hover:text-sitecorp-primary hover:underline"
                  >
                    {fullName(worker)}
                  </Link>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {worker.code}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">CI: {worker.identification}</span>
                  <Badge variant="outline" className="border-sitecorp-warning/40 text-sitecorp-warning">
                    Pendiente de vinculación
                  </Badge>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <SiteCorpButton variant="outline" size="sm" onClick={() => setLinkWorkerId(worker.id)}>
                      Vincular a plantilla
                    </SiteCorpButton>
                    <button
                      type="button"
                      onClick={() => openEditWorkerDialog(worker)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
                      aria-label="Editar trabajador"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SiteCorpCard>
      )}

      <Dialog open={migrationDialogOpen} onOpenChange={setMigrationDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Migrar trabajador</DialogTitle>
            <DialogDescription>
              Crea un Worker histórico directamente. Queda sin puesto y sin documentos; podrá
              vincularlo a la plantilla después.
            </DialogDescription>
          </DialogHeader>
          <MigratedWorkerDialog
            onCancel={() => setMigrationDialogOpen(false)}
            onSuccess={async () => {
              await loadData()
              queryClient.invalidateQueries()
              setMigrationDialogOpen(false)
              showNotice("success", "Trabajador creado correctamente.")
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkWorkerId} onOpenChange={(open) => { if (!open) setLinkWorkerId(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Vincular a plantilla</DialogTitle>
            <DialogDescription>
              La fecha histórica de incorporación no cambia. Esta acción crea únicamente un Assignment.
            </DialogDescription>
          </DialogHeader>
          {linkWorkerId && (
            <LinkWorkerToPositionDialog
              workerId={linkWorkerId}
              positions={positionOptions}
              onCancel={() => setLinkWorkerId(null)}
              onSuccess={async () => {
                await loadData()
                setLinkWorkerId(null)
                showNotice("success", "Trabajador vinculado a la plantilla. Fecha de incorporación preservada.")
              }}
            />
          )}
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
