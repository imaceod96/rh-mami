import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toRomanNumeral } from "@/utils/roman-numerals"

export interface PositionJobOption {
  id: string
  name: string
  code: string
  is_active: boolean
  area_id: string
  area: {
    id: string
    name: string
    code: string
  }
  salary_group: {
    id: string
    salary_scale_id: string
    sequence_number: number
  } | null
}

export interface PositionEditingData {
  id: string
  job_id: string
  code: string
  name: string
  description: string | null
}

interface PositionFormProps {
  entityId: string
  jobs: PositionJobOption[]
  applicableScaleId: string | null
  salaryValuesByGroup: Record<string, { amount: number; currency_code: string } | null>
  editingPosition?: PositionEditingData | null
  onSuccess: () => void
  onCancel: () => void
}

const MAX_BATCH = 50

// Alfabeto sin caracteres ambiguos (0/O, 1/I) para códigos legibles
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const generatePositionCode = (): string => {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let suffix = ""
  for (let i = 0; i < bytes.length; i++) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return `PST-${suffix}`
}

const formatSalary = (value: { amount: number; currency_code: string }) =>
  `${value.amount.toLocaleString("es-CU", { minimumFractionDigits: 2 })} ${value.currency_code}`

export const PositionForm: React.FC<PositionFormProps> = ({
  entityId,
  jobs,
  applicableScaleId,
  salaryValuesByGroup,
  editingPosition,
  onSuccess,
  onCancel,
}) => {
  const isEditing = !!editingPosition

  const [selectedJobId, setSelectedJobId] = React.useState<string>(
    editingPosition?.job_id || ""
  )
  const [baseName, setBaseName] = React.useState<string>(editingPosition?.name || "")
  const [quantity, setQuantity] = React.useState<string>("1")
  const [description, setDescription] = React.useState<string>(
    editingPosition?.description || ""
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const activeJobs = React.useMemo(() => jobs.filter(j => j.is_active), [jobs])

  // Opciones del selector: solo cargos activos de esta entidad.
  // Al editar, incluir el cargo actual aunque esté inactivo para que sea visible.
  const jobOptions = React.useMemo(() => {
    if (!isEditing) return activeJobs
    const current = jobs.find(j => j.id === editingPosition!.job_id)
    if (current && !activeJobs.some(j => j.id === current.id)) {
      return [current, ...activeJobs]
    }
    return activeJobs
  }, [jobs, activeJobs, isEditing, editingPosition])

  const selectedJob = React.useMemo(
    () => jobs.find(j => j.id === selectedJobId) || null,
    [jobs, selectedJobId]
  )

  const handleJobChange = (jobId: string) => {
    setSelectedJobId(jobId)
    // Autocompletar el nombre base con el nombre del cargo mientras esté vacío
    // o coincida con el nombre del cargo previamente seleccionado.
    const job = jobs.find(j => j.id === jobId)
    if (job && !isEditing && (!baseName.trim() || jobs.some(j => j.name === baseName.trim()))) {
      setBaseName(job.name)
    }
  }

  // Información derivada de solo lectura: Área / Grupo salarial / Salario actual
  const derivedInfo = React.useMemo(() => {
    if (!selectedJob) return null
    const group = selectedJob.salary_group
    const area = selectedJob.area
    const groupLabel = group ? `Grupo ${toRomanNumeral(group.sequence_number)}` : "N/A"

    let salaryLabel: string | null = null
    if (!applicableScaleId) {
      salaryLabel = null
    } else if (group && group.salary_scale_id === applicableScaleId) {
      const value = salaryValuesByGroup[group.id]
      salaryLabel = value ? formatSalary(value) : null
    }

    return {
      areaLabel: area ? `${area.name} (${area.code})` : "N/A",
      groupLabel,
      salaryLabel,
    }
  }, [selectedJob, applicableScaleId, salaryValuesByGroup])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entityId) return

    setFormError(null)

    const name = baseName.trim()
    if (!selectedJobId) {
      setFormError("El cargo es obligatorio")
      return
    }
    if (!name) {
      setFormError("El nombre del puesto es obligatorio")
      return
    }

    const job = jobs.find(j => j.id === selectedJobId)
    if (!job) {
      setFormError("El cargo seleccionado no es válido")
      return
    }

    let qty = 1
    if (!isEditing) {
      qty = parseInt(quantity, 10)
      if (isNaN(qty) || qty < 1 || qty > MAX_BATCH) {
        setFormError(`La cantidad debe estar entre 1 y ${MAX_BATCH}`)
        return
      }
    }

    setSubmitting(true)

    try {
      if (isEditing) {
        const { error: updateError } = await supabase
          .from("organization_positions")
          .update({
            job_id: selectedJobId,
            name,
            description: description.trim() || null,
          })
          .eq("id", editingPosition!.id)

        if (updateError) throw updateError
        onSuccess()
      } else {
        // Generación masiva: N puestos con nombres/códigos únicos en un
        // único INSERT atómico (si falla, no queda creación parcial).
        await insertPositions({
          entityId,
          jobId: selectedJobId,
          baseName: name,
          quantity: qty,
          description: description.trim() || null,
        })
        onSuccess()
      }
    } catch (err) {
      console.error("Error saving position:", err)
      const message =
        err instanceof Error ? err.message : "Error al guardar el puesto"
      if (message.includes("organization_positions_entity_code_unique")) {
        setFormError("Conflicto de código, inténtalo de nuevo")
      } else if (message.includes("organization_positions_job_id_code_unique")) {
        setFormError("Conflicto de código, inténtalo de nuevo")
      } else {
        setFormError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const insertPositions = async (params: {
    entityId: string
    jobId: string
    baseName: string
    quantity: number
    description: string | null
  }) => {
    const buildRows = () => {
      const usedCodes = new Set<string>()
      return Array.from({ length: params.quantity }, (_, index) => {
        let code = generatePositionCode()
        while (usedCodes.has(code)) {
          code = generatePositionCode()
        }
        usedCodes.add(code)
        return {
          organization_entity_id: params.entityId,
          job_id: params.jobId,
          code,
          name:
            params.quantity === 1
              ? params.baseName
              : `${params.baseName} ${String(index + 1).padStart(2, "0")}`,
          description: params.description,
          position_order: index + 1,
          is_active: true,
        }
      })
    }

    // Reintento con códigos nuevos si hubiera colisión de unicidad (23505)
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase
        .from("organization_positions")
        .insert(buildRows())
      if (!error) return
      lastError = error
      const code = (error as { code?: string }).code || ""
      if (code !== "23505") throw error
    }
    throw lastError
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>}

      <div className="space-y-2">
        <Label htmlFor="position-job">Cargo *</Label>
        <SiteCorpSelect
          value={selectedJobId}
          onValueChange={handleJobChange}
        >
          <option value="">Seleccionar cargo</option>
          {jobOptions.map((job) => (
            <option key={job.id} value={job.id}>
              {job.name} ({job.code}){!job.is_active ? " — inactivo" : ""}
            </option>
          ))}
        </SiteCorpSelect>
        <p className="text-xs text-muted-foreground">
          Solo cargos activos de esta entidad.
        </p>
      </div>

      {derivedInfo && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Información derivada del cargo (solo lectura)
          </p>
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Área</dt>
              <dd className="text-sm font-medium text-ink">{derivedInfo.areaLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Grupo salarial</dt>
              <dd className="text-sm font-medium text-ink">{derivedInfo.groupLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Salario actual</dt>
              <dd className="text-sm font-medium text-ink">
                {derivedInfo.salaryLabel ? (
                  derivedInfo.salaryLabel
                ) : (
                  <span className="text-muted-foreground">
                    {applicableScaleId ? "Salario no configurado" : "Sin escala configurada"}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="position-name">
          {isEditing ? "Nombre del puesto *" : "Nombre base del puesto *"}
        </Label>
        <SiteCorpInput
          id="position-name"
          value={baseName}
          onChange={(e) => setBaseName(e.target.value)}
          placeholder="Ej.: Técnico de mantenimiento"
          required
        />
        {!isEditing && parseInt(quantity, 10) > 1 && (
          <p className="text-xs text-muted-foreground">
            Se crearán puestos con el patrón «{baseName || "…"} 01», «{baseName || "…"} 02»…
          </p>
        )}
      </div>

      {!isEditing && (
        <div className="space-y-2">
          <Label htmlFor="position-quantity">Cantidad *</Label>
          <SiteCorpInput
            id="position-quantity"
            type="number"
            min={1}
            max={MAX_BATCH}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Cantidad de puestos a crear (1–{MAX_BATCH}). El código se genera automáticamente.
          </p>
        </div>
      )}

      {isEditing && (
        <div className="space-y-2">
          <Label htmlFor="position-code">Código</Label>
          <SiteCorpInput
            id="position-code"
            value={editingPosition!.code}
            disabled
          />
          <p className="text-xs text-muted-foreground">
            El código se genera automáticamente y no puede modificarse.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="position-description">Descripción</Label>
        <Textarea
          id="position-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción opcional del puesto"
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <SiteCorpButton variant="outline" type="button" onClick={onCancel}>
          Cancelar
        </SiteCorpButton>
        <SiteCorpButton type="submit" disabled={submitting}>
          {submitting
            ? "Guardando..."
            : isEditing
              ? "Guardar cambios"
              : parseInt(quantity, 10) > 1
                ? `Crear ${parseInt(quantity, 10) || 1} puestos`
                : "Crear puesto"}
        </SiteCorpButton>
      </div>
    </form>
  )
}
