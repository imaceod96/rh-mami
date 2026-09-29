import * as React from "react"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
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
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
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
import { AlertTriangle, UserPlus, RefreshCw, Search } from "lucide-react"
import { PositionWorkInfoReadOnly } from "@/components/positions/PositionWorkInfoReadOnly"
import {
  fetchEntityScheduleSegments,
  type PositionScheduleSegment,
} from "@/lib/position-schedule"
import {
  ContractRetributionFields,
  ContractSignatureFields,
} from "@/components/contracts/ContractConditionsFields"
import {
  ContractFormalizationAlerts,
  EMPTY_FORMALIZATION_PENDING,
} from "@/components/contracts/ContractFormalizationAlerts"
import {
  buildComponentsPayload,
  fetchPaymentMethods,
  hasInvalidComponent,
  type CompensationComponentDraft,
  type ContractFormalizationPending,
  type PaymentMethodOption,
} from "@/lib/contract-conditions"

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

interface LinkedWorker {
  id: string
  code: string
  employment_status: string
}

interface CandidateRow {
  id: string
  first_name: string
  first_surname: string
  second_surname: string | null
  identification: string
  email: string | null
  phone: string | null
  worker: LinkedWorker | null
}

export interface HireCandidateTarget {
  id: string
  fullName: string
  identification: string
  /** Trabajador vinculado (si la persona ya tuvo un expediente laboral) */
  worker?: LinkedWorker | null
}

interface HireCandidateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityId: string
  /** Persona ya definida (flujo desde la ficha del candidato) */
  candidate?: HireCandidateTarget | null
  /** Puesto ya definido (flujo «Cubrir puesto» desde Contratación) */
  presetPositionId?: string | null
  onSuccess: (workerId: string) => void
}

const fullNameOf = (c: {
  first_name: string
  first_surname: string
  second_surname: string | null
}) => [c.first_name, c.first_surname, c.second_surname].filter(Boolean).join(" ")

const groupLabel = (sequence: number | null | undefined) =>
  sequence == null ? "—" : `Grupo ${toRomanNumeral(sequence)}`

const hasAvailableCapacity = (
  position: PositionRow | null,
  occupancy: Record<string, number>
) => {
  if (!position || !position.is_active) return false
  return (occupancy[position.id] || 0) < (position.authorized_quantity || 0)
}

const HireCandidateDialog: React.FC<HireCandidateDialogProps> = ({
  open,
  onOpenChange,
  entityId,
  candidate = null,
  presetPositionId = null,
  onSuccess,
}) => {
  const [positions, setPositions] = React.useState<PositionRow[]>([])
  const [occupancy, setOccupancy] = React.useState<Record<string, number>>({})
  const [candidates, setCandidates] = React.useState<CandidateRow[]>([])
  const [contractTypes, setContractTypes] = React.useState<ContractType[]>([])
  const [applicableScaleId, setApplicableScaleId] = React.useState<string | null>(null)
  const [salaryValuesByGroup, setSalaryValuesByGroup] = React.useState<
    Record<string, SalaryValue | null>
  >({})
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [positionId, setPositionId] = React.useState("")
  const [selectedCandidateId, setSelectedCandidateId] = React.useState("")
  const [candidateSearch, setCandidateSearch] = React.useState("")
  const [hireDate, setHireDate] = React.useState("")
  const [contractTypeId, setContractTypeId] = React.useState("")
  const [contractStartDate, setContractStartDate] = React.useState("")
  const [contractEndDate, setContractEndDate] = React.useState("")
  const [notes, setNotes] = React.useState("")
  // Fase 11A.5: condiciones formalizadas en el contrato
  const [paymentMethods, setPaymentMethods] = React.useState<PaymentMethodOption[]>([])
  const [signatureDate, setSignatureDate] = React.useState("")
  const [signaturePlace, setSignaturePlace] = React.useState("")
  const [paymentMethodId, setPaymentMethodId] = React.useState("")
  const [components, setComponents] = React.useState<CompensationComponentDraft[]>([])
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

      // Personas disponibles: se excluyen las que ya son trabajadores activos.
      const { data: candidatesData, error: candidatesError } = await supabase
        .from("candidates")
        .select(
          `id, first_name, first_surname, second_surname, identification, email, phone,
           worker:workers(id, code, employment_status)`
        )
        .eq("organization_entity_id", entityId)
        .order("first_surname")
        .order("first_name")
      if (candidatesError) throw candidatesError
      setCandidates(
        (((candidatesData as any[]) || []).map((c: any) => ({
          ...c,
          worker: Array.isArray(c.worker) ? c.worker[0] || null : c.worker || null,
        })) as CandidateRow[]) || []
      )

      const { data: ctData, error: ctError } = await supabase
        .from("employment_contract_types")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name")
      if (ctError) throw ctError
      setContractTypes((ctData as ContractType[]) || [])

      const { data: canManageOrg } = await supabase.rpc("can_access_entity", {
        target_entity_id: entityId,
        permission_code: "organization.manage",
      })
      setCanManageOrganization(!!canManageOrg)

      // Fase 11A.5: catálogo global de formas de pago (A tiempo / A rendimiento)
      setPaymentMethods(await fetchPaymentMethods())

      setApplicableScaleId(await resolveApplicableScaleId(entityId))
      const groupIds = mapped
        .map((p) => p.job?.salary_group?.id)
        .filter((id): id is string => !!id)
      setSalaryValuesByGroup(await fetchSalaryValuesForGroups(groupIds))
    } catch (err) {
      console.error("Error loading hiring data:", err)
      setLoadError("No se pudieron cargar los datos para la contratación.")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    if (!open) return
    setPositionId(presetPositionId || "")
    setSelectedCandidateId(candidate?.id || "")
    setCandidateSearch("")
    setHireDate("")
    setContractTypeId("")
    setContractStartDate("")
    setContractEndDate("")
    setNotes("")
    setSignatureDate("")
    setSignaturePlace("")
    setPaymentMethodId("")
    setComponents([])
    setPending(null)
    setRepresentativeAssignmentId(null)
    setError(null)
    setOccupancy({})
    loadData()
  }, [open, candidate?.id, presetPositionId, loadData])

  const vacantPositions = React.useMemo(
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

  const selectableCandidates = React.useMemo(
    () => candidates.filter((c) => c.worker?.employment_status !== "active"),
    [candidates]
  )

  const filteredCandidates = React.useMemo(() => {
    const search = candidateSearch.trim().toLowerCase()
    if (!search) return selectableCandidates
    return selectableCandidates.filter((c) =>
      [c.first_name, c.first_surname, c.second_surname, c.identification, c.email, c.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search)
    )
  }, [selectableCandidates, candidateSearch])

  const selectedCandidate = React.useMemo<HireCandidateTarget | null>(() => {
    if (candidate) return candidate
    const found = candidates.find((c) => c.id === selectedCandidateId)
    if (!found) return null
    return {
      id: found.id,
      fullName: fullNameOf(found),
      identification: found.identification,
      worker: found.worker,
    }
  }, [candidate, candidates, selectedCandidateId])

  const isReincorporation =
    !!selectedCandidate?.worker && selectedCandidate.worker.employment_status !== "active"

  const selectedGroup = selected?.job?.salary_group || null
  const selectedSalary = salaryForGroup(applicableScaleId, selectedGroup, salaryValuesByGroup)
  const selectedType = contractTypes.find((t) => t.id === contractTypeId) || null
  const isDetermined = selectedType?.code === "DETERMINADO"
  const vacancies = selected
    ? Math.max(0, (selected.authorized_quantity || 0) - (occupancy[selected.id] || 0))
    : 0

  /**
   * Fase 11A.5: el representante que comparece se resuelve por la FECHA DE FIRMA
   * (no por la fecha de inicio), porque es la fecha en que se formaliza el contrato.
   */
  const contractReferenceDate = signatureDate
  const baseSalaryAmount = selectedSalary?.amount ?? null
  const baseSalaryCurrency = selectedSalary?.currency_code ?? null
  const formalizationBlocked = (pending || EMPTY_FORMALIZATION_PENDING).blocking.length > 0

  React.useEffect(() => {
    if (!isDetermined) setContractEndDate("")
  }, [isDetermined])

  const handleSubmit = async () => {
    setError(null)

    if (!selectedCandidate) {
      setError("Selecciona la persona a contratar.")
      return
    }
    if (!positionId) {
      setError("Selecciona un puesto.")
      return
    }
    if (!hireDate) {
      setError("La fecha de incorporación es obligatoria.")
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
    if (!representativeAssignmentId) {
      setError(
        "No existe ningún representante autorizado configurado para la fecha del contrato. Configure los representantes de la entidad para continuar."
      )
      return
    }

    const effectiveContractStart = contractStartDate || hireDate
    if (isDetermined && !contractEndDate) {
      setError("El contrato por tiempo determinado requiere una fecha final.")
      return
    }
    if (contractEndDate && contractEndDate <= effectiveContractStart) {
      setError("La fecha final del contrato debe ser posterior a su inicio.")
      return
    }

    setSubmitting(true)
    try {
      const { data, error: rpcError } = await supabase.rpc("hire_candidate", {
        p_candidate_id: selectedCandidate.id,
        p_position_id: positionId,
        p_hire_date: hireDate,
        p_contract_type_id: contractTypeId,
        p_contract_start_date: effectiveContractStart,
        p_contract_end_date: isDetermined ? contractEndDate || null : null,
        p_notes: notes.trim() || null,
        p_representative_assignment_id: representativeAssignmentId,
        p_signature_date: signatureDate,
        p_signature_place: signaturePlace.trim(),
        p_payment_method_id: paymentMethodId,
        p_compensation_components: buildComponentsPayload(components),
      })
      if (rpcError) throw rpcError

      const workerId = (data as any)?.worker_id as string | undefined
      showSuccess(
        isReincorporation
          ? "Trabajador reincorporado correctamente."
          : "Trabajador contratado correctamente."
      )
      onOpenChange(false)
      if (workerId) onSuccess(workerId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      let friendly = "No se pudo completar la contratación."
      if (/vacantes/i.test(msg)) {
        friendly = "El puesto seleccionado ya no tiene vacantes disponibles."
      } else if (/ya es un trabajador activo/i.test(msg)) {
        friendly = "Este candidato ya es un trabajador activo."
      } else if (/carn[eé] de identidad/i.test(msg)) {
        friendly = "Ya existe un trabajador con ese carné de identidad. Revise el trabajador existente."
      } else if (/obligatorios/i.test(msg)) {
        friendly = "Faltan datos obligatorios para realizar la contratación."
      } else if (/no pertenece a la entidad/i.test(msg)) {
        friendly = "El puesto seleccionado no pertenece a la entidad del candidato."
      } else if (/no est[aá] activo/i.test(msg)) {
        friendly = "El puesto seleccionado no está activo."
      } else if (/requiere una fecha/i.test(msg)) {
        friendly = "El contrato por tiempo determinado requiere una fecha final."
      } else if (/posterior/i.test(msg)) {
        friendly = "La fecha final del contrato debe ser posterior a su inicio."
      } else if (/Datos pendientes/i.test(msg)) {
        friendly = msg
      } else if (/concepto retributivo|n[uú]mero v[aá]lido|negativo/i.test(msg)) {
        friendly =
          "Revisa los conceptos retributivos: cada uno necesita descripción e importe válido (mayor o igual que 0)."
      } else if (/escala salarial/i.test(msg)) {
        friendly =
          "No existe una escala salarial aplicable configurada para esta entidad. Complete la configuración salarial antes de formalizar el contrato."
      } else if (/representante/i.test(msg)) {
        friendly =
          "No existe ningún representante autorizado configurado para la fecha del contrato."
      } else if (/permiso/i.test(msg)) {
        friendly = "No tiene permiso para contratar trabajadores en esta entidad."
      } else if (msg) {
        friendly = msg
      }
      setError(friendly)
      showError(friendly)
    } finally {
      setSubmitting(false)
    }
  }

  const positionFixed = !!presetPositionId
  const hasVacancy = hasAvailableCapacity(selected, occupancy)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {positionFixed
              ? "Cubrir puesto"
              : isReincorporation
                ? "Reincorporar candidato"
                : "Contratar candidato"}
          </DialogTitle>
          <DialogDescription>
            {positionFixed
              ? "Seleccione la persona que ocupará el puesto, el tipo de contrato y la fecha de incorporación."
              : "Se creará la asignación del puesto y el contrato laboral correspondiente."}
          </DialogDescription>
        </DialogHeader>

        {loadError && <SiteCorpAlert type="danger">{loadError}</SiteCorpAlert>}

        {/* ---------- Persona ---------- */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Persona
          </p>

          {candidate ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Nombre</dt>
                <dd className="text-sm font-medium text-ink">{candidate.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Carné de identidad</dt>
                <dd className="text-sm font-medium text-ink">{candidate.identification}</dd>
              </div>
            </dl>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Cargando candidatos…</p>
          ) : selectableCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay candidatos disponibles. Registre un candidato o revise que no sea ya un
              trabajador activo.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <SiteCorpInput
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  placeholder="Buscar por nombre, apellidos, CI, correo o teléfono…"
                  className="pl-9"
                />
              </div>

              {filteredCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ningún candidato coincide con la búsqueda.
                </p>
              ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-background p-2">
                  {filteredCandidates.map((c) => {
                    const reinc = !!c.worker
                    const selectedRow = selectedCandidateId === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCandidateId(c.id)}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                          selectedRow
                            ? "border-sitecorp-primary bg-sitecorp-primary/5"
                            : "border-transparent hover:bg-muted"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-medium text-ink">{fullNameOf(c)}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            CI: {c.identification}
                          </span>
                          {reinc && (
                            <SiteCorpStatusBadge status="info">
                              Trabajador anterior · Reincorporación
                            </SiteCorpStatusBadge>
                          )}
                        </div>
                        {(c.email || c.phone) && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[c.email, c.phone].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedCandidate && (
                <p className="text-xs text-muted-foreground">
                  Seleccionado:{" "}
                  <span className="font-medium text-ink">{selectedCandidate.fullName}</span> · CI{" "}
                  {selectedCandidate.identification}
                </p>
              )}
            </div>
          )}
        </div>

        {isReincorporation && (
          <SiteCorpAlert type="info">
            <span className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
              Esta persona fue trabajador anteriormente. Se reincorporará con el mismo expediente: se
              creará un nuevo período laboral y un nuevo contrato, conservando su trayectoria y
              documentos.
            </span>
          </SiteCorpAlert>
        )}

        {/* ---------- Puesto ---------- */}
        {positionFixed ? (
          selected && (
            <div className="rounded-xl border border-border bg-sitecorp-primary/5 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sitecorp-primary">
                Puesto seleccionado
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Puesto</dt>
                  <dd className="text-sm font-medium text-ink">{selected.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cargo</dt>
                  <dd className="text-sm font-medium text-ink">{selected.job?.name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Área</dt>
                  <dd className="text-sm font-medium text-ink">{selected.job?.area?.name || "—"}</dd>
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
                    {occupancy[selected.id] || 0}/{selected.authorized_quantity} ocupados ·{" "}
                    {vacancies} vacante(s)
                  </dd>
                </div>
              </dl>
              {selectedGroup && !selectedSalary && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-sitecorp-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  El grupo salarial del cargo no tiene importe configurado en la escala aplicable.
                </p>
              )}
            </div>
          )
        ) : (
          <div className="space-y-2">
            <Label>Puesto *</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando puestos…</p>
            ) : vacantPositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay puestos con vacantes disponibles en esta entidad.
              </p>
            ) : (
              <SiteCorpSelect value={positionId} onValueChange={setPositionId}>
                <option value="">Seleccionar puesto</option>
                {vacantPositions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.job ? ` · ${p.job.name}` : ""} ({occupancy[p.id] || 0}/
                    {p.authorized_quantity})
                  </option>
                ))}
              </SiteCorpSelect>
            )}

            {selected && (
              <div className="rounded-xl border border-border bg-sitecorp-primary/5 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sitecorp-primary">
                  Situación laboral resultante
                </p>
                <dl className="grid gap-3 sm:grid-cols-2">
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
                    <dt className="text-xs text-muted-foreground">Capacidad</dt>
                    <dd className="text-sm font-medium text-ink">
                      {occupancy[selected.id] || 0}/{selected.authorized_quantity} · {vacancies}{" "}
                      vacante(s)
                    </dd>
                  </div>
                </dl>

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
          </div>
        )}

        {/* ---------- Contrato ---------- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>
              {isReincorporation ? "Fecha de reincorporación *" : "Fecha de incorporación *"}
            </Label>
            <SiteCorpInput
              type="date"
              value={hireDate}
              onChange={(e) => {
                setHireDate(e.target.value)
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
              value={contractStartDate || hireDate}
              onChange={(e) => setContractStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Final del contrato{isDetermined ? " *" : ""}</Label>
            <SiteCorpInput
              type="date"
              value={contractEndDate}
              onChange={(e) => setContractEndDate(e.target.value)}
              disabled={!isDetermined}
              min={contractStartDate || hireDate || undefined}
            />
            {!isDetermined && (
              <p className="text-xs text-muted-foreground">
                La modalidad de tiempo indeterminado no requiere fecha final.
              </p>
            )}
          </div>
        </div>

        <EntityContractualDataNotice entityId={entityId} canManage={canManageOrganization} />

        <RepresentativeSelect
          entityId={entityId}
          onDate={contractReferenceDate}
          value={representativeAssignmentId}
          onChange={setRepresentativeAssignmentId}
          canManage={canManageOrganization}
        />

        <div className="space-y-2">
          <Label>Observaciones</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sitecorp-primary"
            placeholder="Opcional"
          />
        </div>

        {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <SiteCorpButton variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </SiteCorpButton>
          <SiteCorpButton
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting || loading || !selectedCandidate || !hasVacancy || !representativeAssignmentId
            }
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {submitting
              ? "Procesando…"
              : isReincorporation
                ? "Confirmar reincorporación"
                : "Confirmar contratación"}
          </SiteCorpButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default HireCandidateDialog
