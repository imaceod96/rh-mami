import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Textarea } from "@/components/ui/textarea"
import { invalidateVacationData } from "@/hooks/use-vacations"
import {
  VACATION_MAX_NATURAL_DAYS,
  formatVacationDays,
  previewVacationConsumption,
  registerWorkerVacation,
} from "@/lib/vacations"
import { CalendarPlus } from "lucide-react"

export interface VacationWorkerOption {
  id: string
  full_name: string
  balance: number
}

interface RegisterVacationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityId: string
  workers: VacationWorkerOption[]
  preselectedWorkerId?: string | null
  preselectedWorkerName?: string | null
  preselectedBalance?: number | null
  onSuccess?: () => void
}

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const RegisterVacationDialog = ({
  open,
  onOpenChange,
  entityId,
  workers,
  preselectedWorkerId = null,
  preselectedWorkerName = null,
  preselectedBalance = null,
  onSuccess,
}: RegisterVacationDialogProps) => {
  const queryClient = useQueryClient()
  const [workerId, setWorkerId] = React.useState("")
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [requestId, setRequestId] = React.useState<string>("")

  // Re/Inicializa al abrir: nueva clave de idempotencia y trabajador preseleccionado.
  React.useEffect(() => {
    if (!open) return
    setWorkerId(preselectedWorkerId ?? "")
    setStartDate("")
    setEndDate("")
    setNotes("")
    setError(null)
    setSubmitting(false)
    setRequestId(newRequestId())
  }, [open, preselectedWorkerId])

  const effectiveWorkerId = workerId || preselectedWorkerId || ""
  const selectedBalance = React.useMemo(() => {
    if (preselectedWorkerId && effectiveWorkerId === preselectedWorkerId) {
      return preselectedBalance ?? 0
    }
    return workers.find((w) => w.id === effectiveWorkerId)?.balance ?? null
  }, [workers, effectiveWorkerId, preselectedWorkerId, preselectedBalance])

  const preview = React.useMemo(
    () => previewVacationConsumption(startDate, endDate),
    [startDate, endDate]
  )

  const tooLong = preview.naturalDays > VACATION_MAX_NATURAL_DAYS
  const insufficient = selectedBalance !== null && preview.valid && preview.chargedDays > selectedBalance
  const datesInvalid = !!startDate && !!endDate && new Date(endDate) < new Date(startDate)

  const canSubmit =
    !submitting &&
    !!effectiveWorkerId &&
    preview.valid &&
    !tooLong &&
    !insufficient &&
    !datesInvalid

  const balanceAfter =
    selectedBalance === null ? null : Math.round((selectedBalance - preview.chargedDays) * 10000) / 10000

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await registerWorkerVacation({
        workerId: effectiveWorkerId,
        startDate,
        endDate,
        notes: notes.trim() || null,
        requestId,
      })
      invalidateVacationData(queryClient)
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron registrar las vacaciones.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-sitecorp-primary" /> Registrar vacaciones
          </DialogTitle>
          <DialogDescription>
            Entre 1 y 15 días naturales. Los domingos no consumen saldo; los sábados sí.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <SiteCorpAlert type="danger" title="No se pudo registrar">
              {error}
            </SiteCorpAlert>
          )}

          {!preselectedWorkerId && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Trabajador</label>
              <SiteCorpSelect value={workerId} onValueChange={setWorkerId} disabled={submitting}>
                <option value="">Seleccione un trabajador…</option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.full_name}
                  </option>
                ))}
              </SiteCorpSelect>
            </div>
          )}

          {preselectedWorkerId && preselectedWorkerName && (
            <p className="text-sm text-ink">
              Trabajador: <strong>{preselectedWorkerName}</strong>
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Fecha de inicio</label>
              <SiteCorpInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Fecha final</label>
              <SiteCorpInput
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Observaciones (opcional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo, referencia o comentario"
              disabled={submitting}
              rows={2}
            />
          </div>

          {preview.valid && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Período natural</dt>
                <dd className="text-right font-medium text-ink">{preview.naturalDays} días</dd>
                <dt className="text-muted-foreground">Domingos incluidos</dt>
                <dd className="text-right font-medium text-ink">{preview.sundays}</dd>
                <dt className="text-muted-foreground">Días que se descontarán</dt>
                <dd className="text-right font-semibold text-sitecorp-primary">
                  {formatVacationDays(preview.chargedDays)}
                </dd>
                {selectedBalance !== null && (
                  <>
                    <dt className="text-muted-foreground">Saldo actual</dt>
                    <dd className="text-right font-medium text-ink">
                      {formatVacationDays(selectedBalance)}
                    </dd>
                    <dt className="text-muted-foreground">Saldo después</dt>
                    <dd className="text-right font-semibold text-ink">
                      {formatVacationDays(balanceAfter)}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {tooLong && (
            <SiteCorpAlert type="warning">
              El período supera el máximo de 15 días naturales consecutivos.
            </SiteCorpAlert>
          )}
          {insufficient && selectedBalance !== null && (
            <SiteCorpAlert type="warning">
              El trabajador dispone de {formatVacationDays(selectedBalance)} días y el período
              seleccionado consumiría {formatVacationDays(preview.chargedDays)} días.
            </SiteCorpAlert>
          )}
          {datesInvalid && (
            <SiteCorpAlert type="warning">
              La fecha final no puede ser anterior a la fecha inicial.
            </SiteCorpAlert>
          )}
        </div>

        <DialogFooter>
          <SiteCorpButton
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </SiteCorpButton>
          <SiteCorpButton type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Registrando…" : "Registrar vacaciones"}
          </SiteCorpButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RegisterVacationDialog
