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
  fetchActiveSalaryValuesForGroups,
  salaryForGroup,
  formatSalary,
  type SalaryValue,
} from "@/lib/salary"
import { AlertTriangle, UserPlus, RefreshCw } from "lucide-react"

interface PositionRow {
  id: string
  name: string
  code: string | null
  is_active: boolean
  authorized_quantity: number
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

export interface HireCandidateTarget {
  id: string
  fullName: string
  identification: string
}

interface HireCandidateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityId: string
  candidate: HireCandidateTarget
  mode: "NEW" | "REINCORPORATION"
  onSuccess: (workerId: string) => void
}

const groupLabel = (sequence: number | null | undefined) =>
  sequence == null ? "—" : `Grupo ${toRomanNumeral(sequence)}`

const HireCandidateDialog: React.FC<HireCandidateDialogProps> = ({
  open,
  onOpenChange,
  entityId,
  candidate,
  mode,
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

  const [positionId, setPositionId] = React.useState("")
  const [hireDate, setHireDate] = React.useState("")
  const [contractTypeId, setContractTypeId] = React.useState("")
  const [contractStartDate, setContractStartDate] = React.useState("")
  const [contractEndDate, setContractEndDate] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error: posError } = await supabase
        .from("organization_positions")
        .select(
          `id, name, code, is_active, authorized_quantity,
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

      setApplicableScaleId(await resolveApplicableScaleId(entityId))
      const groupIds = mapped
        .map((p) => p.job?.salary_group?.id)
        .filter((id): id is string => !!id)
      setSalaryValuesByGroup(await fetchActiveSalaryValuesForGroups(groupIds))
    } catch (err) {
      console.error("Error loading hiring data:", err)
      setLoadError("No se pudieron cargar los puestos disponibles.")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    if (!open) return
    setPositionId("")
    setHireDate("")
    setContractTypeId("")
    setContractStartDate("")
    setContractEndDate("")
    setNotes("")
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
  const vacancies = selected
    ? Math.max(0, (selected.authorized_quantity || 0) - (occupancy[selected.id] || 0))
    : 0

  React.useEffect(() => {
    if (!isDetermined) setContractEndDate("")
  }, [isDetermined])

  const handleSubmit = async () => {
    setError(null)

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
        p_candidate_id: candidate.id,
        p_position_id: positionId,
        p_hire_date: hireDate,
        p_contract_type_id: contractTypeId,
        p_contract_start_date: effectiveContractStart,
        p_contract_end_date: isDetermined ? contractEndDate || null : null,
        p_notes: notes.trim() || null,
      })
      if (rpcError) throw rpcError

      const workerId = (data as any)?.worker_id as string | undefined
      showSuccess("Candidato contratado correctamente.")
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

  const isReincorporation = mode === "REINCORPORATION"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{isReincorporation ? "Reincorporar candidato" : "Contratar candidato"}</DialogTitle>
          <DialogDescription>
            {isReincorporation
              ? "Esta persona fue trabajador anteriormente. Se reincorporará con el mismo expediente: se creará un nuevo período laboral y un nuevo contrato."
              : "Se creará un trabajador, una asignación de puesto y un contrato laboral."}
          </DialogDescription>
        </DialogHeader>

        {isReincorporation && (
          <SiteCorpAlert type="info">
            <span className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
              Se reutilizará el trabajador existente (trayectoria, contratos y documentos se
              conservan).
            </span>
          </SiteCorpAlert>
        )}

        {loadError && <SiteCorpAlert type="danger">{loadError}</SiteCorpAlert>}

        {/* Datos de la persona */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Persona
          </p>
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
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Puesto *</Label>
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

          {/* Información derivada */}
          {selected && (
            <div className="rounded-xl border border-border bg-sitecorp-primary/5 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sitecorp-primary">
                Situación laboral resultante
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
                  <dt className="text-xs text-muted-foreground">Capacidad</dt>
                  <dd className="text-sm font-medium text-ink">
                    {occupancy[selected.id] || 0}/{selected.authorized_quantity} ·{" "}
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
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{isReincorporation ? "Fecha de reincorporación *" : "Fecha de incorporación *"}</Label>
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
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <SiteCorpButton variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </SiteCorpButton>
          <SiteCorpButton
            type="button"
            onClick={handleSubmit}
            disabled={submitting || loading || selectable.length === 0}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {submitting ? "Procesando…" : isReincorporation ? "Confirmar reincorporación" : "Confirmar contratación"}
          </SiteCorpButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default HireCandidateDialog
