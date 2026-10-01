import * as React from "react"
import { useState, useEffect } from "react"
import { useToast } from "@/components/ui/use-toast"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpFormSection } from "@/components/ui/sitecorp-form-section"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { previewVacationConsumption } from "@/lib/vacations"
import { registerWorkerVacation } from "@/lib/vacations"
import { formatVacationDays } from "@/lib/vacations"
import { CalendarCheck2, XCircle } from "lucide-react"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"

interface VacationWorkerOption {
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

const formSchema = z.object({
  workerId: z.string().nonempty("El trabajador es obligatorio"),
  startDate: z.string().nonempty("La fecha de inicio es obligatoria"),
  endDate: z.string().nonempty("La fecha final es obligatoria"),
  notes: z.string().optional(),
})

export const RegisterVacationDialog = ({
  open,
  onOpenChange,
  entityId,
  workers,
  preselectedWorkerId,
  preselectedWorkerName,
  preselectedBalance,
  onSuccess,
}: RegisterVacationDialogProps) => {
  const { toast } = useToast()
  const [requestId] = useState(() => crypto.randomUUID())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      workerId: preselectedWorkerId || "",
      startDate: "",
      endDate: "",
      notes: "",
    },
  })

  const workerId = form.watch("workerId")
  const startDate = form.watch("startDate")
  const endDate = form.watch("endDate")

  const [preview, setPreview] = useState<{
    naturalDays: number
    sundays: number
    chargedDays: number
    valid: boolean
  } | null>(null)

  useEffect(() => {
    if (startDate && endDate) {
      setPreview(previewVacationConsumption(startDate, endDate))
    } else {
      setPreview(null)
    }
  }, [startDate, endDate])

  const selectedWorker = workers.find((w) => w.id === workerId)
  const workerBalance = selectedWorker?.balance ?? preselectedBalance ?? 0
  const chargedDays = preview?.chargedDays ?? 0
  const balanceOk = chargedDays <= workerBalance

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setError(null)
    setSubmitting(true)

    try {
      const result = await registerWorkerVacation({
        workerId: data.workerId,
        startDate: data.startDate,
        endDate: data.endDate,
        notes: data.notes ?? null,
        requestId,
      })

      toast({
        title: "Vacaciones registradas",
        description: `Se registraron ${result.charged_days} días consumidos. Saldo actual: ${formatVacationDays(result.balance)}.`,
      })

      setSubmitting(false)
      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (e: any) {
      setError(e.message || "Error desconocido al registrar vacaciones")
      setSubmitting(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <SiteCorpCard>
      <h2 className="text-lg font-semibold text-ink mb-4">
        {preselectedWorkerName ? `Registrar vacaciones para ${preselectedWorkerName}` : "Registrar vacaciones"}
      </h2>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Worker selection */}
        <SiteCorpFormSection title="Trabajador">
          <SiteCorpSelect
            disabled={workers.length <= 1}
            onValueChange={(val) => form.setValue("workerId", val as string)}
          >
            <option value="">Seleccionar trabajador</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name}
              </option>
            ))}
          </SiteCorpSelect>
        </SiteCorpFormSection>

        {/* Balance info */}
        {workers.length > 0 && (
          <SiteCorpFormSection title="Saldo">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border p-2">
                <p className="text-xs font-medium text-muted-foreground">Disponible</p>
                <p className="text-lg font-semibold text-ink">{formatVacationDays(workerBalance)}</p>
              </div>
              <div className="rounded-xl border border-border p-2">
                <p className="text-xs font-medium text-muted-foreground">A cargo</p>
                <p className="text-lg font-semibold text-sitecorp-danger">{formatVacationDays(chargedDays)}</p>
              </div>
            </div>
          </SiteCorpFormSection>
        )}

        {/* Preview */}
        {preview && (
          <SiteCorpAlert
            type={balanceOk ? "success" : "warning"}
            title={preview.valid ? "Previsualización" : "Período inválido"}
          >
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Días naturales</p>
                <p className="font-medium text-ink">{preview.naturalDays}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Domingos</p>
                <p className="font-medium text-ink">{preview.sundays}</p>
              </div>
              <div>
                <p className="text-muted-foreground">A descontar</p>
                <p className="font-medium text-ink">{formatVacationDays(preview.chargedDays)}</p>
              </div>
            </div>
            {preview.valid && balanceOk && (
              <p className="mt-2 text-sm text-sitecorp-success">
                Saldo suficiente: el trabajador dispone de {formatVacationDays(workerBalance)} días.
              </p>
            )}
            {!preview.valid && (
              <p className="mt-2 text-sm text-sitecorp-danger">
                El período debe tener entre 1 y 15 días naturales.
              </p>
            )}
            {preview.valid && !balanceOk && (
              <p className="mt-2 text-sm text-sitecorp-danger">
                Saldo insuficiente: el trabajador dispone de {formatVacationDays(workerBalance)} días y el período consumiría {formatVacationDays(preview.chargedDays)} días.
              </p>
            )}
          </SiteCorpAlert>
        )}

        {/* Date fields */}
        <SiteCorpFormSection title="Fechas">
          <SiteCorpInput
            type="date"
            name="startDate"
            placeholder="Fecha de inicio"
            {...form.register("startDate")}
          />
          <SiteCorpInput
            type="date"
            name="endDate"
            placeholder="Fecha final"
            {...form.register("endDate")}
          />
          <SiteCorpInput
            name="notes"
            placeholder="Observaciones (opcional)"
            {...form.register("notes")}
          />
        </SiteCorpFormSection>

        {/* Action buttons */}
        <div className="flex gap-3 pt-3">
          <SiteCorpButton
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            variant="outline"
          >
            <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar
          </SiteCorpButton>

          <SiteCorpButton
            type="submit"
            disabled={submitting || !balanceOk}
            variant="default"
          >
            {submitting ? "Guardando…" : "Guardar vacaciones"}
            {!submitting && <CalendarCheck2 className="ml-1 h-3.5 w-3.5" />}
          </SiteCorpButton>
        </div>

        {error && (
          <p className="mt-2 text-sm text-sitecorp-danger">{error}</p>
        )}
      </form>
    </SiteCorpCard>
  )
}

export default RegisterVacationDialog