import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import RegisterVacationDialog from "@/components/vacations/RegisterVacationDialog"
import { useEntityPermissions } from "@/hooks/use-entity-permissions"
import { useEntityVacationOverview } from "@/hooks/use-vacations"
import {
  VACATION_STATUS_LABELS,
  formatVacationDays,
  type VacationOverviewRow,
  type VacationStatus,
} from "@/lib/vacations"
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarPlus,
  Eye,
  Palmtree,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from "lucide-react"

const statusTone: Record<VacationStatus, "success" | "warning" | "danger"> = {
  NORMAL: "success",
  NEAR_LIMIT: "warning",
  LIMIT_REACHED: "danger",
}

const formatDate = (value: string | null) => {
  if (!value) return "—"
  const [y, m, d] = value.split("-")
  return `${d}/${m}/${y}`
}

const EntityVacations = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { has, loading: permissionsLoading } = useEntityPermissions(entityId)

  const canView = has(["vacations.view", "vacations.manage"])
  const canManage = has(["vacations.manage"])

  const overviewQuery = useEntityVacationOverview(entityId, !permissionsLoading && canView)
  const rows = React.useMemo<VacationOverviewRow[]>(() => overviewQuery.data ?? [], [overviewQuery.data])
  const loading = permissionsLoading || (canView && overviewQuery.isLoading)

  const [search, setSearch] = React.useState("")
  const [areaFilter, setAreaFilter] = React.useState("ALL")
  const [jobFilter, setJobFilter] = React.useState("ALL")
  const [statusFilter, setStatusFilter] = React.useState("ALL")

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dialogWorker, setDialogWorker] = React.useState<VacationOverviewRow | null>(null)

  const filterOptions = React.useMemo(
    () => ({
      areas: Array.from(new Set(rows.map((r) => r.area_name).filter((v): v is string => !!v))).sort(),
      jobs: Array.from(new Set(rows.map((r) => r.job_name).filter((v): v is string => !!v))).sort(),
    }),
    [rows]
  )

  const kpis = React.useMemo(() => {
    const avg = rows.length > 0 ? rows.reduce((sum, r) => sum + r.balance, 0) / rows.length : 0
    return {
      active: rows.length,
      average: avg,
      nearLimit: rows.filter((r) => r.status === "NEAR_LIMIT").length,
      atLimit: rows.filter((r) => r.status === "LIMIT_REACHED").length,
      onVacation: rows.filter((r) => r.active_vacation).length,
    }
  }, [rows])

  const visibleRows = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (areaFilter !== "ALL" && row.area_name !== areaFilter) return false
      if (jobFilter !== "ALL" && row.job_name !== jobFilter) return false
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false
      if (!term) return true
      return row.full_name.toLowerCase().includes(term)
    })
  }, [rows, search, areaFilter, jobFilter, statusFilter])

  const alerts = React.useMemo(
    () => rows.filter((r) => r.status === "NEAR_LIMIT" || r.status === "LIMIT_REACHED"),
    [rows]
  )

  const error = !permissionsLoading && !canView
    ? "No tiene permiso para ver las vacaciones de esta entidad"
    : !entityId
      ? "Parámetros inválidos"
      : overviewQuery.isError
        ? (overviewQuery.error as Error)?.message || "Error al cargar las vacaciones"
        : null

  const dialogWorkers = React.useMemo(
    () => rows.map((r) => ({ id: r.worker_id, full_name: r.full_name, balance: r.balance })),
    [rows]
  )

  const openDialog = (row: VacationOverviewRow | null) => {
    setDialogWorker(row)
    setDialogOpen(true)
  }

  const kpiCards: { key: string; label: string; value: string; icon: React.ReactNode; tone: string }[] = [
    {
      key: "active",
      label: "Trabajadores activos",
      value: String(kpis.active),
      icon: <Users className="h-4 w-4" />,
      tone: "border-border bg-muted/40 text-ink",
    },
    {
      key: "avg",
      label: "Promedio disponible",
      value: `${formatVacationDays(kpis.average)} d`,
      icon: <TrendingUp className="h-4 w-4" />,
      tone: "border-sitecorp-primary/40 bg-sitecorp-primary/5 text-sitecorp-primary",
    },
    {
      key: "near",
      label: "Próximos al límite",
      value: String(kpis.nearLimit),
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: "border-sitecorp-warning/30 bg-sitecorp-warning/5 text-sitecorp-warning",
    },
    {
      key: "limit",
      label: "En límite de 24 días",
      value: String(kpis.atLimit),
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: "border-sitecorp-danger/30 bg-sitecorp-danger/5 text-sitecorp-danger",
    },
    {
      key: "vacation",
      label: "Actualmente de vacaciones",
      value: String(kpis.onVacation),
      icon: <Palmtree className="h-4 w-4" />,
      tone: "border-sitecorp-primary/30 bg-sitecorp-primary/5 text-sitecorp-primary",
    },
  ]

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Vacaciones"
        description="Gestión de saldos, devengos y períodos de vacaciones de los trabajadores."
        actions={
          <div className="flex gap-2">
            <SiteCorpButton
              variant="outline"
              type="button"
              onClick={() => overviewQuery.refetch()}
              disabled={loading}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
            </SiteCorpButton>
            {canManage && (
              <SiteCorpButton type="button" onClick={() => openDialog(null)}>
                <CalendarPlus className="mr-2 h-4 w-4" /> Registrar vacaciones
              </SiteCorpButton>
            )}
          </div>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpiCards.map((kpi) => (
              <div key={kpi.key} className={`rounded-2xl border p-4 ${kpi.tone}`}>
                <div className="flex items-center gap-2 opacity-80">
                  {kpi.icon}
                  <span className="text-xs">{kpi.label}</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Alertas de vacaciones */}
          {alerts.length > 0 && (
            <SiteCorpCard>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-sitecorp-warning" />
                <h3 className="text-base font-semibold text-ink">Alertas de vacaciones</h3>
              </div>
              <div className="space-y-2">
                {alerts.map((row) => (
                  <div
                    key={row.worker_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">{row.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.status === "LIMIT_REACHED"
                          ? "El trabajador ha alcanzado el máximo acumulable de 24 días."
                          : "Alcanzará el máximo acumulable de 24 días en el próximo devengo."}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-ink">
                        {formatVacationDays(row.balance)} d
                      </span>
                      <SiteCorpStatusBadge status={statusTone[row.status]}>
                        {VACATION_STATUS_LABELS[row.status]}
                      </SiteCorpStatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </SiteCorpCard>
          )}

          {/* Filtros */}
          <SiteCorpCard>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Buscar trabajador</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <SiteCorpInput
                    className="pl-9"
                    placeholder="Nombre o apellidos"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
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
                <label className="text-xs text-muted-foreground">Estado de saldo</label>
                <SiteCorpSelect value={statusFilter} onValueChange={setStatusFilter}>
                  <option value="ALL">Todos los estados</option>
                  <option value="NORMAL">Normal</option>
                  <option value="NEAR_LIMIT">Próximo al límite</option>
                  <option value="LIMIT_REACHED">Límite alcanzado</option>
                </SiteCorpSelect>
              </div>
            </div>
          </SiteCorpCard>

          {rows.length === 0 ? (
            <SiteCorpCard>
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Palmtree className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-ink">No hay trabajadores activos</p>
                <p className="text-xs text-muted-foreground">
                  El módulo muestra trabajadores activos de la entidad con su saldo de vacaciones.
                </p>
              </div>
            </SiteCorpCard>
          ) : (
            <>
              {/* Desktop */}
              <SiteCorpCard className="hidden xl:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Trabajador</th>
                        <th className="px-3 py-2 font-semibold">Área</th>
                        <th className="px-3 py-2 font-semibold">Cargo</th>
                        <th className="px-3 py-2 font-semibold">Puesto</th>
                        <th className="px-3 py-2 text-right font-semibold">Saldo disponible</th>
                        <th className="px-3 py-2 text-right font-semibold">Próximo devengo</th>
                        <th className="px-3 py-2 text-right font-semibold">Saldo proyectado</th>
                        <th className="px-3 py-2 font-semibold">Estado</th>
                        <th className="px-3 py-2 font-semibold">Próximas vacaciones</th>
                        <th className="px-3 py-2 font-semibold">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.worker_id} className="border-b border-border/60 align-top">
                          <td className="px-3 py-3 font-medium text-ink">
                            {row.full_name}
                            {row.active_vacation && (
                              <span className="ml-2 inline-flex items-center gap-1 text-xs text-sitecorp-primary">
                                <Palmtree className="h-3 w-3" /> De vacaciones
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-ink">{row.area_name || "—"}</td>
                          <td className="px-3 py-3 text-ink">{row.job_name || "—"}</td>
                          <td className="px-3 py-3 text-ink">{row.position_name || "—"}</td>
                          <td className="px-3 py-3 text-right font-semibold text-ink">
                            {formatVacationDays(row.balance)}
                          </td>
                          <td className="px-3 py-3 text-right text-ink">
                            +{formatVacationDays(row.next_accrual)}
                          </td>
                          <td className="px-3 py-3 text-right text-ink">
                            {formatVacationDays(row.projected_balance)}
                          </td>
                          <td className="px-3 py-3">
                            <SiteCorpStatusBadge status={statusTone[row.status]}>
                              {VACATION_STATUS_LABELS[row.status]}
                            </SiteCorpStatusBadge>
                            {!row.has_schedule && (
                              <p className="mt-1 text-xs text-sitecorp-warning">Sin horario</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-ink">
                            {row.active_vacation ? (
                              <span>Reincorporación {formatDate(
                                row.current_vacation_end
                                  ? new Date(new Date(`${row.current_vacation_end}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
                                  : null
                              )}</span>
                            ) : (
                              formatDate(row.next_vacation_start)
                            )}
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
                                <Eye className="mr-1 h-3.5 w-3.5" /> Ver
                              </SiteCorpButton>
                              {canManage && (
                                <SiteCorpButton
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() => openDialog(row)}
                                >
                                  <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Vacaciones
                                </SiteCorpButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SiteCorpCard>

              {/* Tablet / móvil */}
              <div className="space-y-3 xl:hidden">
                {visibleRows.map((row) => (
                  <SiteCorpCard key={row.worker_id}>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-ink">{row.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[row.position_name, row.job_name, row.area_name]
                              .filter(Boolean)
                              .join(" · ") || "Sin puesto asignado"}
                          </p>
                        </div>
                        <SiteCorpStatusBadge status={statusTone[row.status]}>
                          {VACATION_STATUS_LABELS[row.status]}
                        </SiteCorpStatusBadge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg border border-border p-2">
                          <p className="text-xs text-muted-foreground">Saldo</p>
                          <p className="font-semibold text-ink">{formatVacationDays(row.balance)}</p>
                        </div>
                        <div className="rounded-lg border border-border p-2">
                          <p className="text-xs text-muted-foreground">Próx. devengo</p>
                          <p className="font-semibold text-ink">
                            +{formatVacationDays(row.next_accrual)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border p-2">
                          <p className="text-xs text-muted-foreground">Proyectado</p>
                          <p className="font-semibold text-ink">
                            {formatVacationDays(row.projected_balance)}
                          </p>
                        </div>
                      </div>

                      {row.active_vacation && (
                        <p className="flex items-center gap-1.5 text-sm text-sitecorp-primary">
                          <Palmtree className="h-4 w-4" /> De vacaciones
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <SiteCorpButton
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() =>
                            navigate(`/entity/${entityId}/staffing/workers/${row.worker_id}`)
                          }
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" /> Ver
                        </SiteCorpButton>
                        {canManage && (
                          <SiteCorpButton
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => openDialog(row)}
                          >
                            <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Vacaciones
                          </SiteCorpButton>
                        )}
                      </div>
                    </div>
                  </SiteCorpCard>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                {visibleRows.length} de {rows.length} trabajador(es) mostrado(s).
              </p>
            </>
          )}

          <SiteCorpAlert type="info" title="Cómo se calcula el saldo">
            <span className="flex items-start gap-2">
              <CalendarCheck2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                El saldo se construye con devengos mensuales (según el horario del Puesto), las
                vacaciones registradas y los ajustes. Un período consume los días naturales menos
                los domingos incluidos. El máximo acumulable es de 24 días.
              </span>
            </span>
          </SiteCorpAlert>
        </>
      )}

      <RegisterVacationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entityId={entityId as string}
        workers={dialogWorkers}
        preselectedWorkerId={dialogWorker?.worker_id ?? null}
        preselectedWorkerName={dialogWorker?.full_name ?? null}
        preselectedBalance={dialogWorker?.balance ?? null}
      />
    </div>
  )
}

export default EntityVacations
