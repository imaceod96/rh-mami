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
import { showSuccess, showError } from "@/utils/toast"
import { FileSignature } from "lucide-react"

interface ContractType {
  id: string
  name: string
  code: string
}

export interface CurrentContractInfo {
  id: string
  typeName: string | null
  typeCode: string | null
  startDate: string
  endDate: string | null
}

interface ChangeContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workerId: string
  current: CurrentContractInfo
  onSuccess: () => void
}

const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const ChangeContractDialog: React.FC<ChangeContractDialogProps> = ({
  open,
  onOpenChange,
  workerId,
  current,
  onSuccess,
}) => {
  const [contractTypes, setContractTypes] = React.useState<ContractType[]>([])
  const [loading, setLoading] = React.useState(false)
  const [newContractTypeId, setNewContractTypeId] = React.useState("")
  const [effectiveDate, setEffectiveDate] = React.useState("")
  const [newEndDate, setNewEndDate] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setNewContractTypeId("")
    setEffectiveDate("")
    setNewEndDate("")
    setNotes("")
    setError(null)
    setLoading(true)
    supabase
      .from("employment_contract_types")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name")
      .then(({ data, error: err }) => {
        if (err) {
          console.error("Error loading contract types:", err)
          setError("No se pudieron cargar los tipos de contrato.")
        } else {
          setContractTypes((data as ContractType[]) || [])
        }
        setLoading(false)
      })
  }, [open])

  const selectedType = contractTypes.find((t) => t.id === newContractTypeId) || null
  const isDetermined = selectedType?.code === "DETERMINADO"
  const minDate = current.startDate ? addDays(current.startDate, 1) : undefined

  React.useEffect(() => {
    if (!isDetermined) setNewEndDate("")
  }, [isDetermined])

  const handleSubmit = async () => {
    setError(null)

    if (!newContractTypeId) {
      setError("Selecciona el nuevo tipo de contrato.")
      return
    }
    if (!effectiveDate) {
      setError("La fecha efectiva es obligatoria.")
      return
    }
    if (current.startDate && effectiveDate <= current.startDate) {
      setError("La fecha efectiva debe ser posterior al inicio del contrato vigente.")
      return
    }
    if (isDetermined && !newEndDate) {
      setError("El contrato por tiempo determinado requiere una fecha de finalización.")
      return
    }
    if (newEndDate && newEndDate <= effectiveDate) {
      setError("La fecha de finalización debe ser posterior a la fecha efectiva.")
      return
    }

    setSubmitting(true)
    try {
      const { error: rpcError } = await supabase.rpc("change_worker_contract", {
        p_worker_id: workerId,
        p_new_contract_type_id: newContractTypeId,
        p_effective_date: effectiveDate,
        p_new_end_date: isDetermined ? newEndDate : null,
        p_notes: notes.trim() || null,
      })
      if (rpcError) throw rpcError

      showSuccess("Cambio de contrato realizado correctamente.")
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      let friendly = "No se pudo completar el cambio de contrato."
      if (/posterior al inicio del contrato/i.test(msg)) {
        friendly = "La fecha efectiva debe ser posterior al inicio del contrato vigente."
      } else if (/requiere una fecha de finalizaci[oó]n/i.test(msg)) {
        friendly = "El contrato por tiempo determinado requiere una fecha de finalización."
      } else if (/posterior a la fecha efectiva/i.test(msg)) {
        friendly = "La fecha de finalización debe ser posterior a la fecha efectiva."
      } else if (/no tiene un contrato vigente/i.test(msg)) {
        friendly = "El trabajador no tiene un contrato vigente."
      } else if (/no est[aá] activo/i.test(msg)) {
        friendly = "El trabajador no está activo. Utiliza Reincorporar."
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle>Cambiar contrato</DialogTitle>
          <DialogDescription>
            Se cerrará el contrato vigente y se creará uno nuevo. El contrato anterior se
            conserva como histórico. El puesto, la capacidad y el salario no cambian.
          </DialogDescription>
        </DialogHeader>

        {/* Contrato actual */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contrato actual
          </p>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Tipo</dt>
              <dd className="text-sm font-medium text-ink">{current.typeName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fecha de inicio</dt>
              <dd className="text-sm font-medium text-ink">{current.startDate || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Finalización prevista</dt>
              <dd className="text-sm font-medium text-ink">
                {current.endDate || "Sin fecha de fin"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nuevo tipo de contrato *</Label>
            <SiteCorpSelect value={newContractTypeId} onValueChange={setNewContractTypeId}>
              <option value="">{loading ? "Cargando tipos…" : "Seleccionar tipo"}</option>
              {contractTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SiteCorpSelect>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fecha efectiva *</Label>
              <SiteCorpInput
                type="date"
                value={effectiveDate}
                min={minDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Finalización prevista{isDetermined ? " *" : ""}</Label>
              <SiteCorpInput
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                disabled={!isDetermined}
                min={effectiveDate || undefined}
              />
              {!isDetermined && (
                <p className="text-xs text-muted-foreground">
                  La modalidad de tiempo indeterminado no requiere fecha de finalización.
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
              placeholder="Ej.: Conversión a contrato por tiempo indeterminado."
            />
          </div>

          {error && <SiteCorpAlert type="danger">{error}</SiteCorpAlert>}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <SiteCorpButton variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </SiteCorpButton>
          <SiteCorpButton type="button" onClick={handleSubmit} disabled={submitting || loading}>
            <FileSignature className="mr-2 h-4 w-4" />
            {submitting ? "Procesando…" : "Confirmar cambio de contrato"}
          </SiteCorpButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ChangeContractDialog
