import * as React from "react"
import { useParams } from "react-router-dom"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { useEntityPermissions } from "@/hooks/use-entity-permissions"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SelectItem } from "@/components/ui/select"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { FileSpreadsheet, RefreshCw, Lock, Unlock, Eye } from "lucide-react"
import WorkerPrenominaDialog from "@/components/prenomina/WorkerPrenominaDialog"
import {
  MONTH_LABELS,
  PRENOMINA_STATUS_LABELS,
  academicCategoryLabel,
  type PrenominaPeriod,
  type PrenominaWorkerEntry,
  type PrenominaNightEntry,
  buildPrenominaFileName,
  buildPrenominaWorkbookBlob,
  closePrenominaPeriod,
  createPrenominaPeriod,
  deletePrenominaNight,
  fetchPrenominaEntries,
  fetchPrenominaNights,
  fetchPrenominaPeriod,
  fetchPrenominaPeriodTotals,
  fetchPrenominaPeriods,
  formatMoney,
  refreshPrenominaWorkers,
  reopenPrenominaPeriod,
  savePrenominaExcelBlob,
  savePrenominaInputs,
  savePrenominaNight,
} from "@/lib/prenomina"

interface SaveNightInput {
  id: string | null
  start: string
  end: string
  nights: number
}

const EntityPrenomina = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const { currentEntity } = useCurrentEntity()
  const { permissions, loading: permissionsLoading } = useEntityPermissions(entityId)

  const canView = permissions.includes("prenomina.view") || permissions.includes("prenomina.manage")
  const canManage = permissions.includes("prenomina.manage")

  const now = new Date()
  const [year, setYear] = React.useState(now.getFullYear())
  const [month, setMonth] = React.useState(now.getMonth() + 1)

  const [periods, setPeriods] = React.useState<PrenominaPeriod[]>([])
  const [totals, setTotals] = React.useState<Record<string, number>>({})
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string | null>(null)
  const [period, setPeriod] = React.useState<PrenominaPeriod | null>(null)
  const [entries, setEntries] = React.useState<PrenominaWorkerEntry[]>([])
  const [nightsByEntry, setNightsByEntry] = React.useState<Record<string, PrenominaNightEntry[]>>({})

  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<{ type: "success" | "danger" | "info"; message: string } | null>(null)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [activeEntry, setActiveEntry] = React.useState<PrenominaWorkerEntry | null>(null)

  const entityName = currentEntity?.name || ""

  const yearOptions = React.useMemo(() => {
    const base = new Date().getFullYear()
    return [base - 2, base - 1, base, base + 1]
  }, [])

  const showNotice = (type: "success" | "danger" | "info", message: string) => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 5000)
  }

  const loadPeriods = React.useCallback(async () => {
    if (!entityId) return
    const [list, totalsMap] = await Promise.all([
      fetchPrenominaPeriods(entityId),
      fetchPrenominaPeriodTotals(entityId),
    ])
    setPeriods(list)
    setTotals(totalsMap)
  }, [entityId])

  const loadDetail = React.useCallback(async (periodId: string) => {
    const [p, list] = await Promise.all([
      fetchPrenominaPeriod(periodId),
      fetchPrenominaEntries(periodId),
    ])
    setPeriod(p)
    setEntries(list)
    const nightMap = await fetchPrenominaNights(list.map((e) => e.id))
    setNightsByEntry(nightMap)
  }, [])

  const loadInitial = React.useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    setError(null)
    try {
      await loadPeriods()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la prenómina")
    } finally {
      setLoading(false)
    }
  }, [entityId, loadPeriods])

  React.useEffect(() => {
    if (!canView) return
    loadInitial()
  }, [canView, loadInitial])

  const reloadSelected = React.useCallback(async () => {
    if (selectedPeriodId) {
      await loadDetail(selectedPeriodId)
    }
    await loadPeriods()
  }, [selectedPeriodId, loadDetail, loadPeriods])

  const handleOpenOrCreate = async () => {
    if (!entityId) return
    setBusy(true)
    setError(null)
    try {
      const id = await createPrenominaPeriod(entityId, year, month)
      setSelectedPeriodId(id)
      await loadDetail(id)
      await loadPeriods()
      showNotice("success", `Prenómina de ${MONTH_LABELS[month - 1]} ${year} abierta`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la prenómina")
    } finally {
      setBusy(false)
    }
  }

  const handleOpenExisting = async (periodId: string) => {
    setBusy(true)
    setError(null)
    try {
      setSelectedPeriodId(periodId)
      await loadDetail(periodId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la prenómina")
    } finally {
      setBusy(false)
    }
  }

  const handleRefreshWorkers = async () => {
    if (!selectedPeriodId) return
    setBusy(true)
    setError(null)
    try {
      const added = await refreshPrenominaWorkers(selectedPeriodId)
      await reloadSelected()
      showNotice("success", added > 0 ? `Se añadieron ${added} trabajador(es)` : "Datos base actualizados")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron actualizar los trabajadores")
    } finally {
      setBusy(false)
    }
  }

  const handleClose = async () => {
    if (!selectedPeriodId) return
    setBusy(true)
    setError(null)
    try {
      await closePrenominaPeriod(selectedPeriodId)
      await reloadSelected()
      showNotice("success", "Prenómina cerrada")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la prenómina")
    } finally {
      setBusy(false)
    }
  }

  const handleReopen = async () => {
    if (!selectedPeriodId) return
    setBusy(true)
    setError(null)
    try {
      await reopenPrenominaPeriod(selectedPeriodId)
      await reloadSelected()
      showNotice("info", "Prenómina reabierta (borrador)")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reabrir la prenómina")
    } finally {
      setBusy(false)
    }
  }

  const handleSaveEntry = async (
    workedDays: number,
    nights: SaveNightInput[],
    deletedNightIds: string[]
  ) => {
    if (!activeEntry) return
    await savePrenominaInputs(activeEntry.id, workedDays, activeEntry.salary_scale_amount, activeEntry.workday_hours)
    for (const id of deletedNightIds) {
      await deletePrenominaNight(id)
    }
    for (const night of nights) {
      await savePrenominaNight(activeEntry.id, night.id, night.start, night.end, night.nights)
    }
    await reloadSelected()
    showNotice("success", "Detalle guardado")
  }

  const handleExport = async () => {
    if (!period) return
    setBusy(true)
    setError(null)
    try {
      const blob = await buildPrenominaWorkbookBlob(entries, nightsByEntry, {
        entityName,
        year: period.period_year,
        month: period.period_month,
        status: period.status,
        generatedAt: new Date(),
      })
      savePrenominaExcelBlob(blob, buildPrenominaFileName(entityName, period.period_year, period.period_month))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el Excel")
    } finally {
      setBusy(false)
    }
  }

  const grandTotal = React.useMemo(
    () => entries.reduce((acc, e) => acc + Number(e.total_payment || 0), 0),
    [entries]
  )

  const grandTenure = React.useMemo(
    () => entries.reduce((acc, e) => acc + Number(e.tenure_payment || 0), 0),
    [entries]
  )

  const tenureIssues = React.useMemo(
    () => entries.filter((e) => e.tenure_status !== "OK").length,
    [entries]
  )

  const academicIssues = React.useMemo(
    () => entries.filter((e) => e.academic_status !== "OK").length,
    [entries]
  )

  const grandAcademic = React.useMemo(
    () => entries.reduce((acc, e) => acc + Number(e.academic_payment || 0), 0),
    [entries]
  )

  if (permissionsLoading || loading) {
    return <SiteCorpLoading />
  }

  if (!canView) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Prenómina" description="Preparación mensual del pago de trabajadores" />
        <SiteCorpAlert type="info">No tiene permiso para ver la prenómina de esta entidad.</SiteCorpAlert>
      </div>
    )
  }

  const readOnly = period?.status === "CERRADA"

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Prenómina"
        description={`Preparación mensual del pago · ${entityName}`}
      />

      {notice && <SiteCorpAlert type={notice.type}>{notice.message}</SiteCorpAlert>}
      {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}

      {/* Selector de período */}
      <SiteCorpCard>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ink border-b pb-2">Período</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <SiteCorpSelect label="Mes" value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              {MONTH_LABELS.map((label, index) => (
                <SelectItem key={label} value={String(index + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SiteCorpSelect>
            <SiteCorpSelect label="Año" value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SiteCorpSelect>
            <div className="flex items-end">
              <SiteCorpButton onClick={handleOpenOrCreate} disabled={busy || !canManage} className="w-full">
                Abrir / Crear prenómina
              </SiteCorpButton>
            </div>
          </div>
        </div>
      </SiteCorpCard>

      {/* Histórico */}
      <SiteCorpCard>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ink border-b pb-2">Períodos anteriores</h3>
          {periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay períodos de prenómina.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Año</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Fecha cierre</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{MONTH_LABELS[p.period_month - 1]}</TableCell>
                    <TableCell>{p.period_year}</TableCell>
                    <TableCell>
                      <SiteCorpStatusBadge status={p.status === "CERRADA" ? "success" : "info"}>
                        {PRENOMINA_STATUS_LABELS[p.status]}
                      </SiteCorpStatusBadge>
                    </TableCell>
                    <TableCell>{formatMoney(totals[p.id] || 0)}</TableCell>
                    <TableCell>
                      {p.closed_at ? new Date(p.closed_at).toLocaleDateString("es-CU") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <SiteCorpButton
                        variant="outline"
                        onClick={() => handleOpenExisting(p.id)}
                        disabled={busy}
                      >
                        <Eye className="mr-2 h-4 w-4" /> Abrir
                      </SiteCorpButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SiteCorpCard>

      {/* Detalle del período seleccionado */}
      {period && (
        <SiteCorpCard>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-ink">
                  {MONTH_LABELS[period.period_month - 1]} {period.period_year}
                </h3>
                <SiteCorpStatusBadge status={readOnly ? "success" : "info"}>
                  {PRENOMINA_STATUS_LABELS[period.status]}
                </SiteCorpStatusBadge>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManage && !readOnly && (
                  <SiteCorpButton variant="outline" onClick={handleRefreshWorkers} disabled={busy}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Actualizar trabajadores
                  </SiteCorpButton>
                )}
                {canManage && !readOnly && (
                  <SiteCorpButton variant="outline" onClick={handleClose} disabled={busy}>
                    <Lock className="mr-2 h-4 w-4" /> Cerrar prenómina
                  </SiteCorpButton>
                )}
                {canManage && readOnly && (
                  <SiteCorpButton variant="outline" onClick={handleReopen} disabled={busy}>
                    <Unlock className="mr-2 h-4 w-4" /> Reabrir
                  </SiteCorpButton>
                )}
                <SiteCorpButton onClick={handleExport} disabled={busy}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
                </SiteCorpButton>
              </div>
            </div>

            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay trabajadores activos en esta prenómina.
              </p>
            ) : (
              <>
                {tenureIssues > 0 && (
                  <SiteCorpAlert type="warning">
                    {tenureIssues} trabajador(es) con antigüedad pendiente: sin fecha de
                    incorporación o sin tramo de la escala de antigüedad. Corrige la ficha del
                    trabajador o configura la Escala de pago de antigüedad; la prenómina no podrá
                    cerrarse hasta resolverlo.
                  </SiteCorpAlert>
                )}

                {academicIssues > 0 && (
                  <SiteCorpAlert type="warning">
                    {academicIssues} trabajador(es) con categoría académica (Máster/Doctor) sin
                    importe configurado. Configura el Pago por categoría académica de la entidad; la
                    prenómina no podrá cerrarse hasta resolverlo. Deja el importe vacío para «no
                    configurado»; un 0 explícito es válido.
                  </SiteCorpAlert>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trabajador</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Puesto</TableHead>
                      <TableHead>Grupo escala</TableHead>
                      <TableHead>Salario escala</TableHead>
                      <TableHead>Días trabajados</TableHead>
                      <TableHead>Horas calculadas</TableHead>
                      <TableHead>Pago salario escala</TableHead>
                      <TableHead>Antigüedad</TableHead>
                      <TableHead>
                        <span title="Pago por categoría académica: se añade automáticamente (Máster o Doctor).">
                          Pago categoría académica
                        </span>
                      </TableHead>
                      <TableHead>Nocturnidad</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead className="text-right">Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium text-ink">{entry.worker_name_snapshot}</TableCell>
                        <TableCell>{entry.job_name_snapshot || "—"}</TableCell>
                        <TableCell>{entry.position_name_snapshot || "—"}</TableCell>
                        <TableCell>{entry.salary_group_sequence ?? "—"}</TableCell>
                        <TableCell>
                          {entry.salary_scale_amount !== null ? (
                            formatMoney(entry.salary_scale_amount)
                          ) : (
                            <span className="text-sitecorp-danger">Sin salario escala configurado</span>
                          )}
                        </TableCell>
                        <TableCell>{entry.worked_days}</TableCell>
                        <TableCell>{entry.worked_hours}</TableCell>
                        <TableCell>{formatMoney(entry.scale_salary_payment)}</TableCell>
                        <TableCell>
                          {entry.tenure_status === "NO_START_DATE" ? (
                            <span className="text-xs font-medium text-sitecorp-danger">
                              Sin fecha de incorporación
                            </span>
                          ) : entry.tenure_status === "NO_BAND" ? (
                            <span className="text-xs font-medium text-sitecorp-danger">
                              Sin tramo de antigüedad configurado
                            </span>
                          ) : (
                            <span
                              title={`${entry.tenure_band_label || ""} · ${
                                entry.tenure_years ?? 0
                              } año(s)`}
                            >
                              {formatMoney(entry.tenure_payment)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.academic_status !== "OK" ? (
                            <span className="text-xs font-medium text-sitecorp-danger">
                              Sin importe configurado
                            </span>
                          ) : entry.academic_monthly_amount === null ? (
                            <span className="text-muted-foreground">{formatMoney(0)}</span>
                          ) : (
                            <span
                              title={`${academicCategoryLabel(entry.academic_category)} · ${
                                entry.academic_monthly_amount
                              } CUP/mes`}
                            >
                              {formatMoney(entry.academic_payment)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{formatMoney(entry.total_night_payment)}</TableCell>
                        <TableCell className="font-medium text-ink">{formatMoney(entry.total_payment)}</TableCell>
                        <TableCell className="text-right">
                          <SiteCorpButton
                            variant="outline"
                            onClick={() => {
                              setActiveEntry(entry)
                              setDialogOpen(true)
                            }}
                          >
                            {readOnly ? "Ver" : "Editar"}
                          </SiteCorpButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex flex-wrap items-center justify-end gap-4 border-t pt-4">
                  <div className="rounded-xl border border-border px-5 py-3">
                    <span className="text-sm text-muted-foreground">Total antigüedad: </span>
                    <span className="text-base font-semibold text-ink">
                      {formatMoney(grandTenure)} {entries[0]?.salary_currency || "CUP"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border px-5 py-3">
                    <span className="text-sm text-muted-foreground">Total categoría académica: </span>
                    <span className="text-base font-semibold text-ink">
                      {formatMoney(grandAcademic)} {entries[0]?.salary_currency || "CUP"}
                    </span>
                  </div>
                  <div className="rounded-xl border-2 border-sitecorp-primary/30 bg-sitecorp-primary/5 px-5 py-3">
                    <span className="text-sm text-muted-foreground">TOTAL PRENÓMINA: </span>
                    <span className="text-lg font-semibold text-ink">
                      {formatMoney(grandTotal)} {entries[0]?.salary_currency || "CUP"}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </SiteCorpCard>
      )}

      <WorkerPrenominaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={activeEntry}
        nights={activeEntry ? nightsByEntry[activeEntry.id] || [] : []}
        readOnly={readOnly || !canManage}
        onSave={handleSaveEntry}
      />
    </div>
  )
}

export default EntityPrenomina