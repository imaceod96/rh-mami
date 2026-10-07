import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpCheckbox } from "@/components/ui/sitecorp-checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  X,
  Loader2,
  ChevronDown,
} from "lucide-react"
import { SelectItem } from "@/components/ui/select"
import AcademicCategoryPaymentSection from "@/components/settings/AcademicCategoryPaymentSection"

interface TenureScaleRange {
  id: string
  from_months: number
  to_months: number | null
  amount: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface TenureScaleForm {
  from_amount: string
  from_unit: "Meses" | "Años"
  to_amount: string
  to_unit: "Meses" | "Años" | null
  to_limit: boolean
  amount: string
}

const EntitySettingsTenureScale = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()

  const [ranges, setRanges] = React.useState<TenureScaleRange[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [formDialogOpen, setFormDialogOpen] = React.useState(false)
  const [formMode, setFormMode] = React.useState<"create" | "edit">("create")
  const [formData, setFormData] = React.useState<TenureScaleForm>({
    from_amount: "",
    from_unit: "Meses",
    to_amount: "",
    to_unit: "Meses",
    to_limit: false,
    amount: "",
  })
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const loadRanges = React.useCallback(async () => {
    if (!entityId) return

    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from("tenure_payment_scales")
        .select("*")
        .eq("organization_entity_id", entityId)
        .eq("is_active", true)
        .order("from_months")

      if (fetchError) throw fetchError
      setRanges(data as TenureScaleRange[])
    } catch (err) {
      console.error("Error loading tenure scales:", err)
      setError(
        err instanceof Error ? err.message : "Error al cargar los tramos de escala"
      )
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    loadRanges()
  }, [loadRanges])

  const handleOpenCreateForm = () => {
    setFormMode("create")
    setFormData({
      from_amount: "",
      from_unit: "Meses",
      to_amount: "",
      to_unit: "Meses",
      to_limit: false,
      amount: "",
    })
    setEditingId(null)
    setFormDialogOpen(true)
  }

  const handleOpenEditForm = (range: TenureScaleRange) => {
    setFormMode("edit")
    const fromYears = Math.floor(range.from_months / 12)
    const fromMonths = range.from_months % 12
    setFormData({
      from_amount: String(fromYears > 0 ? fromYears : fromMonths),
      from_unit: fromYears > 0 ? "Años" : "Meses",
      to_amount:
        range.to_months !== null
          ? String(
              Math.floor(range.to_months / 12) > 0
                ? Math.floor(range.to_months / 12)
                : range.to_months % 12
            )
          : "",
      to_unit:
        range.to_months !== null
          ? Math.floor(range.to_months / 12) > 0
            ? "Años"
            : "Meses"
          : "Meses",
      to_limit: range.to_months === null,
      amount: String(range.amount),
    })
    setEditingId(range.id)
    setFormDialogOpen(true)
  }

  const handleCloseForm = () => {
    setFormDialogOpen(false)
    setEditingId(null)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entityId) return

    setSubmitting(true)
    try {
      const fromMonths =
        (formData.from_unit === "Años"
          ? parseFloat(formData.from_amount) * 12
          : parseFloat(formData.from_amount)) || 0

      const toMonths =
        formData.to_limit
          ? null
          : (formData.to_unit === "Años"
              ? parseFloat(formData.to_amount) * 12
              : parseFloat(formData.to_amount)) || null

      const amount = parseFloat(formData.amount)

      if (isNaN(fromMonths) || fromMonths < 0) {
        setError("El valor 'Desde' debe ser un número válido positivo")
        setSubmitting(false)
        return
      }

      if (!formData.to_limit && (isNaN(toMonths) || toMonths < 0)) {
        setError("El valor 'Hasta' debe ser un número válido positivo")
        setSubmitting(false)
        return
      }

      if (!formData.to_limit && toMonths !== null && toMonths <= fromMonths) {
        setError("El valor 'Hasta' debe ser mayor que 'Desde'")
        setSubmitting(false)
        return
      }

      if (isNaN(amount) || amount < 0) {
        setError("El importe debe ser un número válido positivo o cero")
        setSubmitting(false)
        return
      }

      if (formMode === "create") {
        const { error: insertError } = await supabase
          .from("tenure_payment_scales")
          .insert({
            organization_entity_id: entityId,
            from_months: fromMonths,
            to_months: toMonths,
            amount: amount,
            is_active: true,
          })

        if (insertError) throw insertError
      } else {
        if (!editingId) throw new Error("ID de edición no disponible")

        const { error: updateError } = await supabase
          .from("tenure_payment_scales")
          .update({
            from_months: fromMonths,
            to_months: toMonths,
            amount: amount,
            is_active: true,
          })
          .eq("id", editingId)

        if (updateError) throw updateError
      }

      setFormDialogOpen(false)
      await loadRanges()
    } catch (err) {
      console.error("Error saving tenure scale:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Error al guardar el tramo de escala salarial"
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRange = async (id: string) => {
    if (!window.confirm("¿Está seguro de eliminar este tramo?")) return

    try {
      const { error: deleteError } = await supabase
        .from("tenure_payment_scales")
        .update({ is_active: false })
        .eq("id", id)

      if (deleteError) throw deleteError
      await loadRanges()
    } catch (err) {
      console.error("Error deleting tenure scale:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Error al eliminar el tramo de escala salarial"
      )
    }
  }

  const formatRange = (range: TenureScaleRange): string => {
    const fromYears = Math.floor(range.from_months / 12)
    const fromMonths = range.from_months % 12
    const fromStr =
      fromYears > 0
        ? `${fromYears} ${fromYears === 1 ? "año" : "años"}`
        : `${fromMonths} ${fromMonths === 1 ? "mes" : "meses"}`

    if (range.to_months === null) {
      return `${fromStr} en adelante`
    }

    const toYears = Math.floor(range.to_months / 12)
    const toMonths = range.to_months % 12
    const toStr =
      toYears > 0
        ? `${toYears} ${toYears === 1 ? "año" : "años"}`
        : `${toMonths} ${toMonths === 1 ? "mes" : "meses"}`

    return `${fromStr} a ${toStr}`
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Escala de pago de antigüedad" />
        <SiteCorpAlert type="info">Cargando...</SiteCorpAlert>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Escala de pago de antigüedad" />
        <SiteCorpAlert type="danger">{error}</SiteCorpAlert>
        <SiteCorpButton variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </SiteCorpButton>
        {entityId && <AcademicCategoryPaymentSection entityId={entityId} />}
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Escala de pago de antigüedad"
        description="Configure los tramos de antigüedad y sus importes asociados"
        actions={
          <SiteCorpButton
            variant="default"
            onClick={handleOpenCreateForm}
            className="ml-4"
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo tramo
          </SiteCorpButton>
        }
      />

      {ranges.length === 0 ? (
        <SiteCorpAlert type="info">
          No hay tramos configurados. Haga clic en "Nuevo tramo" para comenzar.
        </SiteCorpAlert>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Desde
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Hasta
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Total a pagar
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ranges.map((range) => (
                  <tr key={range.id} className="hover:bg-muted">
                    <td className="px-4 py-3">{formatRange(range)}</td>
                    <td className="px-4 py-3">
                      {range.to_months === null ? (
                        <span className="font-medium text-sitecorp-primary">
                          Sin límite
                        </span>
                      ) : (
                        formatRange(range)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {range.amount.toLocaleString("es-CU", {
                        minimumFractionDigits: 2,
                      })} CUP
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      <SiteCorpButton
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditForm(range)}
                        className="flex items-center gap-1"
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </SiteCorpButton>
                      <SiteCorpButton
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRange(range.id)}
                        className="flex items-center gap-1 text-sitecorp-danger"
                      >
                        <Trash2 className="h-3 w-3" /> Eliminar
                      </SiteCorpButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sección independiente: pago por categoría académica (Máster / Doctor).
          Presupuestada → configuración global; Empresarial → configuración de la entidad. */}
      {entityId && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pago por categoría académica
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <AcademicCategoryPaymentSection entityId={entityId} />
        </div>
      )}

      <Dialog
              open={formDialogOpen}
              onOpenChange={setFormDialogOpen}
            >
        <DialogContent className="p-6 space-y-4">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create" ? "Nuevo tramo" : "Editar tramo"}
            </DialogTitle>
            <DialogDescription>
              Configure un nuevo tramo de antigüedad para esta entidad.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Desde</Label>
                <div className="flex items-center gap-2">
                  <SiteCorpInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.from_amount}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, from_amount: e.target.value }))
                    }
                    placeholder="0"
                    required
                  />
                  <SiteCorpSelect
                                      value={formData.from_unit}
                                      onValueChange={(v) =>
                                        setFormData((d) => ({ ...d, from_unit: v as "Meses" | "Años" }))
                                      }
                                    >
                    <option value="Meses">Meses</option>
                    <option value="Años">Años</option>
                  </SiteCorpSelect>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ejemplo: 1 Meses o 1 Años
                </p>
              </div>

              <div className="space-y-2">
                <Label>Hasta</Label>
                <div className="flex items-center gap-2">
                  <SiteCorpInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.to_amount}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, to_amount: e.target.value }))
                    }
                    placeholder="0"
                    disabled={formData.to_limit}
                  />
                  <SiteCorpSelect
                                      value={formData.to_unit}
                                      onValueChange={(v) =>
                                        setFormData((d) => ({ ...d, to_unit: v as "Meses" | "Años" }))
                                      }
                                      disabled={formData.to_limit}
                                    >
                    <option value="Meses">Meses</option>
                    <option value="Años">Años</option>
                  </SiteCorpSelect>
                  <SiteCorpCheckbox
                                      label="Sin límite"
                                      checked={formData.to_limit}
                                      onCheckedChange={(checked) =>
                                        setFormData((d) => ({
                                          ...d,
                                          to_limit: !!checked,
                                          to_amount: checked ? "" : formData.to_amount,
                                          to_unit: checked ? "Meses" : formData.to_unit,
                                        }))
                                      }
                                      disabled={false}
                                    />
                </div>
                <p className="text-xs text-muted-foreground">
                  Deje el campo cantidad vacío o marque "Sin límite" para el
                  último tramo
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Total a pagar *</Label>
              <SiteCorpInput
                type="number"
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, amount: e.target.value }))
                }
                placeholder="0.00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Importe en CUP asociado a este tramo de antigüedad
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <SiteCorpButton
                variant="outline"
                type="button"
                onClick={handleCloseForm}
              >
                Cancelar
              </SiteCorpButton>
              <SiteCorpButton
                type="submit"
                disabled={submitting}
                className="ml-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3" />
                    Guardando...
                  </>
                ) : formMode === "create" ? (
                  "Crear tramo"
                ) : (
                  "Actualizar tramo"
                )}
              </SiteCorpButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EntitySettingsTenureScale