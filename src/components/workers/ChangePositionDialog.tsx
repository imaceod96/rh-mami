import * as React from "react"
import { supabase } from "@/lib/supabase"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Label } from "@/components/ui/label"
import { toRomanNumeral } from "@/utils/roman-numerals"
import { showSuccess, showError } from "@/utils/toast"
import {
  resolveApplicableScaleId,
  fetchSalaryValuesForGroups,
  salaryForGroup,
  formatSalary,
  type SalaryValue,
} from "@/lib/salary"
import { ArrowRight, AlertTriangle, FileSignature, Info } from "lucide-react"
import { PositionWorkInfoReadOnly } from "@/components/positions/PositionWorkInfoReadOnly"
import {
  fetchEntityScheduleSegments,
  type PositionScheduleSegment,
} from "@/lib/position-schedule"
import { AddendumChangesList } from "@/components/addendums/AddendumChangesList"
import { RepresentativeSelect } from "@/components/representatives/RepresentativeSelect"
import {
  changeWorkerPosition,
  previewPositionChange,
  type PositionChangePreview,
} from "@/lib/addendums"
import { formatConditionDate } from "@/lib/contract-conditions"

interface PositionRow {
  id: string
  name: string
  code: string | null
  is_active: boolean
  authorized_quantity: number
  // Fase 11A.3: información laboral del puesto (solo lectura)
  work_location: string | null
  daily_hours: number | null
  weekly_hours: number | null
  monthly_hours: number | null
  break_minutes: number | null
  schedule_notes: string | null
  job: {
    id: string
    name: string
    area: { id: string; name: string } | null
    salary_group: { id: string; salary_scale_id: string; sequence_number: number } | null
  } | null
}

export interface WorkerCurrentSituation {
  positionId: string | null
  positionName: string | null
  positionCode: string | null
  jobName: string | null
  areaName: string | null
  groupSequence: number | null
  salary: SalaryValue | null
  startDate: string | null
}

interface ChangePositionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workerId: string
  entityId: string
  current: WorkerCurrentSituation
  onSuccess: () => void
}

const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const groupLabel = (sequence: number | null | undefined) =>
  sequence == null ? "—" : `Grupo ${toRomanNumeral(sequence)}`

const salaryLabel = (value: SalaryValue | null, hasGroup: boolean) => {
  if (value) return formatSalary(value)
  if (hasGroup) return "Salario no configurado"
  return "—"
}

const ChangePositionDialog: React.FC<ChangePositionDialogProps> = ({
  open,
  onOpenChange,
  workerId,
  entityId,
  current,
  onSuccess,
}) => {
  const [positions, setPositions] = React.useState<PositionRow[]>([])
  const [occupancy, setOccupancy] = React.useState<Record<string, number>>({})
  const [applicableScaleId, setApplicableScaleId] = React.useState<string | null>(null)
  const [salaryValuesByGroup, setSalaryValuesByGroup] = React.useState<
    Record<string, SalaryValue | null>
  >({})
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [selectedPositionId, setSelectedPositionId] = React.useState("")
  const [effectiveDate, setEffectiveDate] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [segmentsByPosition, setSegmentsByPosition] = React.useState<
    Record<string, PositionScheduleSegment[]>
  >({})

  // Fase 11A.6: diferencias contractuales y anexo
  const [preview, setPreview] = React.useState<PositionChangePreview | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const [createAddendum, setCreateAddendum] = React.useState(true)
  const [formalizeNow, setFormalizeNow] = React.useState(false)
  const [signatureDate, setSignatureDate] = React.useState("")
  const [signaturePlace, setSignaturePlace] = React.useState("")
  const [representativeAssignmentId, setRepresentativeAssignmentId] = React.useState<string | null>(
    null
  )

  const loadPositions = React.useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error: posError } = await supabase
        .from("organization_positions")
        .select(
          `id, name, code, is_active, authorized_quantity,
           work_location, daily_hours, weekly_hours, monthly_hours, break_minutes, schedule_notes,
           job:organization_jobs(
             id, name, code, is_active, area_id,
             area:organization_areas(id, name),
             salary_group:salary_groups(id, salary_scale_id, sequence_number)
           )`
        )
        .eq("organization_entity_id", entityId)
        .order("name")
      if (posError) throw posError

      const mapped = ((data as any[]) || []).map((p: any) => ({
        ...p,
        job: p.job
          ? {
              ...p.job,
              area: p.job.area
                ? { id: p.job.area[0]?.id || null, name: p.job.area[0]?.name || null }
                : null,
            }
          : null,
      })) as PositionRow[]
      setPositions(mapped)

      // Fase 11A.3: horarios habituales de los puestos (solo lectura)
      setSegmentsByPosition(await fetchEntityScheduleSegments(entityId))

      // Ocupación: asignación actual con trabajador activo (mismo patrón que la Plantilla Operativa)
      const { data: workersData, error: workersError } = await supabase
        .from("workers")
        .select(
          "employment_status, assignments:worker_position_assignments(position_id, is_current, end_date)"
        )
        .eq("organization_entity_id", entityId)
        .eq("employment_status", "active")
      if (workersError) throw workersError

      const counts: Record<string, number> = {}
      ;((workersData as any[]) || []).forEach((w: any) => {
        ;((w.assignments as any[]) || []).forEach((a: any) => {
          if (a.is_current && !a.end_date) {
            counts[a.position_id] = (counts[a.position_id] || 0) + 1
          }
        })
      })
      setOccupancy(counts)

      setApplicableScaleId(await resolveApplicableScaleId(entityId))
      const groupIds = mapped
        .map((p) => p.job?.salary_group?.id)
        .filter((id): id is string => !!id)
      setSalaryValuesByGroup(await fetchSalaryValuesForGroups(groupIds))
    } catch (err) {
      console.error("Error loading positions for change:", err)
      setLoadError("No se pudieron cargar los puestos disponibles.")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    if (!open) return
    setSelectedPositionId("")
    setEffectiveDate("")
    setReason("")
    setNotes("")
    setError(null)
    setOccupancy({})
    setPreview(null)
    setPreviewError(null)
    setCreateAddendum(true)
    setFormalizeNow(false)
    setSignatureDate("")
    setSignaturePlace("")
    setRepresentativeAssignmentId(null)
    loadPositions()
  }, [open, loadPositions])

  const selectable = React.useMemo(
    () =>
      positions.filter(
        (p) =>
          p.is_active &&
          p.id !== current.positionId &&
          (occupancy[p.id] || 0) < (p.authorized_quantity || 0)
      ),
    [positions, occupancy, current.positionId]
  )

  const selected = React.useMemo(
    () => positions.find((p) => p.id === selectedPositionId) || null,
    [positions, selectedPositionId]
  )

  const selectedGroup = selected?.job?.salary_group || null
  const selectedSalary = salaryForGroup(applicableScaleId, selectedGroup, salaryValuesByGroup)

  const minDate = current.startDate ? addDays(current.startDate, 1) : undefined

  // Fase 11A.6: diferencias contractuales calculadas en el backend (§21/§22)
  React.useEffect(() => {
    if (!open || !selectedPositionId || !effectiveDate) {
      setPreview(null)
      setPreviewError(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)

    previewPositionChange({ workerId, newPositionId: selectedPositionId, effectiveDate })
      .then((result) => {
        if (cancelled) return
        setPreview(result)
        // Sin contrato vigente no puede existir un anexo: nunca se crea uno huérfano
        setCreateAddendum(result.has_contractual_changes && !!result.employment_contract_id)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Error previewing position change:", err)
        setPreview(null)
        setPreviewError(
          err instanceof Error
            ? err.message
            : "No se pudieron calcular las diferencias contractuales."
        )
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, selectedPositionId, effectiveDate, workerId])

  const handleSubmit = async () => {
    setError(null)

    if (!selectedPositionId) {
      setError("Selecciona un nuevo puesto.")
      return
    }
    if (!effectiveDate) {
      setError("La fecha efectiva es obligatoria.")
      return
    }
    if (current.startDate && effectiveDate <= current.startDate) {
      setError("La fecha efectiva debe ser posterior al inicio del puesto actual.")
      return
    }
    if (previewLoading) {
      setError("Espere a que se calculen las diferencias contractuales.")
      return
    }
    const withAddendum = createAddendum && !!preview?.has_contractual_changes
    if (withAddendum && formalizeNow) {
      if (!signatureDate) {
        setError("La fecha de firma es obligatoria para formalizar el anexo.")
        return
      }
      if (!signaturePlace.trim()) {
        setError("El lugar de firma es obligatorio para formalizar el anexo.")
        return
      }
      if (!representativeAssignmentId) {
        setError("Seleccione el representante vigente en la fecha de firma del anexo.")
        return
      }
    }

    setSubmitting(true)
    try {
      const result = await changeWorkerPosition({
        workerId,
        newPositionId: selectedPositionId,
        effectiveDate,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        createAddendum: withAddendum,
        reasonCode: "POSITION_CHANGE",
        signatureDate: withAddendum && formalizeNow ? signatureDate : null,
        signaturePlace: withAddendum && formalizeNow ? signaturePlace : null,
        representativeAssignmentId: withAddendum && formalizeNow ? representativeAssignmentId : null,
        requireFormalized: withAddendum && formalizeNow,
      })

      const addendumStatus = result.addendum?.addendum_status
      const addendumNumber = result.addendum?.addendum_number

      showSuccess(
        addendumStatus === "FORMALIZED"
          ? `Cambio de puesto realizado. Anexo Nº ${addendumNumber} formalizado.`
          : addendumNumber
            ? `Cambio de puesto realizado. Anexo Nº ${addendumNumber} pendiente de formalizar.`
            : result.addendum_skipped === "NO_CONTRACT"
              ? "Cambio de puesto realizado. No se registró anexo: el trabajador no tiene un contrato vigente."
              : "Cambio de puesto realizado correctamente."
      )
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      let friendly = "No se pudo completar el cambio de puesto."
      if (/vacantes/i.test(msg)) {
        friendly = "El puesto seleccionado ya no tiene vacantes disponibles."
      } else if (/no est[aá] activo/i.test(msg)) {
        friendly = "El puesto seleccionado no está activo."
      } else if (/no pertenece a la entidad/i.test(msg)) {
        friendly = "El puesto seleccionado no pertenece a la entidad del trabajador."
      } else if (/posterior al inicio/i.test(msg)) {
        friendly = "La fecha efectiva debe ser posterior al inicio del puesto actual."
      } else if (/ya ocupa/i.test(msg)) {
        friendly = "El trabajador ya ocupa ese puesto."
      } else if (/Datos pendientes/i.test(msg)) {
        friendly = msg
      } else if (/contrato vigente/i.test(msg)) {
        friendly =
          "El trabajador no tiene un contrato vigente: no se puede registrar el anexo contractual."
      } else if (/permiso/i.test(msg)) {
        friendly = "No tiene permiso para realizar movimientos de trabajadores."
      } else if (msg) {
        friendly = msg
      }
      setError(friendly)
      showError(friendly)
    } finally {
      setSubmitting(false)
    }
  }

  const hasChanges = !!preview?.has_contractual_changes
  const addendumWillBeCreated = createAddendum && hasChanges

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Cambiar de puesto</DialogTitle>
          <DialogDescription>
            Se cerrará el puesto actual y se creará una nueva asignación, conservando la trayectoria
            laboral del trabajador. Si el cambio modifica condiciones contractuales se prepara un
            anexo al contrato vigente.
          </DialogDescription>
        </DialogHeader>

        {loadError && <SiteCorpAlert type="danger">{loadError}</SiteCorpAlert>}

        {/* Situación actual */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Situación actual
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Área</dt>
              <dd className="text-sm font-medium text-ink">{current.areaName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cargo</dt>
              <dd className="text-sm font-medium text-ink">{current.jobName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Puesto</dt>
              <dd className="text-sm font-medium text-ink">
                {current.positionName || "—"}
                {current.positionCode ? (
                  <span className="ml-1 text-xs text-muted-foreground">{current.positionCode}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Grupo salarial</dt>
              <dd className="text-sm font-medium text-ink">{groupLabel(current.groupSequence)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Salario de referencia</dt>
              <dd className="text-sm font-medium text-ink">
                {salaryLabel(current.salary, current.groupSequence != null)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Selección del nuevo puesto */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nuevo puesto *</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando puestos…</p>
            ) : selectable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay puestos con vacantes disponibles en esta entidad.
              </p>
            ) : (
              <SiteCorpSelect
                value={selectedPositionId}
                onValueChange={(v) => setSelectedPositionId(v)}
              >
                <option value="">Seleccionar puesto</option>
                {selectable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.job ? ` · ${p.job.name}` : ""} (
                    {occupancy[p.id] || 0}/{p.authorized_quantity})
                  </option>
                ))}
              </SiteCorpSelect>
            )}
          </div>

          {/* Comparación Actual / Nueva */}
          {selected && (
            <div className="rounded-xl border border-border p-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Actual
                  </p>
                  <dl className="space-y-1.5">
                    <div>
                      <dt className="text-xs text-muted-foreground">Área</dt>
                      <dd className="text-sm text-ink">{current.areaName || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Cargo</dt>
                      <dd className="text-sm text-ink">{current.jobName || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Puesto</dt>
                      <dd className="text-sm text-ink">{current.positionName || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Grupo salarial</dt>
                      <dd className="text-sm text-ink">{groupLabel(current.groupSequence)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Salario</dt>
                      <dd className="text-sm text-ink">
                        {salaryLabel(current.salary, current.groupSequence != null)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="hidden justify-center sm:flex">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sitecorp-primary/10 text-sitecorp-primary">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>

                <div className="rounded-lg bg-sitecorp-primary/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sitecorp-primary">
                    Nueva
                  </p>
                  <dl className="space-y-1.5">
                    <div>
                      <dt className="text-xs text-muted-foreground">Área</dt>
                      <dd className="text-sm font-medium text-ink">
                        {selected.job?.area?.name || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Cargo</dt>
                      <dd className="text-sm font-medium text-ink">{selected.job?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Puesto</dt>
                      <dd className="text-sm font-medium text-ink">{selected.name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Grupo salarial</dt>
                      <dd className="text-sm font-medium text-ink">
                        {groupLabel(selectedGroup?.sequence_number)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Salario</dt>
                      <dd className="text-sm font-medium text-ink">
                        {salaryLabel(selectedSalary, !!selectedGroup)}
                      </dd>
                    </div>
                  </dl>
                  {selectedGroup && !selectedSalary && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-sitecorp-warning">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      El grupo salarial del nuevo cargo no tiene importe configurado en la escala
                      aplicable.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ocupación: {occupancy[selected.id] || 0}/{selected.authorized_quantity} ·{" "}
                    {Math.max(
                      0,
                      (selected.authorized_quantity || 0) - (occupancy[selected.id] || 0)
                    )}{" "}
                    vacante(s)
                  </p>
                </div>
              </div>

              {/* Fase 11A.3: configuración estructural del nuevo puesto (solo lectura) */}
              <PositionWorkInfoReadOnly
                className="mt-3"
                title="Información laboral del nuevo puesto"
                workLocation={selected.work_location}
                dailyHours={selected.daily_hours}
                weeklyHours={selected.weekly_hours}
                monthlyHours={selected.monthly_hours}
                breakMinutes={selected.break_minutes}
                scheduleNotes={selected.schedule_notes}
                segments={segmentsByPosition[selected.id] || []}
              />
            </div>
          )}

          {/* Fecha efectiva */}
          <div className="space-y-2">
            <Label>Fecha efectiva *</Label>
            <SiteCorpInput
              type="date"
              value={effectiveDate}
              min={minDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Inicio del nuevo puesto. El puesto actual finalizará el día anterior. Es también la
              fecha de vigencia del anexo.
            </p>
          </div>

          {/* Diferencias contractuales (Fase 11A.6) */}
          {selected && !effectiveDate ? (
            <SiteCorpAlert type="info">
              Indique la fecha efectiva para calcular las diferencias contractuales del cambio.
            </SiteCorpAlert>
          ) : selectedPositionId && effectiveDate && previewLoading ? (
            <p className="text-sm text-muted-foreground">
              Calculando diferencias contractuales…
            </p>
          ) : previewError ? (
            <SiteCorpAlert type="danger">{previewError}</SiteCorpAlert>
          ) : preview ? (
            <>
              {hasChanges ? (
                <AddendumChangesList
                  changes={preview.changes}
                  description="Condiciones del contrato vigente que cambian con este movimiento. Sólo se muestran los campos que cambian."
                />
              ) : (
                <SiteCorpAlert type="info" title="Sin cambios contractuales">
                  Este cambio no modifica condiciones contractuales representables: no se creará
                  ningún anexo.
                </SiteCorpAlert>
              )}

              {hasChanges && !preview.employment_contract_id && (
                <SiteCorpAlert type="warning" title="Sin contrato vigente">
                  El trabajador no tiene un contrato vigente sobre el que formalizar el anexo: el
                  cambio de puesto se realizará sin registrar anexo.
                </SiteCorpAlert>
              )}

              {hasChanges && (
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-input"
                      checked={createAddendum}
                      disabled={!preview.employment_contract_id}
                      onChange={(e) => setCreateAddendum(e.target.checked)}
                    />
                    <span>
                      Generar anexo al contrato vigente
                      <span className="block text-xs text-muted-foreground">
                        El anexo se registra en la misma operación del cambio de puesto. Si no se
                        formaliza ahora, queda pendiente de firma.
                      </span>
                    </span>
                  </label>

                  {createAddendum && (
                    <>
                      <label className="flex items-start gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-input"
                          checked={formalizeNow}
                          onChange={(e) => setFormalizeNow(e.target.checked)}
                        />
                        <span>
                          Formalizar ahora (fecha de firma, lugar y representante)
                          <span className="block text-xs text-muted-foreground">
                            Firmar después es válido: el anexo quedará pendiente y podrá formalizarse
                            desde la ficha del trabajador.
                          </span>
                        </span>
                      </label>

                      {formalizeNow && (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Fecha de firma *</Label>
                              <SiteCorpInput
                                type="date"
                                value={signatureDate}
                                onChange={(e) => setSignatureDate(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Lugar de firma *</Label>
                              <SiteCorpInput
                                value={signaturePlace}
                                onChange={(e) => setSignaturePlace(e.target.value)}
                                placeholder="Ej.: La Habana"
                              />
                            </div>
                          </div>
                          <RepresentativeSelect
                            entityId={entityId}
                            onDate={signatureDate}
                            value={representativeAssignmentId}
                            onChange={setRepresentativeAssignmentId}
                            canManage
                            label="Representante que suscribe el anexo *"
                            dateHint={`Representante vigente en la fecha de firma${
                              signatureDate ? ` (${formatConditionDate(signatureDate)})` : ""
                            }.`}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          ) : null}

          {/* Motivo */}
          <div className="space-y-2">
            <Label>Motivo</Label>
            <SiteCorpInput
              value={reason}
              placeholder="Promoción interna, reorganización, necesidad del servicio…"
              onChange={(e) => setReason(e.target.value)}
            />
            {addendumWillBeCreated && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileSignature className="h-3.5 w-3.5" />
                El anexo quedará registrado como «Cambio de puesto» en el contrato vigente.
              </p>
            )}
          </div>

          {/* Observaciones */}
          <div className="space-y-2">
            <Label>Observaciones</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sitecorp-primary"
              placeholder="Opcional"
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La asignación anterior se cierra y la nueva se crea en una sola transacción: si algo
              falla, no se aplica ningún cambio.
            </p>
          </div>

          {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <SiteCorpButton variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </SiteCorpButton>
          <SiteCorpButton
            type="button"
            onClick={handleSubmit}
            disabled={submitting || loading || selectable.length === 0 || previewLoading}
          >
            {submitting ? "Procesando…" : "Confirmar cambio de puesto"}
          </SiteCorpButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ChangePositionDialog
