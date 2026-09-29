import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import ChangeContractDialog, {
  type CurrentContractInfo,
} from "@/components/workers/ChangeContractDialog"
import SeparateWorkerDialog from "@/components/workers/SeparateWorkerDialog"
import type { WorkerCurrentSituation } from "@/components/workers/ChangePositionDialog"
import {
  CONTRACT_ALERT_FILTER_OPTIONS,
  CONTRACT_ALERT_HORIZON_DAYS,
  CONTRACT_ALERT_META,
  deadlineLabel,
  fetchContractAlerts,
  formatContractDate,
  summarizeContractAlerts,
  type ContractAlertRow,
} from "@/lib/contract-alerts"
import {
  formatSalary,
  fetchSalaryValuesForGroups,
  resolveApplicableScaleId,
  salaryForGroup,
  type SalaryValue,
} from "@/lib/salary"
import { toRomanNumeral } from "@/utils/roman-numerals"
import {
  AlertTriangle,
  CalendarClock,
  Eye,
  FileSignature,
  RefreshCw,
  Search,
  UserMinus,
  Users,
} from "lucide-react"

interface AlertTarget {
  workerId: string
  workerName: string
  identification: string
  situation: WorkerCurrentSituation
  contract: CurrentContractInfo | null
}

const EntityContractAlerts = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()

  const [rows, setRows] = React.useState<ContractAlertRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [canManage, setCanManage] = React.useState(false)

  const [search, setSearch] = React.useState("")
  const [stateFilter, setStateFilter] = React.useState<string>("ATTENTION")
  const [areaFilter, setAreaFilter] = React.useState("ALL")
  const [jobFilter, setJobFilter] = React.useState("ALL")
  const [positionFilter, setPositionFilter] = React.useState("ALL")

  const [salaryValuesByGroup, setSalaryValuesByGroup] = React.useState<
    Record<string, SalaryValue | null>
  >({})
  const [applicableScaleId, setApplicableScaleId] = React.useState<string | null>(null)

  const [changeTarget, setChangeTarget] = React.useState<AlertTarget | null>(null)
  const [separationTarget, setSeparationTarget] = React.useState<AlertTarget | null>(null)

  const load = React.useCallback(async () => {
    if (!entityId) {
      setError("Parámetros inválidos")
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [canView, canViewManage] = await Promise.all([
        supabase.rpc("can_access_entity", {
          target_entity_id: entityId,
          permission_code: "workers.view",
        }),
        supabase.rpc("can_access_entity", {
          target_entity_id: entityId,
          permission_code: "workers.manage",
        }),
      ])

      if (!canView.data && !canViewManage.data) {
        setError("No tiene permiso para ver los vencimientos contractuales de esta entidad")
        return
      }
      setCanManage(!!canViewManage.data)

      // Una única consulta resuelve contratos vigentes determinados, estructura
      // laboral actual (Área/Cargo/Puesto) y días restantes por fecha calendario.
      const alertRows = await fetchContractAlerts(entityId, {
        horizonDays: CONTRACT_ALERT_HORIZON_DAYS,
      })
      setRows(alertRows)

      // Salario actual (informativo): se resuelve desde la escala aplicable vigente.
      const groupIds = alertRows
        .map((row) => row.salary_group_id)
        .filter((id): id is string => !!id)

      const [values, scaleId] = await Promise.all([
        fetchSalaryValuesForGroups(groupIds),
        resolveApplicableScaleId(entityId),
      ])
      setSalaryValuesByGroup(values)
      setApplicableScaleId(scaleId)
    } catch (err) {
      console.error("Error loading contract alerts:", err)
      setError(err instanceof Error ? err.message : "Error al cargar los vencimientos contractuales")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    load()
  }, [load])

  const summary = React.useMemo(() => summarizeContractAlerts(rows), [rows])

  const filterOptions = React.useMemo(
    () => ({
      areas: Array.from(new Set(rows.map((r) => r.area_name).filter((v): v is string => !!v))).sort(),
      jobs: Array.from(new Set(rows.map((r) => r.job_name).filter((v): v is string => !!v))).sort(),
      positions: Array.from(
        new Set(rows.map((r) => r.position_name).filter((v): v is string => !!v))
      ).sort(),
    }),
    [rows]
  )

  const visibleRows = React.useMemo(() => {
    const term = search.trim().toLowerCase()

    return rows.filter((row) => {
      if (stateFilter !== "ALL" && row.alert_state !== stateFilter) return false
      if (areaFilter !== "ALL" && row.area_name !== areaFilter) return false
      if (jobFilter !== "ALL" && row.job_name !== jobFilter) return false
      if (positionFilter !== "ALL" && row.position_name !== positionFilter) return false

      if (!term) return true
      return (
        row.worker_name.toLowerCase().includes(term) ||
        row.identification.toLowerCase().includes(term) ||
        row.worker_code.toLowerCase().includes(term)
      )
    })
  }, [rows, search, stateFilter, areaFilter, jobFilter, positionFilter])

  const salaryOf = (row: ContractAlertRow) =>
    salaryForGroup(
      applicableScaleId,
      row.salary_group_id && row.salary_scale_id
        ? {
            id: row.salary_group_id,
            salary_scale_id: row.salary_scale_id,
            sequence_number: row.salary_group_sequence_number ?? 0,
          }
        : null,
      salaryValuesByGroup
    )

  const buildTarget = (row: ContractAlertRow): AlertTarget => ({
    workerId: row.worker_id,
    workerName: row.worker_name,
    identification: row.identification,
    situation: {
      positionId: null,
      positionName: row.position_name,
      positionCode: row.position_code,
      jobName: row.job_name,
      areaName: row.area_name,
      groupSequence: row.salary_group_sequence_number,
      salary: salaryOf(row),
      startDate: row.contract_start_date,
    },
    contract: {
      id: row.contract_id,
      typeName: row.contract_type_name,
      typeCode: row.contract_type_code,
      startDate: row.contract_start_date,
      endDate: row.contract_end_date,
    },
  })

  const groupLabel = (sequence: number | null) =>
    sequence == null ? "—" : `Grupo ${toRomanNumeral(sequence)}`

  const deadlineTone = (row: ContractAlertRow) =>
    CONTRACT_ALERT_META[row.alert_state]?.badge ?? "neutral"

  const kpiCards: {
    key: string
    label: string
    value: number
    filter: string
    tone: "primary" | "danger" | "warning" | "info" | "neutral"
    hint?: string
  }[] = [
    {
      key: "attention",
      label: "Requieren atención",
      value: summary.attention,
      filter: "ATTENTION",
      tone: "primary",
      hint: "Determinados con vencimiento en los próximos 30 días o ya vencidos",
    },
    { key: "overdue", label: "Vencidos", value: summary.overdue, filter: "OVERDUE", tone: "danger" },
    {
      key: "today",
      label: "Vence hoy",
      value: summary.dueToday,
      filter: "DUE_TODAY",
      tone: "danger",
    },
    {
      key: "d7",
      label: "Próximos 7 días",
      value: summary.dueIn7,
      filter: "DUE_IN_7",
      tone: "warning",
    },
    { key: "d15", label: "8–15 días", value: summary.dueIn15, filter: "DUE_IN_15", tone: "info" },
    { key: "d30", label: "16–30 días", value: summary.dueIn30, filter: "DUE_IN_30", tone: "info" },
  ]

  if (summary.correction > 0) {
    kpiCards.push({
      key: "correction",
      label: "Requieren corrección",
      value: summary.correction,
      filter: "NO_END_DATE",
      tone: "neutral",
      hint: "Contratos determinados sin fecha de finalización",
    })
  }

  const kpiToneClass: Record<string, string> = {
    primary: "border-sitecorp-primary/40 bg-sitecorp-primary/5",
    danger: "border-sitecorp-danger/30 bg-sitecorp-danger/5",
    warning: "border-sitecorp-warning/30 bg-sitecorp-warning/5",
    info: "border-blue-500/30 bg-blue-500/5",
    neutral: "border-border bg-muted/40",
  }

  const kpiValueClass: Record<string, string> = {
    primary: "text-sitecorp-primary",
    danger: "text-sitecorp-danger",
    warning: "text-sitecorp-warning",
    info: "text-blue-600",
    neutral: "text-ink",
  }

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Vencimientos de contratos"
        description="Contratos por tiempo determinado que requieren seguimiento."
        actions={
          <SiteCorpButton variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
          </SiteCorpButton>
        }
      />

      {error && (
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
      )}

      {loading ? (
        <SiteCorpCard>
          <SiteCorpLoading rows={6} />
        </SiteCorpCard>
      ) : error ? null : (
        <>
          {/* KPIs: rangos excluyentes, sin doble conteo */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {kpiCards.map((kpi) => {
              const active = stateFilter === kpi.filter
              return (
                <button
                  key={kpi.key}
                  type="button"
                  onClick={() => setStateFilter(kpi.filter)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${kpiToneClass[kpi.tone]} ${
                    active ? "ring-2 ring-sitecorp-primary/40" : ""
                  }`}
                >
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${kpiValueClass[kpi.tone]}`}>{kpi.value}</p>
                </button>
              )
            })}
          </div>

          {/* Filtros */}
          <SiteCorpCard>
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Buscar trabajador</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <SiteCorpInput
                      className="pl-9"
                      placeholder="Nombre, apellidos o CI"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Estado de vencimiento</label>
                  <SiteCorpSelect value={stateFilter} onValueChange={setStateFilter}>
                    {CONTRACT_ALERT_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SiteCorpSelect>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Área</label>
                  <SiteCorpSelect value={areaFilter} onValueChange={setAreaFilter}>
                    <option value="ALL">Todas las áreas</option>
                    {filterOptions.areas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </SiteCorpSelect>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Cargo</label>
                  <SiteCorpSelect value={jobFilter} onValueChange={setJobFilter}>
                    <option value="ALL">Todos los cargos</option>
                    {filterOptions.jobs.map((job) => (
                      <option key={job} value={job}>
                        {job}
                      </option>
                    ))}
                  </SiteCorpSelect>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Puesto</label>
                  <SiteCorpSelect value={positionFilter} onValueChange={setPositionFilter}>
                    <option value="ALL">Todos los puestos</option>
                    {filterOptions.positions.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </SiteCorpSelect>
                </div>

                <div className="flex items-end lg:col-span-2">
                  <SiteCorpButton
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setSearch("")
                      setStateFilter("ATTENTION")
                      setAreaFilter("ALL")
                      setJobFilter("ALL")
                      setPositionFilter("ALL")
                    }}
                  >
                    Limpiar filtros
                  </SiteCorpButton>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {visibleRows.length} de {rows.length} contrato(s) mostrado(s). Ordenados por fecha de
                finalización (los vencidos aparecen primero).
              </p>
            </div>
          </SiteCorpCard>

          {rows.length === 0 ? (
            <SiteCorpCard>
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CalendarClock className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-ink">
                  No hay contratos por tiempo determinado que requieran atención.
                </p>
                <p className="text-xs text-muted-foreground">
                  Los contratos por tiempo indeterminado no generan alertas de vencimiento.
                </p>
              </div>
            </SiteCorpCard>
          ) : visibleRows.length === 0 ? (
            <SiteCorpCard>
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ningún contrato coincide con los filtros seleccionados.
              </p>
            </SiteCorpCard>
          ) : (
            <>
              {/* Desktop */}
              <SiteCorpCard className="hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Trabajador</th>
                        <th className="px-3 py-2 font-semibold">CI</th>
                        <th className="px-3 py-2 font-semibold">Área</th>
                        <th className="px-3 py-2 font-semibold">Cargo</th>
                        <th className="px-3 py-2 font-semibold">Puesto</th>
                        <th className="px-3 py-2 font-semibold">Contrato</th>
                        <th className="px-3 py-2 font-semibold">Inicio</th>
                        <th className="px-3 py-2 font-semibold">Fin</th>
                        <th className="px-3 py-2 font-semibold">Grupo / Salario</th>
                        <th className="px-3 py-2 font-semibold">Estado</th>
                        <th className="px-3 py-2 font-semibold">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const salary = salaryOf(row)
                        return (
                          <tr key={row.contract_id} className="border-b border-border/60 align-top">
                            <td className="px-3 py-3">
                              <p className="font-medium text-ink">{row.worker_name}</p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {row.worker_code}
                              </p>
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                              {row.identification}
                            </td>
                            <td className="px-3 py-3 text-ink">{row.area_name || "—"}</td>
                            <td className="px-3 py-3 text-ink">{row.job_name || "—"}</td>
                            <td className="px-3 py-3">
                              <p className="text-ink">{row.position_name || "—"}</p>
                              {row.position_code && (
                                <p className="text-xs text-muted-foreground">{row.position_code}</p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-ink">{row.contract_type_name}</td>
                            <td className="px-3 py-3 text-ink">
                              {formatContractDate(row.contract_start_date)}
                            </td>
                            <td className="px-3 py-3 text-ink">
                              {row.contract_end_date ? (
                                formatContractDate(row.contract_end_date)
                              ) : (
                                <span className="text-sitecorp-warning">
                                  Sin fecha de finalización
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-ink">{groupLabel(row.salary_group_sequence_number)}</p>
                              <p className="text-xs text-muted-foreground">
                                {salary ? formatSalary(salary) : "Sin salario configurado"}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col items-start gap-1">
                                <SiteCorpStatusBadge status={deadlineTone(row)}>
                                  {CONTRACT_ALERT_META[row.alert_state]?.label || "—"}
                                </SiteCorpStatusBadge>
                                <span className="text-xs text-muted-foreground">
                                  {deadlineLabel(row.days_remaining, row.contract_end_date)}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col items-start gap-2">
                                <SiteCorpButton
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() =>
                                    navigate(`/entity/${entityId}/staffing/workers/${row.worker_id}`)
                                  }
                                >
                                  <Eye className="mr-1 h-3.5 w-3.5" /> Ver trabajador
                                </SiteCorpButton>
                                {canManage && row.alert_state !== "NO_END_DATE" && (
                                  <>
                                    <SiteCorpButton
                                      size="sm"
                                      variant="outline"
                                      type="button"
                                      onClick={() => setChangeTarget(buildTarget(row))}
                                    >
                                      <FileSignature className="mr-1 h-3.5 w-3.5" /> Cambiar contrato
                                    </SiteCorpButton>
                                    <SiteCorpButton
                                      size="sm"
                                      variant="outline"
                                      type="button"
                                      onClick={() => setSeparationTarget(buildTarget(row))}
                                    >
                                      <UserMinus className="mr-1 h-3.5 w-3.5" /> Dar de baja
                                    </SiteCorpButton>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </SiteCorpCard>

              {/* Móvil / tablet */}
              <div className="space-y-3 lg:hidden">
                {visibleRows.map((row) => {
                  const salary = salaryOf(row)
                  return (
                    <SiteCorpCard key={row.contract_id}>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-ink">{row.worker_name}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {row.worker_code} · CI {row.identification}
                            </p>
                          </div>
                          <SiteCorpStatusBadge status={deadlineTone(row)}>
                            {CONTRACT_ALERT_META[row.alert_state]?.label || "—"}
                          </SiteCorpStatusBadge>
                        </div>

                        <p className="text-sm text-ink">
                          {row.position_name || "—"}
                          {row.job_name ? ` · ${row.job_name}` : ""}
                          {row.area_name ? ` · ${row.area_name}` : ""}
                        </p>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{row.contract_type_name}</span>
                          <span>
                            {formatContractDate(row.contract_start_date)} →{" "}
                            {row.contract_end_date
                              ? formatContractDate(row.contract_end_date)
                              : "Sin fecha de finalización"}
                          </span>
                          <span>{groupLabel(row.salary_group_sequence_number)}</span>
                          {salary && <span>{formatSalary(salary)}</span>}
                        </div>

                        <p className="flex items-center gap-1.5 text-sm text-ink">
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          {deadlineLabel(row.days_remaining, row.contract_end_date)}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          <SiteCorpButton
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() =>
                              navigate(`/entity/${entityId}/staffing/workers/${row.worker_id}`)
                            }
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" /> Ver trabajador
                          </SiteCorpButton>
                          {canManage && row.alert_state !== "NO_END_DATE" && (
                            <>
                              <SiteCorpButton
                                size="sm"
                                variant="outline"
                                type="button"
                                onClick={() => setChangeTarget(buildTarget(row))}
                              >
                                <FileSignature className="mr-1 h-3.5 w-3.5" /> Cambiar contrato
                              </SiteCorpButton>
                              <SiteCorpButton
                                size="sm"
                                variant="outline"
                                type="button"
                                onClick={() => setSeparationTarget(buildTarget(row))}
                              >
                                <UserMinus className="mr-1 h-3.5 w-3.5" /> Dar de baja
                              </SiteCorpButton>
                            </>
                          )}
                        </div>
                      </div>
                    </SiteCorpCard>
                  )
                })}
              </div>

              {!canManage && (
                <SiteCorpAlert type="info">
                  <span className="flex items-start gap-2">
                    <Users className="mt-0.5 h-4 w-4 shrink-0" />
                    Tiene permiso de lectura: puede consultar los vencimientos y abrir el
                    expediente del trabajador, pero no aplicar cambios contractuales ni bajas.
                  </span>
                </SiteCorpAlert>
              )}
            </>
          )}

          {/* Recordatorio reforzado: la fecha contractual alerta, no ejecuta */}
          <SiteCorpAlert type="warning" title="La alerta no ejecuta ninguna acción automática">
            Alcanzar la fecha de finalización de un contrato por tiempo determinado no da de baja al
            trabajador, no cierra su asignación, no libera el puesto ni crea un nuevo contrato. La
            decisión corresponde a RRHH.
          </SiteCorpAlert>
        </>
      )}

      {/* Cambio de contrato (reutiliza la funcionalidad existente) */}
      {changeTarget?.contract && (
        <ChangeContractDialog
          open={!!changeTarget}
          onOpenChange={(open) => {
            if (!open) setChangeTarget(null)
          }}
          workerId={changeTarget.workerId}
          entityId={entityId as string}
          current={changeTarget.contract}
          workerName={changeTarget.workerName}
          workerIdentification={changeTarget.identification}
          positionId={changeTarget.situation.positionId}
          positionName={changeTarget.situation.positionName}
          jobName={changeTarget.situation.jobName}
          areaName={changeTarget.situation.areaName}
          salaryGroupSequence={changeTarget.situation.groupSequence}
          baseSalaryAmount={changeTarget.situation.salary?.amount ?? null}
          baseSalaryCurrency={changeTarget.situation.salary?.currency_code ?? null}
          onSuccess={() => {
            setChangeTarget(null)
            load()
          }}
        />
      )}

      {/* Baja (reutiliza la funcionalidad existente) */}
      {separationTarget && (
        <SeparateWorkerDialog
          open={!!separationTarget}
          onOpenChange={(open) => {
            if (!open) setSeparationTarget(null)
          }}
          workerId={separationTarget.workerId}
          current={separationTarget.situation}
          onSuccess={() => {
            setSeparationTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}

export default EntityContractAlerts
