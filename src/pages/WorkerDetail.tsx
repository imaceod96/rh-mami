import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  ArrowLeft,
  Pencil,
  User,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Briefcase,
  UserCheck,
  FileText,
  ArrowRightLeft,
  UserMinus,
  UserPlus,
  FileSignature,
  AlertTriangle,
  Wallet,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toRomanNumeral } from "@/utils/roman-numerals"
import { WorkerForm } from "@/components/workers/WorkerForm"
import { WorkerDocumentsTab } from "@/components/workers/WorkerDocumentsTab"
import ChangePositionDialog, {
  type WorkerCurrentSituation,
} from "@/components/workers/ChangePositionDialog"
import SeparateWorkerDialog from "@/components/workers/SeparateWorkerDialog"
import ReincorporateWorkerDialog from "@/components/workers/ReincorporateWorkerDialog"
import ChangeContractDialog, {
  type CurrentContractInfo,
} from "@/components/workers/ChangeContractDialog"
import { SelectItem } from "@/components/ui/select"
import {
  resolveApplicableScaleId,
  fetchSalaryValuesForGroups,
  salaryForGroup,
  formatSalary,
  type SalaryValue,
} from "@/lib/salary"
import {
  ADDENDUM_STATUS_BADGE,
  ADDENDUM_STATUS_LABELS,
  SALARY_CHANGE_TYPE_LABELS,
  fetchWorkerSalaryHistory,
  pendingAddendums,
  type WorkerSalaryHistoryEntry,
} from "@/lib/worker-salary"
import {
  CONTRACT_ALERT_META,
  deadlineLabel,
  fetchWorkerContractAlert,
  formatContractDate,
  type ContractAlertRow,
} from "@/lib/contract-alerts"

interface WorkerDetail {
  id: string
  code: string
  first_name: string
  first_surname: string
  second_surname: string | null
  identification: string
  birth_date: string | null
  gender_id: string | null
  marital_status_id: string | null
  education_level_id: string | null
  specialty: string | null
  skin_color_id: string | null
  address: string | null
  province: string | null
  municipality: string | null
  phone: string | null
  email: string | null
  hire_date: string
  employment_status: string
  created_at: string
  updated_at: string
  assignments: {
    id: string
    position_id: string
    start_date: string
    end_date: string | null
    is_current: boolean
    position: {
      id: string
      name: string
      code: string
      is_active: boolean
      job: {
        id: string
        name: string
        code: string
        is_active: boolean
        area_id: string
        area: { id: string; name: string } | null
        salary_group: {
          id: string
          salary_scale_id: string
          sequence_number: number
        } | null
      } | null
    } | null
  }[] | null
  contracts: {
    id: string
    assignment_id: string
    contract_type_id: string
    start_date: string
    end_date: string | null
    actual_end_date: string | null
    is_current: boolean
    salary_amount: number | null
    salary_currency_code: string | null
    salary_effective_date: string | null
    salary_snapshot_status: string
    contract_type: {
      id: string
      name: string
      code: string
    } | null
  }[] | null
}

interface Catalog {
  id: string
  name: string
}

interface WorkerMovement {
  id: string
  movement_type: string
  effective_date: string
  reason: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  separation_reason: { name: string } | null
  authorName: string | null
}

const WorkerDetail = () => {
  const { entityId, workerId } = useParams<{ entityId: string; workerId: string }>()
  const navigate = useNavigate()

  const [worker, setWorker] = React.useState<WorkerDetail | null>(null)
  const [genders, setGenders] = React.useState<Catalog[]>([])
  const [maritalStatuses, setMaritalStatuses] = React.useState<Catalog[]>([])
  const [educationLevels, setEducationLevels] = React.useState<Catalog[]>([])
  const [skinColors, setSkinColors] = React.useState<Catalog[]>([])
  const [applicableScaleId, setApplicableScaleId] = React.useState<string | null>(null)
  const [salaryValuesByGroup, setSalaryValuesByGroup] = React.useState<Record<string, SalaryValue | null>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [canManage, setCanManage] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [contractTypes, setContractTypes] = React.useState<{ id: string; name: string; code: string }[]>([])
  const [contractDialogOpen, setContractDialogOpen] = React.useState(false)
  const [changePositionOpen, setChangePositionOpen] = React.useState(false)
  const [separateOpen, setSeparateOpen] = React.useState(false)
  const [reincorporateOpen, setReincorporateOpen] = React.useState(false)
  const [changeContractOpen, setChangeContractOpen] = React.useState(false)
  const [movements, setMovements] = React.useState<WorkerMovement[]>([])
  const [salaryHistory, setSalaryHistory] = React.useState<WorkerSalaryHistoryEntry[]>([])
  const [contractAlert, setContractAlert] = React.useState<ContractAlertRow | null>(null)
  const [contractForm, setContractForm] = React.useState({ contractTypeId: "", startDate: "", endDate: "" })
  const [contractSubmitting, setContractSubmitting] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const currentAssignment = React.useMemo(() => {
    if (!worker?.assignments) return null
    return worker.assignments.find(a => a.is_current && !a.end_date) || null
  }, [worker])

  const currentContract = React.useMemo(() => {
    if (!worker?.contracts) return null
    return worker.contracts.find(c => c.is_current) || null
  }, [worker])

  const sortedAssignments = React.useMemo(() => {
    if (!worker?.assignments) return []
    return [...worker.assignments].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  }, [worker])

  const sortedContracts = React.useMemo(() => {
    if (!worker?.contracts) return []
    return [...worker.contracts].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  }, [worker])

  const lastAssignment = sortedAssignments[0] ?? null
  // Para un trabajador inactivo mostramos su ÚLTIMA situación laboral (assignment histórico más reciente).
  const position = currentAssignment?.position ?? lastAssignment?.position ?? null
  const job = position?.job
  const group = job?.salary_group
  const isInactive = worker?.employment_status !== "active"

  const [editForm, setEditForm] = React.useState<Partial<WorkerDetail>>({})

  const loadWorker = React.useCallback(async () => {
    if (!entityId || !workerId) {
      setError("Parámetros inválidos")
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
        setError("No tiene permiso para ver este trabajador")
        return
      }
      setCanManage(!!canViewManage)

      const { data: workerData, error: workerError } = await supabase
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
                ),
                contracts:employment_contracts(
                  id, assignment_id, contract_type_id, start_date, end_date, actual_end_date, is_current,
                  salary_amount, salary_currency_code, salary_effective_date, salary_snapshot_status,
                  contract_type:employment_contract_types(id, name, code)
                )
              `)
              .eq("id", workerId)
              .eq("organization_entity_id", entityId)
              .single()
      
            if (workerError) throw workerError
                  // Map nested area arrays to objects
                  const mappedWorker = workerData as any
                  if (mappedWorker.contracts) {
                    mappedWorker.contracts = mappedWorker.contracts.map((c: any) => ({
                      ...c,
                      contract_type: Array.isArray(c.contract_type)
                        ? c.contract_type[0] || null
                        : c.contract_type,
                    }))
                  }
            if (mappedWorker.assignments) {
              mappedWorker.assignments = mappedWorker.assignments.map((a: any) => ({
                ...a,
                position: a.position
                  ? {
                      ...a.position,
                      job: a.position.job
                        ? {
                            ...a.position.job,
                            area: a.position.job.area
                              ? { id: a.position.job.area[0]?.id || null, name: a.position.job.area[0]?.name || null }
                              : null,
                          }
                        : null,
                    }
                  : null,
              }))
            }
            setWorker(mappedWorker as WorkerDetail)

      // Cargar catálogos
      const [g, m, e, s, ct] = await Promise.all([
        supabase.from("genders").select("id, name").order("name"),
        supabase.from("marital_statuses").select("id, name").order("name"),
        supabase.from("education_levels").select("id, name").order("name"),
        supabase.from("skin_colors").select("id, name").order("name"),
        supabase.from("employment_contract_types").select("id, name, code").eq("is_active", true).order("name"),
      ])
      setGenders((g.data as Catalog[]) || [])
      setMaritalStatuses((m.data as Catalog[]) || [])
      setEducationLevels((e.data as Catalog[]) || [])
      setSkinColors((s.data as Catalog[]) || [])
      setContractTypes((ct.data as { id: string; name: string; code: string }[]) || [])

      // Bitácora de movimientos laborales (bajas, reincorporaciones, cambios de puesto)
      const { data: movData } = await supabase
        .from("worker_employment_movements")
        .select(
          `id, movement_type, effective_date, reason, notes, created_by, created_at,
           separation_reason:worker_separation_reasons(name)`
        )
        .eq("worker_id", workerId)
        .order("created_at", { ascending: false })

      const movRows = ((movData as any[]) || []).map((m: any) => ({
        ...m,
        separation_reason: Array.isArray(m.separation_reason)
          ? m.separation_reason[0] || null
          : m.separation_reason,
      }))

      const authorIds = Array.from(
        new Set(movRows.map((m) => m.created_by).filter((id): id is string => !!id))
      )
      const authorMap: Record<string, string> = {}
      if (authorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", authorIds)
        ;(profs || []).forEach((p: any) => {
          authorMap[p.id] = p.full_name
        })
      }
      setMovements(
        movRows.map((m) => ({
          ...m,
          authorName: m.created_by ? authorMap[m.created_by] || null : null,
        })) as WorkerMovement[]
      )

      // Escala aplicable y salario de referencia (derivado del assignment actual).
      // Se calcula a partir de los datos recién cargados (locales), NO del estado
      // `worker`, que aún no se ha actualizado en este punto del mismo ciclo async.
      const applicableScale = await resolveApplicableScaleId(entityId)
      setApplicableScaleId(applicableScale)

      const localAssignments = (mappedWorker.assignments || []) as any[]
      const localCurrentAssignment =
        localAssignments.find((a) => a.is_current && !a.end_date) || null
      // Si el trabajador está inactivo no hay assignment actual: usamos su última
      // situación laboral (assignment histórico más reciente) para el salario de referencia.
      const localLastAssignment = localAssignments
        .slice()
        .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] || null
      const localGroup =
        localCurrentAssignment?.position?.job?.salary_group ||
        localLastAssignment?.position?.job?.salary_group ||
        null

      if (localGroup?.id) {
        setSalaryValuesByGroup(await fetchSalaryValuesForGroups([localGroup.id]))
      } else {
        setSalaryValuesByGroup({})
      }

      // Fase 12: vencimiento del contrato vigente. Se resuelve en el servidor para
      // compartir el mismo cálculo (fechas y días) que la vista de Alertas.
      try {
        setContractAlert(await fetchWorkerContractAlert(entityId, workerId))
      } catch (alertErr) {
        console.error("Error loading contract alert:", alertErr)
        setContractAlert(null)
      }

      // Fase 11A: histórico salarial y anexos contractuales pendientes (registros
      // históricos: nunca se recalculan ni se sobrescriben).
      try {
        setSalaryHistory(await fetchWorkerSalaryHistory(workerId))
      } catch (historyErr) {
        console.error("Error loading salary history:", historyErr)
        setSalaryHistory([])
      }
    } catch (err) {
      console.error("Error loading worker:", err)
      setError(err instanceof Error ? err.message : "Error al cargar el trabajador")
    } finally {
      setLoading(false)
    }
  }, [entityId, workerId])

  React.useEffect(() => {
    loadWorker()
  }, [loadWorker])

  const handleEditSave = async () => {
    if (!worker) return
    const { error } = await supabase
      .from("workers")
      .update({
        first_name: editForm.first_name,
        first_surname: editForm.first_surname,
        second_surname: editForm.second_surname || null,
        identification: editForm.identification,
        birth_date: editForm.birth_date,
        gender_id: editForm.gender_id || null,
        marital_status_id: editForm.marital_status_id || null,
        education_level_id: editForm.education_level_id || null,
        specialty: editForm.specialty || null,
        skin_color_id: editForm.skin_color_id || null,
        address: editForm.address || null,
        province: editForm.province || null,
        municipality: editForm.municipality || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
      })
      .eq("id", worker.id)

    if (error) {
      setError(error.message)
    } else {
      setEditDialogOpen(false)
      loadWorker()
    }
  }

  const handleRegisterContract = async () => {
    if (!worker) return
    setActionError(null)

    if (!contractForm.contractTypeId) {
      setActionError("Selecciona un tipo de contrato")
      return
    }
    const selectedType = contractTypes.find(t => t.id === contractForm.contractTypeId)
    const start = contractForm.startDate || worker.hire_date
    if (!start) {
      setActionError("La fecha de inicio del contrato es obligatoria")
      return
    }
    if (selectedType?.code === "DETERMINADO" && !contractForm.endDate) {
      setActionError("El contrato por tiempo determinado requiere una fecha de fin")
      return
    }
    if (contractForm.endDate && contractForm.endDate <= start) {
      setActionError("La fecha de fin debe ser posterior al inicio")
      return
    }

    setContractSubmitting(true)
    try {
      const { error: rpcError } = await supabase.rpc("complete_worker_contract", {
        p_worker_id: worker.id,
        p_contract_type_id: contractForm.contractTypeId,
        p_contract_start_date: start,
        p_contract_end_date: selectedType?.code === "DETERMINADO" ? contractForm.endDate || null : null,
      })
      if (rpcError) throw rpcError
      setContractDialogOpen(false)
      setContractForm({ contractTypeId: "", startDate: "", endDate: "" })
      loadWorker()
    } catch (err) {
      console.error("Error registering contract:", err)
      setActionError(err instanceof Error ? err.message : "Error al registrar el contrato")
    } finally {
      setContractSubmitting(false)
    }
  }

  const fullName = (w: WorkerDetail) =>
    [w.first_name, w.first_surname, w.second_surname].filter(Boolean).join(" ")

  const salary = salaryForGroup(applicableScaleId, group, salaryValuesByGroup)

  const pendingContractAddendums = React.useMemo(
    () => pendingAddendums(salaryHistory),
    [salaryHistory]
  )

  // El snapshot contractual es histórico: puede diferir del salario operativo actual.
  const contractSalaryDiffers =
    currentContract?.salary_snapshot_status === "CAPTURED" &&
    currentContract.salary_amount !== null &&
    salary !== null &&
    Number(currentContract.salary_amount) !== salary.amount

  // Fase 12: alerta de vencimiento del contrato vigente (categorías derivadas).
  const contractAlertTone =
    contractAlert?.alert_state === "OVERDUE" || contractAlert?.alert_state === "DUE_TODAY"
      ? "danger"
      : contractAlert?.alert_state === "NO_END_DATE"
        ? "warning"
        : "info"

  const showContractAlert =
    !isInactive &&
    !!contractAlert &&
    (contractAlert.alert_state === "NO_END_DATE" ||
      (contractAlert.days_remaining !== null && contractAlert.days_remaining <= 30))

  const lastBaja = React.useMemo(
    () => movements.find((m) => m.movement_type === "BAJA") || null,
    [movements]
  )

  const currentContractInfo: CurrentContractInfo | null = React.useMemo(() => {
    if (!currentContract) return null
    return {
      id: currentContract.id,
      typeName: currentContract.contract_type?.name ?? null,
      typeCode: currentContract.contract_type?.code ?? null,
      startDate: currentContract.start_date,
      endDate: currentContract.end_date,
    }
  }, [currentContract])

  const currentSituation: WorkerCurrentSituation = React.useMemo(
    () => ({
      positionId: position?.id ?? currentAssignment?.position_id ?? null,
      positionName: position?.name ?? null,
      positionCode: position?.code ?? null,
      jobName: job?.name ?? null,
      areaName: job?.area?.name ?? null,
      groupSequence: group?.sequence_number ?? null,
      salary: salary ?? null,
      startDate: currentAssignment?.start_date ?? null,
    }),
    [position, currentAssignment, job, group, salary]
  )

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Detalles del trabajador" description="Cargando..." />
        <SiteCorpAlert type="info">Cargando...</SiteCorpAlert>
      </div>
    )
  }

  if (error || !worker) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Detalles del trabajador" />
        <SiteCorpAlert type="danger" title="Error">
          {error || "Trabajador no encontrado"}
        </SiteCorpAlert>
        <SiteCorpButton variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </SiteCorpButton>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Detalles del trabajador"
        actions={
          <SiteCorpButton variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </SiteCorpButton>
        }
      />

      <Tabs defaultValue="resumen" className="w-full">
        <TabsList className="mb-4 grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="salario">
            Salario
            {pendingContractAddendums.length > 0 && (
              <span className="ml-2 rounded-full bg-sitecorp-warning/10 px-2 py-0.5 text-xs font-semibold text-sitecorp-warning">
                {pendingContractAddendums.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Datos personales */}
        <SiteCorpCard>
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">Datos personales</h3>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setEditForm(worker)
                    setEditDialogOpen(true)
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-ink"
                  aria-label="Editar trabajador"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Nombre completo</dt>
                <dd className="text-sm font-medium text-ink">{fullName(worker)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Código</dt>
                <dd className="text-sm font-mono text-ink">{worker.code}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Carné de identidad</dt>
                <dd className="text-sm text-ink">{worker.identification}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fecha de nacimiento</dt>
                <dd className="text-sm text-ink">{worker.birth_date || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sexo</dt>
                <dd className="text-sm text-ink">
                  {worker.gender_id
                    ? genders.find(g => g.id === worker.gender_id)?.name
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Estado civil</dt>
                <dd className="text-sm text-ink">
                  {worker.marital_status_id
                    ? maritalStatuses.find(m => m.id === worker.marital_status_id)?.name
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Nivel educacional</dt>
                <dd className="text-sm text-ink">
                  {worker.education_level_id
                    ? educationLevels.find(e => e.id === worker.education_level_id)?.name
                    : "—"}
                </dd>
              </div>
              {worker.specialty && (
                <div>
                  <dt className="text-xs text-muted-foreground">Especialidad</dt>
                  <dd className="text-sm text-ink">{worker.specialty}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Color de piel</dt>
                <dd className="text-sm text-ink">
                  {worker.skin_color_id
                    ? skinColors.find(s => s.id === worker.skin_color_id)?.name
                    : "—"}
                </dd>
              </div>
            </dl>

            {worker.address && (
              <div className="mt-4">
                <dt className="text-xs text-muted-foreground">Dirección</dt>
                <dd className="text-sm text-ink">{worker.address}</dd>
                {worker.province && worker.municipality && (
                  <dd className="text-xs text-muted-foreground">
                    {worker.municipality}, {worker.province}
                  </dd>
                )}
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {worker.phone && (
                <div>
                  <dt className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Teléfono
                  </dt>
                  <dd className="text-sm text-ink">{worker.phone}</dd>
                </div>
              )}
              {worker.email && (
                <div>
                  <dt className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </dt>
                  <dd className="text-sm text-ink">{worker.email}</dd>
                </div>
              )}
            </div>
          </div>
        </SiteCorpCard>

        {/* Datos laborales */}
        <SiteCorpCard>
          <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-ink">Datos laborales</h3>
              {canManage && (
                <div className="flex flex-wrap items-center gap-2">
                  {!isInactive && currentAssignment && (
                    <>
                      <SiteCorpButton
                        type="button"
                        variant="outline"
                        onClick={() => setChangePositionOpen(true)}
                      >
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Cambiar de puesto
                      </SiteCorpButton>
                      <SiteCorpButton
                        type="button"
                        variant="outline"
                        onClick={() => setSeparateOpen(true)}
                      >
                        <UserMinus className="mr-2 h-4 w-4" /> Dar de baja
                      </SiteCorpButton>
                    </>
                  )}
                  {isInactive && (
                    <SiteCorpButton type="button" onClick={() => setReincorporateOpen(true)}>
                      <UserPlus className="mr-2 h-4 w-4" /> Reincorporar
                    </SiteCorpButton>
                  )}
                </div>
              )}
            </div>

            <dl className="grid gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Estado laboral</dt>
                <dd>
                  <SiteCorpStatusBadge status={worker.employment_status === "active" ? "success" : "neutral"}>
                    {worker.employment_status === "active" ? "Activo" : "Inactivo"}
                  </SiteCorpStatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fecha de incorporación</dt>
                <dd className="text-sm text-ink">{worker.hire_date}</dd>
              </div>

              {position ? (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {isInactive ? "Último puesto" : "Puesto actual"}
                    </dt>
                    <dd className="text-sm font-medium text-ink">{position.name}</dd>
                    <dd className="text-xs text-muted-foreground">{position.code}</dd>
                  </div>
                  {job && (
                    <>
                      <div>
                        <dt className="text-xs text-muted-foreground">Cargo</dt>
                        <dd className="text-sm text-ink">{job.name}</dd>
                      </div>
                      {job.area && (
                        <div>
                          <dt className="text-xs text-muted-foreground">Área</dt>
                          <dd className="text-sm text-ink">{job.area.name}</dd>
                        </div>
                      )}
                      {group && (
                        <div>
                          <dt className="text-xs text-muted-foreground">Grupo salarial</dt>
                          <dd className="text-sm text-ink">
                            Grupo {toRomanNumeral(group.sequence_number)}
                          </dd>
                        </div>
                      )}
                      {salary ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Salario de referencia</dt>
                          <dd className="text-sm font-medium text-ink">{formatSalary(salary)}</dd>
                        </div>
                      ) : (
                        <div>
                          <dt className="text-xs text-muted-foreground">Salario de referencia</dt>
                          <dd className="text-sm text-muted-foreground italic">
                            Salario no configurado
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div>
                  <dt className="text-xs text-muted-foreground">Puesto actual</dt>
                  <dd className="text-sm text-muted-foreground">— Sin asignación —</dd>
                </div>

              )}
            </dl>

            {/* Contratación */}
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-ink">Contratación</h4>
                <div className="flex flex-wrap items-center gap-2">
                  {canManage && currentAssignment && !currentContract && (
                    <SiteCorpButton
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setActionError(null)
                        setContractForm({
                          contractTypeId: "",
                          startDate: worker.hire_date || "",
                          endDate: "",
                        })
                        setContractDialogOpen(true)
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" /> Registrar contrato
                    </SiteCorpButton>
                  )}
                  {canManage && !isInactive && currentContract && (
                    <SiteCorpButton
                      type="button"
                      variant="outline"
                      onClick={() => setChangeContractOpen(true)}
                    >
                      <FileSignature className="mr-2 h-4 w-4" /> Cambiar contrato
                    </SiteCorpButton>
                  )}
                </div>
              </div>
              {currentContract ? (
                <>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Tipo de contrato</dt>
                    <dd>
                      <SiteCorpStatusBadge
                        status={
                          currentContract.contract_type?.code === "DETERMINADO" ? "warning" : "info"
                        }
                      >
                        {currentContract.contract_type?.name || "—"}
                      </SiteCorpStatusBadge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Inicio</dt>
                    <dd className="text-sm text-ink">{currentContract.start_date}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Finalización prevista</dt>
                    <dd className="text-sm text-ink">
                      {currentContract.end_date || (
                        <span className="text-muted-foreground">Sin fecha de fin</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {/* Salario del contrato: snapshot histórico (Fase 11A) */}
                <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Salario al inicio del contrato
                  </p>
                  {currentContract.salary_snapshot_status === "CAPTURED" &&
                  currentContract.salary_amount !== null ? (
                    <>
                      <p className="mt-1 text-sm font-medium text-ink">
                        {formatSalary({
                          amount: Number(currentContract.salary_amount),
                          currency_code: currentContract.salary_currency_code || "",
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vigente desde {formatContractDate(currentContract.salary_effective_date)}
                        {!contractSalaryDiffers && " · coincide con el salario actual"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm italic text-muted-foreground">
                      No reconstruible: el importe histórico de este contrato no pudo determinarse de
                      forma fiable y no se ha registrado ningún valor inventado.
                    </p>
                  )}
                </div>

                {/* Alerta de vencimiento contractual (Fase 12) */}
                {showContractAlert && contractAlert && (
                  <div
                    className={`mt-3 rounded-xl border p-3 ${
                      contractAlertTone === "danger"
                        ? "border-sitecorp-danger/30 bg-sitecorp-danger/5"
                        : contractAlertTone === "warning"
                          ? "border-sitecorp-warning/30 bg-sitecorp-warning/5"
                          : "border-blue-500/30 bg-blue-500/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <SiteCorpStatusBadge
                        status={
                          contractAlert.alert_state === "NO_END_DATE"
                            ? "warning"
                            : CONTRACT_ALERT_META[contractAlert.alert_state].badge
                        }
                      >
                        {contractAlert.alert_state === "NO_END_DATE"
                          ? "Requiere corrección"
                          : CONTRACT_ALERT_META[contractAlert.alert_state].label}
                      </SiteCorpStatusBadge>
                      <span className="text-sm font-medium text-ink">
                        {contractAlert.alert_state === "NO_END_DATE"
                          ? "Contrato determinado sin fecha de finalización"
                          : deadlineLabel(
                              contractAlert.days_remaining,
                              contractAlert.contract_end_date
                            )}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {contractAlert.alert_state === "NO_END_DATE"
                        ? "Corrija la fecha de finalización del contrato o cámbielo a tiempo indeterminado."
                        : `Inició ${formatContractDate(contractAlert.contract_start_date)}${
                            contractAlert.contract_end_date
                              ? ` · ${
                                  contractAlert.days_remaining !== null &&
                                  contractAlert.days_remaining < 0
                                    ? "Finalizó"
                                    : "Finaliza"
                                } ${formatContractDate(contractAlert.contract_end_date)}`
                              : ""
                          }`}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      La fecha del contrato genera una alerta administrativa: no se da de baja al
                      trabajador, no se cierra su asignación ni se libera el puesto
                      automáticamente.
                    </p>

                    {canManage && contractAlert.alert_state !== "NO_END_DATE" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <SiteCorpButton
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => setChangeContractOpen(true)}
                        >
                          <FileSignature className="mr-1 h-3.5 w-3.5" /> Cambiar contrato
                        </SiteCorpButton>
                        <SiteCorpButton
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => setSeparateOpen(true)}
                        >
                          <UserMinus className="mr-1 h-3.5 w-3.5" /> Dar de baja
                        </SiteCorpButton>
                      </div>
                    )}
                  </div>
                )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin contrato registrado para este trabajador.
                </p>
              )}
            </div>
          </div>
        </SiteCorpCard>
      </div>

      {/* Información de baja (trabajador inactivo) */}
      {isInactive && (
        <SiteCorpCard>
          <div className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-ink">Información de baja</h3>
            {lastBaja ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Fecha</dt>
                  <dd className="text-sm font-medium text-ink">{lastBaja.effective_date}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Motivo</dt>
                  <dd className="text-sm font-medium text-ink">
                    {lastBaja.separation_reason?.name || lastBaja.reason || "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Observaciones</dt>
                  <dd className="text-sm text-ink">{lastBaja.notes || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Registrado por</dt>
                  <dd className="text-sm text-ink">{lastBaja.authorName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Registrado el</dt>
                  <dd className="text-sm text-ink">
                    {new Date(lastBaja.created_at).toLocaleString("es-CU")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sin información de baja registrada.
              </p>
            )}
          </div>
        </SiteCorpCard>
      )}

      {/* Historial laboral */}
      <SiteCorpCard>
        <div className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-ink">Trayectoria laboral</h3>
          {sortedAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {sortedAssignments.map((a) => (
                <li key={a.id} className="relative">
                  <span
                    className={`absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-background ${
                      a.is_current && !a.end_date ? "bg-sitecorp-success" : "bg-muted-foreground/50"
                    }`}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                      {a.position?.name || "Puesto"}
                    </span>
                    {a.position?.code && (
                      <span className="text-xs text-muted-foreground">{a.position.code}</span>
                    )}
                    {a.is_current && !a.end_date && (
                      <SiteCorpStatusBadge status="success">Actual</SiteCorpStatusBadge>
                    )}
                  </div>
                  {a.position?.job && (
                    <p className="text-xs text-muted-foreground">
                      {a.position.job.name}
                      {a.position.job.area?.name ? ` · ${a.position.job.area.name}` : ""}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Desde {a.start_date}
                    {a.end_date ? ` hasta ${a.end_date}` : " · en curso"}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {sortedContracts.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <h4 className="mb-3 text-sm font-semibold text-ink">Historial de contratos</h4>
              <ul className="space-y-2">
                {sortedContracts.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-sm text-ink">
                      {c.contract_type?.name || "Contrato"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.start_date} →{" "}
                      {c.is_current
                        ? c.end_date
                          ? `previsto hasta ${c.end_date}`
                          : "sin fecha de fin"
                        : c.actual_end_date
                          ? `hasta ${c.actual_end_date}`
                          : c.end_date
                            ? `previsto hasta ${c.end_date}`
                            : "sin fecha de fin"}
                    </span>
                    {c.is_current ? (
                      <SiteCorpStatusBadge status="success">Vigente</SiteCorpStatusBadge>
                    ) : (
                      <SiteCorpStatusBadge status="neutral">Finalizado</SiteCorpStatusBadge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SiteCorpCard>

        </TabsContent>

        <TabsContent value="salario" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Salario operativo actual (derivado, nunca almacenado en el trabajador) */}
            <SiteCorpCard
              title="Salario actual"
              description="Derivado del puesto, cargo y escala salarial vigentes"
            >
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Grupo salarial</dt>
                  <dd className="text-sm text-ink">
                    {group ? `Grupo ${toRomanNumeral(group.sequence_number)}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Wallet className="h-3 w-3" /> Importe vigente
                  </dt>
                  <dd className="text-sm font-medium text-ink">
                    {salary ? formatSalary(salary) : "Sin salario configurado"}
                  </dd>
                  {salary?.effective_from && (
                    <p className="text-xs text-muted-foreground">
                      Vigente desde {formatContractDate(salary.effective_from)}
                    </p>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cargo</dt>
                  <dd className="text-sm text-ink">{job?.name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Puesto</dt>
                  <dd className="text-sm text-ink">
                    {isInactive ? "Último puesto: " : ""}
                    {position?.name || "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Se resuelve dinámicamente desde el valor vigente de la escala aplicable a la fecha
                actual. No se almacena como salario del trabajador.
              </p>
            </SiteCorpCard>

            {/* Snapshot contractual histórico */}
            <SiteCorpCard
              title="Salario del contrato"
              description="Snapshot histórico registrado al crear el contrato vigente"
            >
              {!currentContract ? (
                <p className="text-sm text-muted-foreground">
                  Sin contrato vigente registrado para este trabajador.
                </p>
              ) : currentContract.salary_snapshot_status === "CAPTURED" &&
                currentContract.salary_amount !== null ? (
                <>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Importe del contrato</dt>
                      <dd className="text-sm font-medium text-ink">
                        {formatSalary({
                          amount: Number(currentContract.salary_amount),
                          currency_code: currentContract.salary_currency_code || "",
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Fecha de vigencia</dt>
                      <dd className="text-sm text-ink">
                        {formatContractDate(currentContract.salary_effective_date)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Tipo de contrato</dt>
                      <dd className="text-sm text-ink">
                        {currentContract.contract_type?.name || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Inicio del contrato</dt>
                      <dd className="text-sm text-ink">
                        {formatContractDate(currentContract.start_date)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {contractSalaryDiffers
                      ? "El contrato conserva el importe histórico con el que se firmó: las modificaciones posteriores de la escala no lo sobrescriben."
                      : "Coincide con el salario actual vigente."}
                  </p>
                </>
              ) : (
                <SiteCorpAlert type="warning" title="Salario del contrato no reconstruible">
                  No fue posible determinar de forma fiable el importe salarial correspondiente al
                  momento del contrato. No se ha registrado ningún valor inventado.
                </SiteCorpAlert>
              )}
            </SiteCorpCard>
          </div>

          {/* Historial salarial */}
          <SiteCorpCard
            title="Historial salarial"
            description="Evolución registrada del salario del trabajador (histórico: no se recalcula)"
          >
            {salaryHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin histórico salarial registrado para este trabajador.
              </p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {salaryHistory.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      className={`absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-background ${
                        entry.previous_amount === null
                          ? "bg-sitecorp-success"
                          : "bg-sitecorp-primary"
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        {formatContractDate(entry.effective_date)}
                      </span>
                      <SiteCorpStatusBadge status="neutral">
                        {SALARY_CHANGE_TYPE_LABELS[entry.change_type] || entry.change_type}
                      </SiteCorpStatusBadge>
                      {entry.group_sequence_number !== null && (
                        <span className="text-xs text-muted-foreground">
                          Grupo {toRomanNumeral(entry.group_sequence_number)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-ink">
                      {entry.previous_amount === null ? (
                        <>
                          Salario inicial:{" "}
                          <span className="font-medium">
                            {formatSalary({
                              amount: Number(entry.new_amount),
                              currency_code: entry.currency_code,
                            })}
                          </span>
                        </>
                      ) : (
                        <>
                          {formatSalary({
                            amount: Number(entry.previous_amount),
                            currency_code: entry.currency_code,
                          })}{" "}
                          →{" "}
                          <span className="font-medium">
                            {formatSalary({
                              amount: Number(entry.new_amount),
                              currency_code: entry.currency_code,
                            })}
                          </span>
                        </>
                      )}
                    </p>
                    {entry.notes && (
                      <p className="text-xs text-muted-foreground">{entry.notes}</p>
                    )}
                    {entry.addendums.map((addendum) => (
                      <p
                        key={addendum.id}
                        className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                      >
                        <span>Anexo al contrato por cambio de salario</span>
                        <SiteCorpStatusBadge
                          status={ADDENDUM_STATUS_BADGE[addendum.status] || "neutral"}
                        >
                          {ADDENDUM_STATUS_LABELS[addendum.status] || addendum.status}
                        </SiteCorpStatusBadge>
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </SiteCorpCard>

          {/* Anexos contractuales pendientes (registros, sin archivo todavía) */}
          <SiteCorpCard
            title="Documentos contractuales"
            description="Anexos preparados por cambios salariales"
          >
            {pendingContractAddendums.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin anexos contractuales registrados.
              </p>
            ) : (
              <div className="space-y-3">
                {pendingContractAddendums.map((addendum) => (
                  <div
                    key={addendum.id}
                    className="rounded-xl border border-border bg-muted/30 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        Anexo al contrato por cambio de salario
                      </span>
                      <SiteCorpStatusBadge
                        status={ADDENDUM_STATUS_BADGE[addendum.status] || "neutral"}
                      >
                        {ADDENDUM_STATUS_LABELS[addendum.status] || addendum.status}
                      </SiteCorpStatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fecha efectiva: {formatContractDate(addendum.effective_date)}
                      {addendum.previous_amount !== null && addendum.new_amount !== null && (
                        <>
                          {" · "}
                          {formatSalary({
                            amount: Number(addendum.previous_amount),
                            currency_code: addendum.currency_code || "",
                          })}{" "}
                          →{" "}
                          {formatSalary({
                            amount: Number(addendum.new_amount),
                            currency_code: addendum.currency_code || "",
                          })}
                        </>
                      )}
                      {addendum.group_sequence_number !== null && (
                        <> · Grupo {toRomanNumeral(addendum.group_sequence_number)}</>
                      )}
                    </p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Estos anexos son registros contractuales pendientes de plantilla legal: todavía no
                  existe un archivo generado ni se pueden descargar.
                </p>
              </div>
            )}
          </SiteCorpCard>
        </TabsContent>

        <TabsContent value="documentos" className="space-y-6">
          <SiteCorpCard>
            <WorkerDocumentsTab workerId={worker.id} canManage={canManage} />
          </SiteCorpCard>
        </TabsContent>
      </Tabs>

      {/* Diálogo de edición */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Editar trabajador</DialogTitle>
            <DialogDescription>Modifica los datos personales y laborales del trabajador.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleEditSave()
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <SiteCorpInput
                  value={editForm.first_name || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Primer apellido</Label>
                <SiteCorpInput
                  value={editForm.first_surname || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, first_surname: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Segundo apellido</Label>
                <SiteCorpInput
                  value={editForm.second_surname || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, second_surname: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Carné de identidad</Label>
                <SiteCorpInput
                  value={editForm.identification || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, identification: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fecha de nacimiento</Label>
                <SiteCorpInput
                  type="date"
                  value={editForm.birth_date || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, birth_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Sexo</Label>
                <SiteCorpSelect
                  value={editForm.gender_id || ""}
                  onValueChange={(v) => setEditForm(f => ({ ...f, gender_id: v }))}
                >
                  <option value="">Seleccionar</option>
                  {genders.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </SiteCorpSelect>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Estado civil</Label>
                <SiteCorpSelect
                  value={editForm.marital_status_id || ""}
                  onValueChange={(v) => setEditForm(f => ({ ...f, marital_status_id: v }))}
                >
                  <option value="">Seleccionar</option>
                  {maritalStatuses.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </SiteCorpSelect>
              </div>
              <div className="space-y-2">
                <Label>Nivel educacional</Label>
                <SiteCorpSelect
                  value={editForm.education_level_id || ""}
                  onValueChange={(v) => setEditForm(f => ({ ...f, education_level_id: v }))}
                >
                  <option value="">Seleccionar</option>
                  {educationLevels.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </SiteCorpSelect>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Especialidad</Label>
              <SiteCorpInput
                value={editForm.specialty || ""}
                onChange={(e) => setEditForm(f => ({ ...f, specialty: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Color de piel</Label>
              <SiteCorpSelect
                value={editForm.skin_color_id || ""}
                onValueChange={(v) => setEditForm(f => ({ ...f, skin_color_id: v }))}
              >
                <option value="">Seleccionar</option>
                {skinColors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </SiteCorpSelect>
            </div>

            <div className="space-y-2">
              <Label>Dirección</Label>
              <SiteCorpInput
                value={editForm.address || ""}
                onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Teléfono</Label>
              <SiteCorpInput
                value={editForm.phone || ""}
                onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <SiteCorpInput
                type="email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <SiteCorpButton variant="outline" type="button" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </SiteCorpButton>
              <SiteCorpButton type="submit">Guardar cambios</SiteCorpButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de registro de contrato */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Registrar contrato</DialogTitle>
            <DialogDescription>
              Registra un contrato de trabajo para el puesto actual del trabajador.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleRegisterContract()
            }}
            className="space-y-4"
          >
            {actionError && <SiteCorpAlert type="danger">{actionError}</SiteCorpAlert>}

            <div className="space-y-2">
              <Label>Tipo de contrato *</Label>
              <SiteCorpSelect
                value={contractForm.contractTypeId}
                onValueChange={(v) => setContractForm(f => ({ ...f, contractTypeId: v }))}
              >
                <option value="">Seleccionar tipo</option>
                {contractTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </SiteCorpSelect>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Inicio del contrato</Label>
                <SiteCorpInput
                  type="date"
                  value={contractForm.startDate}
                  onChange={(e) => setContractForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Fin del contrato
                  {contractTypes.find(t => t.id === contractForm.contractTypeId)?.code === "DETERMINADO"
                    ? " *"
                    : ""}
                </Label>
                <SiteCorpInput
                  type="date"
                  value={contractForm.endDate}
                  onChange={(e) => setContractForm(f => ({ ...f, endDate: e.target.value }))}
                  disabled={
                    contractTypes.find(t => t.id === contractForm.contractTypeId)?.code !== "DETERMINADO"
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <SiteCorpButton
                variant="outline"
                type="button"
                onClick={() => setContractDialogOpen(false)}
              >
                Cancelar
              </SiteCorpButton>
              <SiteCorpButton type="submit" disabled={contractSubmitting}>
                {contractSubmitting ? "Registrando..." : "Registrar contrato"}
              </SiteCorpButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de cambio de puesto */}
      <ChangePositionDialog
        open={changePositionOpen}
        onOpenChange={setChangePositionOpen}
        workerId={worker.id}
        entityId={entityId as string}
        current={currentSituation}
        onSuccess={loadWorker}
      />

      {/* Diálogo de baja */}
      <SeparateWorkerDialog
        open={separateOpen}
        onOpenChange={setSeparateOpen}
        workerId={worker.id}
        current={currentSituation}
        onSuccess={loadWorker}
      />

      {/* Diálogo de reincorporación */}
      <ReincorporateWorkerDialog
        open={reincorporateOpen}
        onOpenChange={setReincorporateOpen}
        workerId={worker.id}
        entityId={entityId as string}
        onSuccess={loadWorker}
      />

      {/* Diálogo de cambio de contrato */}
      {currentContractInfo && (
        <ChangeContractDialog
          open={changeContractOpen}
          onOpenChange={setChangeContractOpen}
          workerId={worker.id}
          current={currentContractInfo}
          onSuccess={loadWorker}
        />
      )}
    </div>
  )
}

export default WorkerDetail

