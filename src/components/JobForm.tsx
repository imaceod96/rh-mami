import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toRomanNumeral } from "@/utils/roman-numerals"
import type { SalaryGroupWithCurrent } from "@/contexts/SalaryContext"

interface OrganizationArea {
  id: string
  organization_entity_id: string
  parent_area_id: string | null
  code: string
  name: string
  description: string | null
  hierarchy_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface JobFormData {
  name: string
  code: string
  area_id: string
  description: string
  salary_group_id: string
  hierarchy_order: string
}

interface JobFormProps {
  entityId: string
  editingJob?: any | null
  onSuccess: () => void
  onCancel: () => void
}

export const JobForm: React.FC<JobFormProps> = ({
  entityId,
  editingJob,
  onSuccess,
  onCancel,
}) => {
  const [areas, setAreas] = React.useState<OrganizationArea[]>([])
  const [groups, setGroups] = React.useState<SalaryGroupWithCurrent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = React.useState<string>("")
  const [salaryVigente, setSalaryVigente] = React.useState<{
    amount: number
    currency_code: string
  } | null>(null)
  const [scaleInfo, setScaleInfo] = React.useState<{
    scaleId: string | null
    scaleName: string
  } | null>(null)

  const loadData = React.useCallback(async () => {
    if (!entityId) return

    setLoading(true)
    setError(null)

    try {
      // Load active areas of this entity
      const { data: areasData, error: areasError } = await supabase
        .from("organization_areas")
        .select("*")
        .eq("organization_entity_id", entityId)
        .eq("is_active", true)
        .order("hierarchy_order")

      if (areasError) throw areasError
      setAreas((areasData as OrganizationArea[]) || [])

      // Load the entity's salary scale
      const { data: scaleData, error: scaleError } = await supabase.rpc(
        "resolve_salary_scale_for_entity",
        { entity_id: entityId }
      )

      if (scaleError) throw scaleError

      if (!scaleData) {
        setScaleInfo({ scaleId: null, scaleName: "" })
        setGroups([])
      } else {
        // Fetch scale details
        const { data: scaleDetails, error: scaleDetailsError } = await supabase
          .from("salary_scales")
          .select("id, name, scope_type")
          .eq("id", scaleData)
          .single()

        if (scaleDetailsError) throw scaleDetailsError

        setScaleInfo({
          scaleId: scaleDetails.id,
          scaleName: scaleDetails.name,
        })

        // Fetch groups for this scale
        const { data: groupsData, error: groupsError } = await supabase
          .from("salary_groups")
          .select("*")
          .eq("salary_scale_id", scaleData)
          .eq("is_active", true)
          .order("sequence_number")

        if (groupsError) throw groupsError

        // Fetch current values for each group
        const groupsWithValues: SalaryGroupWithCurrent[] = []
        for (const group of groupsData as any[]) {
          const { data: valueData, error: valueError } = await supabase
            .from("salary_group_values")
            .select("*")
            .eq("salary_group_id", group.id)
            .eq("is_active", true)
            .order("effective_from", { ascending: false })
            .limit(1)
            .single()

          groupsWithValues.push({
            group,
            current_value: valueError && valueError.code !== "PGRST116" ? null : (valueData as any),
            roman_numeral: toRomanNumeral(group.sequence_number),
          })
        }

        setGroups(groupsWithValues)
      }
    } catch (err) {
      console.error("Error loading data:", err)
      setError(err instanceof Error ? err.message : "Error al cargar los datos")
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (editingJob) {
      setSelectedGroup(editingJob.salary_group_id)
      // Load the current salary value for the editing job's group
      if (editingJob.salary_group_id) {
        supabase
          .from("salary_group_values")
          .select("*")
          .eq("salary_group_id", editingJob.salary_group_id)
          .eq("is_active", true)
          .order("effective_from", { ascending: false })
          .limit(1)
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              setSalaryVigente({
                amount: data.amount,
                currency_code: data.currency_code,
              })
            }
          })
      }
    }
  }, [editingJob])

  const handleGroupChange = async (groupId: string) => {
    setSelectedGroup(groupId)
    setSalaryVigente(null)

    if (!groupId) return

    const { data, error } = await supabase
      .from("salary_group_values")
      .select("*")
      .eq("salary_group_id", groupId)
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(1)
      .single()

    if (!error && data) {
      setSalaryVigente({
        amount: data.amount,
        currency_code: data.currency_code,
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!entityId) return
  
      setFormError(null)
  
      const form = e.target as HTMLFormElement
      const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim()
      const code = (form.elements.namedItem("code") as HTMLInputElement).value.trim()
      const area_id = (form.elements.namedItem("area_id") as HTMLSelectElement).value
      const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value.trim() || null
      const hierarchy_order = parseInt(
        (form.elements.namedItem("hierarchy_order") as HTMLInputElement).value,
        10
      )

    if (!name) {
      setFormError("El nombre es obligatorio")
      return
    }
    if (!code) {
      setFormError("El código es obligatorio")
      return
    }
    if (!area_id) {
      setFormError("El área es obligatoria")
      return
    }
    if (!selectedGroup) {
      setFormError("El grupo salarial es obligatorio")
      return
    }

    // Verify the area belongs to this entity
    const area = areas.find((a) => a.id === area_id)
    if (!area || area.organization_entity_id !== entityId) {
      setFormError("El área seleccionada no pertenece a esta entidad")
      return
    }

    // Check for duplicate code within the entity
    const duplicate = areas.find(
      (a) =>
        a.code.toLowerCase() === code.toLowerCase() &&
        a.id !== editingJob?.id
    )
    if (duplicate) {
      setFormError("Ya existe un cargo con ese código en esta entidad")
      return
    }

    setSubmitting(true)

    try {
      if (editingJob) {
        const { error: updateError } = await supabase
          .from("organization_jobs")
          .update({
            name,
            code,
            area_id,
            description,
            salary_group_id: selectedGroup,
            hierarchy_order: isNaN(hierarchy_order) ? 0 : hierarchy_order,
          })
          .eq("id", editingJob.id)

        if (updateError) throw updateError
        onSuccess()
      } else {
        const { error: insertError } = await supabase
          .from("organization_jobs")
          .insert({
            organization_entity_id: entityId,
            name,
            code,
            area_id,
            description,
            salary_group_id: selectedGroup,
            hierarchy_order: isNaN(hierarchy_order) ? 0 : hierarchy_order,
            is_active: true,
          })

        if (insertError) throw insertError
        onSuccess()
      }
    } catch (err) {
      console.error("Error saving job:", err)
      const message =
        err instanceof Error ? err.message : "Error al guardar el cargo"
      if (message.includes("organization_jobs_organization_entity_id_code_unique")) {
        setFormError("Ya existe un cargo con ese código en esta entidad")
      } else {
        setFormError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Cargando...</div>
  }

  if (error) {
    return (
      <SiteCorpAlert type="danger">
        <p className="font-medium">Error</p>
        <p>{error}</p>
      </SiteCorpAlert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>}

      <div className="space-y-2">
        <Label htmlFor="job-name">Nombre *</Label>
        <SiteCorpInput
          id="job-name"
          name="name"
          defaultValue={editingJob?.name || ""}
          placeholder="Ej.: Especialista de Recursos Humanos"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="job-code">Código *</Label>
          <SiteCorpInput
            id="job-code"
            name="code"
            defaultValue={editingJob?.code || ""}
            placeholder="Ej.: ESP-RRHH"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="job-order">Orden</Label>
          <SiteCorpInput
            id="job-order"
            name="hierarchy_order"
            type="number"
            defaultValue={editingJob?.hierarchy_order || 0}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
              <Label htmlFor="job-area">Área *</Label>
              <SiteCorpSelect
                name="area_id"
                defaultValue={editingJob?.area_id || ""}
                required
              >
                <option value="">Seleccionar área</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name} ({area.code})
                  </option>
                ))}
              </SiteCorpSelect>
              <p className="text-xs text-muted-foreground">
                Solo áreas activas de esta entidad.
              </p>
            </div>
      
            <div className="space-y-2">
              <Label htmlFor="job-group">Grupo salarial *</Label>
              <SiteCorpSelect
                value={selectedGroup}
                onValueChange={handleGroupChange}
                required
              >
          <option value="">Seleccionar grupo salarial</option>
          {groups.map((g) => (
            <option key={g.group.id} value={g.group.id}>
              Grupo {g.roman_numeral}
              {g.current_value
                ? ` — ${g.current_value.amount.toLocaleString("es-CU", {
                    minimumFractionDigits: 2,
                  })} ${g.current_value.currency_code}`
                : " — Sin valor vigente"}
            </option>
          ))}
        </SiteCorpSelect>
        {scaleInfo && scaleInfo.scaleId ? (
          <p className="text-xs text-muted-foreground">
            Escala: {scaleInfo.scaleName}
          </p>
        ) : (
          <p className="text-xs text-sitecorp-danger">
            No hay una escala salarial configurada para esta entidad.
          </p>
        )}
      </div>

      {salaryVigente && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Salario vigente</p>
          <p className="text-lg font-semibold text-ink">
            {salaryVigente.amount.toLocaleString("es-CU", {
              minimumFractionDigits: 2,
            })}{" "}
            {salaryVigente.currency_code}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="job-description">Descripción</Label>
        <Textarea
          id="job-description"
          name="description"
          defaultValue={editingJob?.description || ""}
          placeholder="Descripción opcional del cargo"
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <SiteCorpButton variant="outline" type="button" onClick={onCancel}>
          Cancelar
        </SiteCorpButton>
        <SiteCorpButton type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : editingJob ? "Guardar cambios" : "Crear cargo"}
        </SiteCorpButton>
      </div>
    </form>
  )
}