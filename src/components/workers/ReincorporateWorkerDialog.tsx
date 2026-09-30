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
import { RepresentativeSelect } from "@/components/representatives/RepresentativeSelect"
import type { RepresentativePositionRow } from "@/lib/representatives"
import { PositionWorkInfoReadOnly } from "@/components/positions/PositionWorkInfoReadOnly"
import {
  ContractFormalizationAlerts,
  EMPTY_FORMALIZATION_PENDING,
} from "@/components/contracts/ContractFormalizationAlerts"
import {
  ContractRetributionFields,
  ContractSignatureFields,
} from "@/components/contracts/ContractConditionsFields"
import { ContractFormalizationSummary } from "@/components/contracts/ContractFormalizationSummary"
import {
  buildComponentsPayload,
  fetchPaymentMethods,
  formatConditionDate,
  hasInvalidComponent,
  type CompensationComponentDraft,
  type ContractFormalizationPending,
  type PaymentMethodOption,
} from "@/lib/contract-conditions"
import {
  fetchEntityScheduleSegments,
  type PositionScheduleSegment,
} from "@/lib/position-schedule"
import { AlertTriangle, UserPlus } from "lucide-react"

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

interface ContractType {
  id: string
  name: string
  code: string
}

interface WorkerIdentity {
  fullName: string
  identification: string
}

interface ReincorporateWorkerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workerId: string
  entityId: string
  onSuccess: () => void
}

const groupLabel = (sequence: number | null | undefined) =>
  sequence == null ? "—" : `Grupo ${toRomanNumeral(sequence)}`

/** Fase 11A.5 — reincorporación: crea nuevo período, puesto y contrato con las
 *  mismas condiciones contractuales que el resto de flujos de contratación. */
const ReincorporateWorkerDialog: React.FC<ReincorporateWorkerDialogProps> = ({
  open,
  onOpenChange,
  workerId,
  entityId,
  onSuccess,
}) => {
  const [positions, setPositions] = React.useState<PositionRow[]>([])
  const [occupancy, setOccupancy] = React.useState<Record<string, number>>({})
  const [contractTypes, setContractTypes] = React.useState<ContractType[]>([])
  const [applicableScaleId, setApplicableScaleId] = React.useState<string | null>(null)
  const [salaryValuesByGroup, setSalaryValuesByGroup] = React.useState<
    Record<string, SalaryValue | null>
  >({})
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [worker, setWorker] = React.useState<WorkerIdentity | null>(null)
  const [positionId, setPositionId] = React.useState("")
  const [reincorporationDate, setReincorporationDate] = React.useState("")
  const [contractTypeId, setContractTypeId] = React.useState("")
  const [contractStartDate, setContractStartDate] = React.useState("")
  const [contractEndDate, setContractEndDate] = React.useState("")
  // Fase 11A.5: condiciones formalizadas en el nuevo contrato
  const [paymentMethods, setPaymentMethods] = React.useState<PaymentMethodOption[]>([])
  const [signatureDate, setSignatureDate] = React.useState("")
  const [signaturePlace, setSignaturePlace] = React.useState("")
  const [paymentMethodId, setPaymentMethodId] = React.useState("")
  const [paymentSchedule, setPaymentSchedule] = React.useState("")
  const [components, setComponents] = React.useState<CompensationComponentDraft[]>([])
  const [representatives, setRepresentatives] = React.useState<RepresentativePositionRow[]>([])
  const [pending, setPending] = React.useState<ContractFormalizationPending | null>(null)
  const [representativeAssignmentId, setRepresentativeAssignmentId] = React.useState<string | null>(
    null
  )
  const [canManageOrganization, setCanManageOrganization] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [segmentsByPosition, setSegmentsByPosition] = React.useState<
    Record<string, PositionScheduleSegment[]>
  >({})

  const loadData = React.useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    setLoadError(null)
    try {
      const { data: posData, error: posError } = await supabase
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

      const mapped = ((posData as any[]) || []).map((p: any) => ({
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

      const { data: ctData, error: ctError } = await supabase
        .from("employment_contract_types")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name")
      if (ctError) throw ctError
      setContractTypes((ctData as ContractType[]) || [])

      // Identidad del trabajador para el resumen contractual
      const { data: workerRow, error: workerError } = await supabase
        .from("workers")
        .select("first_name, first_surname, second_surname, identification")
        .eq("id", workerId)
        .maybeSingle()
      if (workerError) throw workerError
      if (workerRow) {
        const row = workerRow as any
        setWorker({
          fullName: [row.first_name, row.first_surname, row.second_surname]
            .filter(Boolean)
            .join(" "),
          identification: row.identification,
        })
      }

      // Fase 11A.5: catálogo global de formas de pago
      setPaymentMethods(await fetchPaymentMethods())

      setApplicableScaleId(await resolveApplicableScaleId(entityId))
      const groupIds = mapped
        .map((p) => p.job?.salary_group?.id)
        .filter((id): id is string => !!id)
      setSalaryValuesByGroup(await fetchSalaryValuesForGroups(groupIds))

      const { data: canManageOrg } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "organization.manage",
      })
      setCanManageOrganization(!!canManageOrg)
    } catch (err) {
      console.error("Error loading reincorporation data:", err)
      setLoadError("No se pudieron cargar los puestos disponibles.")
    } finally {
      setLoading(false)
    }
  }, [entityId, workerId])

  React.useEffect(() => {
    if (!open) return
    setPositionId("")
    setReincorporationDate("")
    setContractTypeId("")
    setContractStartDate("")
    setContractEndDate("")
    setSignatureDate("")
    setSignaturePlace("")
    setPaymentMethodId("")
    setPaymentSchedule("")
    setComponents([])
    setRepresentatives([])
    setPending(null)
    setRepresentativeAssignmentId(null)
    setError(null)
    setOccupancy({})
    loadData()
  }, [open, loadData])

  const selectable = React.useMemo(
    () =>
      positions.filter(
        (p) => p.is_active && (occupancy[p.id] || 0) < (p.authorized_quantity || 0)
      ),
    [positions, occupancy]
  )

  const selected = React.useMemo(
    () => positions.find((p) => p.id === positionId) || null,
    [positions, positionId]
  )

  const selectedGroup = selected?.job?.salary_group || null
  const selectedSalary = salaryForGroup(applicableScaleId, selectedGroup, salaryValuesByGroup)
  const selectedType = contractTypes.find((t) => t.id === contractTypeId) || null
  const isDetermined = selectedType?.code === "DETERMINADO"

  // El representante que suscribe se resuelve por la FECHA DE FIRMA
  const contractReferenceDate = signatureDate
  const baseSalaryAmount = selectedSalary?.amount ?? null
  const baseSalaryCurrency = selectedSalary?.currency_code ?? null
  const formalizationBlocked = (pending || EMPTY_FORMALIZATION_PENDING).blocking.length > 0
  const selectedRepresentative =
    representatives.find((row) => row.assignment_id === representativeAssignmentId) || null
  const effectiveContractStart = contractStartDate || reincorporationDate

  React.useEffect(() => {
    if (isDetermined) return
    setContractEndDate("")
  }, [isDetermined])

  const handleSubmit = async () => {
    setError(null)

    if (!positionId) {
      setError("Selecciona un nuevo puesto.")
      return
    }
    if (!reincorporationDate) {
      setError("La fecha de reincorporación es obligatoria.")
      return
    }
    if (!contractTypeId) {
      setError("Selecciona un tipo de contrato.")
      return
    }
    if (!signatureDate) {
      setError("La fecha de firma del contrato es obligatoria.")
      return
    }
    if (!signaturePlace.trim()) {
      setError("El lugar de firma es obligatorio.")
      return
    }
    if (!paymentMethodId) {
      setError("Selecciona la forma de pago.")
      return
    }
    if (hasInvalidComponent(components)) {
      setError(
        "Revisa los conceptos retributivos: cada uno necesita descripción e importe válido (mayor o igual que 0)."
      )
      return
    }
    if (formalizationBlocked) {
      setError(
        `No se puede completar la formalización del contrato. Datos pendientes: ${(
          pending || EMPTY_FORMALIZATION_PENDING
        ).blocking.join(" · ")}`
      )
      return
    }
    if (isDetermined && !contractEndDate) {
      setError("El contrato por tiempo determinado requiere una fecha de fin.")
      return
    }
    if (contractEndDate && contractEndDate <= effectiveContractStart) {
      setError("La fecha de fin del contrato debe ser posterior a su inicio.")
      return
    }
    if (!representativeAssignmentId) {
      setError(
        "No hay representantes configurados para la fecha de firma seleccionada."
      )
      return
    }

    setSubmitting(true)
    try {
      const { error: rpcError } = await supabase.rpc("reincorporate_worker", {
        p_worker_id: workerId,
        p_new_position_id: positionId,
        p_reincorporation_date: reincorporationDate,
        p_contract_type_id: contractTypeId,
        p_contract_start_date: effectiveContractStart,
        p_contract_end_date: isDetermined ? contractEndDate || null : null,
        p_notes: null,
        p_representative_assignment_id: representativeAssignmentId,
        p_signature_date: signatureDate,
        p_signature_place: signaturePlace.trim(),
        p_payment_method_id: paymentMethodId,
        p_compensation_components: buildComponentsPayload(components),
        p_payment_schedule_text: paymentSchedule.trim() || null,
      })
      if (rpcError) throw rpcError

      showSuccess("Reincorporación realizada correctamente.")
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      let friendly = "No se pudo completar la reincorporación."
      if (/vacantes/i.test(msg)) {
        friendly = "El puesto seleccionado ya no tiene vacantes disponibles."
      } else if (/no pertenece a la entidad/i.test(msg)) {
        friendly = "El puesto seleccionado no pertenece a la entidad del trabajador."
      } else if (/posterior al fin del per[ií]odo/i.test(msg)) {
        friendly = "La fecha de reincorporación debe ser posterior al fin del período laboral anterior."
      } else if (/requiere una fecha de fin/i.test(msg)) {
        friendly = "El contrato por tiempo determinado requiere una fecha de fin."
      } else if (/posterior a su inicio/i.test(msg)) {
        friendly = "La fecha de fin del contrato debe ser posterior a su inicio."
      } else if (/Datos pendientes/i.test(msg)) {
        friendly = msg
      } else if (/concepto retributivo|n[uú]mero v[aá]lido|negativo/i.test(msg)) {
        friendly =
          "Revisa los conceptos retributivos: cada uno necesita descripción e importe válido (mayor o igual que 0)."
      } else if (/escala salarial/i.test(msg)) {
        friendly =
          "No existe una escala salarial aplicable configurada para esta entidad. Complete la configuración salarial antes de formalizar el contrato."
      } else if (/ya est[aá] activo/i.test(msg)) {
        friendly = "El trabajador ya está activo."
      } else if (/carn[eé] de identidad/i.test(msg)) {
        friendly = "Ya existe otro trabajador activo con ese carné de identidad en este workspace."
      } else if (/representante/i.test(msg)) {
        friendly = "No hay representantes configurados para la fecha de firma seleccionada."
      } else if (/no est[aá] activo/i.test(msg)) {
        friendly = "El puesto seleccionado no está activo."
      } else if (/permiso/i.test(msg)) {
        friendly = "No tiene permiso para gestionar trabajadores."
      } else if (msg) {
        friendly = msg
      }
      setError(friendly)
      showError(friendly)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Reincorporar trabajador</DialogTitle>
          <DialogDescription>
            Se creará un nuevo período laboral, un nuevo puesto y un nuevo contrato para el
            mismo trabajador. Su historial anterior se conserva.
          </DialogDescription>
        </DialogHeader>

        {loadError && <SiteCorpAlert type="danger">{loadError}</SiteCorpAlert>}

        <div className="space-y-4">
          {/* 1. Persona */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Persona
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Nombre</dt>
                <dd className="text-sm font-medium text-ink">
                  {worker?.fullName || "Cargando…"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Carné de identidad</dt>
                <dd className="text-sm font-medium text-ink">{worker?.identification || "—"}</dd>
              </div>
            </dl>
          </div>

          {/* 2. Puesto y condiciones estructurales */}
          <div className="space-y-2">
            <Label>Nuevo puesto *</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando puestos…</p>
            ) : selectable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay puestos con vacantes disponibles en esta entidad.
              </p>
            ) : (
              <SiteCorpSelect value={positionId} onValueChange={setPositionId}>
                <option value="">Seleccionar puesto</option>
                {selectable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.job ? ` · ${p.job.name}` : ""} ({occupancy[p.id] || 0}/
                    {p.authorized_quantity})
                  </option>
                ))}
              </SiteCorpSelect>
            )}
          </div>

          {/* Situación derivada */}
          {selected && (
            <div className="rounded-xl border border-border bg-sitecorp-primary/5 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sitecorp-primary">
                Nueva situación laboral
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Área</dt>
                  <dd className="text-sm font-medium text-ink">{selected.job?.area?.name || "—"}</dd>
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
                  <dt className="text-xs text-muted-foreground">Salario de referencia</dt>
                  <dd className="text-sm font-medium text-ink">
                    {selectedSalary
                      ? formatSalary(selectedSalary)
                      : selectedGroup
                        ? "Salario no configurado"
                        : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Vacantes disponibles</dt>
                  <dd className="text-sm font-medium text-ink">
                    {Math.max(0, (selected.authorized_quantity || 0) - (occupancy[selected.id] || 0))}
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

              {/* Fase 11A.3: configuración estructural del puesto (solo lectura) */}
              <PositionWorkInfoReadOnly
                className="mt-3"
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

          {/* 3. Contrato: vigencia */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fecha de reincorporación *</Label>
              <SiteCorpInput
                type="date"
                value={reincorporationDate}
                onChange={(e) => {
                  setReincorporationDate(e.target.value)
                  if (!contractStartDate) setContractStartDate(e.target.value)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de contrato *</Label>
              <SiteCorpSelect value={contractTypeId} onValueChange={setContractTypeId}>
                <option value="">Seleccionar tipo</option>
                {contractTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SiteCorpSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Inicio del contrato *</Label>
              <SiteCorpInput
                type="date"
                value={contractStartDate || reincorporationDate}
                onChange={(e) => setContractStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fin del contrato{isDetermined ? " *" : ""}</Label>
              <SiteCorpInput
                type="date"
                value={contractEndDate}
                onChange={(e) => setContractEndDate(e.target.value)}
                disabled={!isDetermined}
                min={effectiveContractStart || undefined}
              />
              {!isDetermined && (
                <p className="text-xs text-muted-foreground">
                  La modalidad de tiempo indeterminado no requiere fecha de fin.
                </p>
              )}
            </div>
          </div>

          <ContractSignatureFields
            signatureDate={signatureDate}
            onSignatureDateChange={setSignatureDate}
            signaturePlace={signaturePlace}
            onSignaturePlaceChange={setSignaturePlace}
            paymentMethodId={paymentMethodId}
            onPaymentMethodIdChange={setPaymentMethodId}
            paymentMethods={paymentMethods}
            paymentSchedule={paymentSchedule}
            onPaymentScheduleChange={setPaymentSchedule}
          />

          <ContractFormalizationAlerts
            entityId={entityId}
            positionId={positionId || null}
            signatureDate={signatureDate || null}
            signaturePlace={signaturePlace || null}
            paymentMethodId={paymentMethodId || null}
            representativeAssignmentId={representativeAssignmentId}
            canManage={canManageOrganization}
            onPendingChange={setPending}
          />

          {/* 4. Representante (resuelto por la fecha de firma) */}
          <RepresentativeSelect
            entityId={entityId}
            onDate={contractReferenceDate}
            value={representativeAssignmentId}
            onChange={setRepresentativeAssignmentId}
            canManage={canManageOrganization}
            label="Representante que suscribe el contrato *"
            dateHint={`Representante vigente en la fecha de firma (${formatConditionDate(
              signatureDate
            )}). Los cambios posteriores de representante no modifican este contrato.`}
            onOptionsChange={setRepresentatives}
          />

          {/* 5. Condiciones retributivas */}
          <ContractRetributionFields
            components={components}
            onComponentsChange={setComponents}
            baseSalaryAmount={baseSalaryAmount}
            baseSalaryCurrency={baseSalaryCurrency}
            salaryGroupSequence={selectedGroup?.sequence_number ?? null}
            disabled={!selected}
          />

          {/* 6. Resumen */}
          <ContractFormalizationSummary
            title="Resumen de la reincorporación"
            workerName={worker?.fullName || ""}
            personIdentification={worker?.identification || null}
            positionName={selected?.name || ""}
            jobName={selected?.job?.name || null}
            areaName={selected?.job?.area?.name || null}
            contractTypeName={selectedType?.name || null}
            startDate={effectiveContractStart}
            endDate={isDetermined ? contractEndDate || null : null}
            signatureDate={signatureDate}
            signaturePlace={signaturePlace}
            paymentMethodName={
              paymentMethods.find((method) => method.id === paymentMethodId)?.name || null
            }
            representativeName={selectedRepresentative?.person_name || null}
            representativeTitle={selectedRepresentative?.title || null}
            baseSalaryAmount={baseSalaryAmount}
            baseSalaryCurrency={baseSalaryCurrency}
            salaryGroupSequence={selectedGroup?.sequence_number ?? null}
            components={components}
          />

          {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <SiteCorpButton variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </SiteCorpButton>
          <SiteCorpButton
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              loading ||
              selectable.length === 0 ||
              !positionId ||
              !contractTypeId ||
              !signatureDate ||
              !signaturePlace.trim() ||
              !paymentMethodId ||
              hasInvalidComponent(components) ||
              formalizationBlocked ||
              !representativeAssignmentId
            }
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {submitting ? "Procesando…" : "Confirmar reincorporación"}
          </SiteCorpButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ReincorporateWorkerDialog
