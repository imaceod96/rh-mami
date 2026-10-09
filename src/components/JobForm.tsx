import * as React from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { SiteCorpCheckbox } from "@/components/ui/sitecorp-checkbox"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toRomanNumeral } from "@/utils/roman-numerals"
import {
  NO_OCCUPATIONAL_CATEGORY_LABEL,
  fetchOccupationalCategories,
  type OccupationalCategory,
} from "@/domains/organization-structure"
import type { SalaryGroup, SalaryGroupWithCurrent } from "@/contexts/SalaryContext"

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

interface JobFormEditingJob {
  id: string
  name: string
  code: string
  description: string | null
  area_id: string
  hierarchy_order: number
  salary_group_id: string
  occupational_category_id: string | null
  required_profession_or_trade: string | null
  work_content: string | null
  is_cuadro: boolean | null
  is_principal_specialist: boolean | null
  // Condiciones Laborales Anormales (presentes en la fila real de organization_jobs)
  has_abnormal_conditions?: boolean | null
  cla_day_enabled?: boolean | null
  cla_day_hourly_rate?: number | null
  cla_night_enabled?: boolean | null
}

interface JobFormProps {
  entityId: string
  editingJob?: JobFormEditingJob | null
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
  const [categories, setCategories] = React.useState<OccupationalCategory[]>([])
  const [preparationLevels, setPreparationLevels] = React.useState<{ id: string; name: string; code: string }[]>([])
  const [selectedPreparationLevels, setSelectedPreparationLevels] = React.useState<string[]>([])
  const [isCuadro, setIsCuadro] = React.useState(false)
  const [isPrincipalSpecialist, setIsPrincipalSpecialist] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = React.useState<string>("")
  const [selectedCategory, setSelectedCategory] = React.useState<string>("")
  const [salaryVigente, setSalaryVigente] = React.useState<{
      amount: number
      currency_code: string
    } | null>(null)
    const [scaleInfo, setScaleInfo] = React.useState<{
      scaleId: string | null
      scaleName: string
      scopeType: string | null
      regime: string | null
    } | null>(null)
    // CLA — Condiciones Laborales Anormales (configuración del CARGO).
    // Reutiliza la opción existente "Condiciones anormales"; NO es Nocturnidad.
    const [hasAbnormalConditions, setHasAbnormalConditions] = React.useState(false)
    const [claDayEnabled, setClaDayEnabled] = React.useState(false)
    const [claDayRate, setClaDayRate] = React.useState("")
    const [claNightEnabled, setClaNightEnabled] = React.useState(false)
    const [claNight1Start, setClaNight1Start] = React.useState("")
    const [claNight1End, setClaNight1End] = React.useState("")
    const [claNight1Rate, setClaNight1Rate] = React.useState("")
    const [claNight2Start, setClaNight2Start] = React.useState("")
    const [claNight2End, setClaNight2End] = React.useState("")
    const [claNight2Rate, setClaNight2Rate] = React.useState("")

  const navigate = useNavigate()

  const loadData = React.useCallback(async () => {
    if (!entityId) return

    setLoading(true)
    setError(null)
    let stage: "areas" | "categorias" | "escala" | "grupos" = "areas"

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

      // Catálogo GLOBAL de categorías ocupacionales (nunca hardcodeado en React)
      stage = "categorias"
      setCategories(await fetchOccupationalCategories())

      // Catálogo GLOBAL de niveles de preparación
      const { data: prepData, error: prepError } = await supabase
        .from("preparation_levels")
        .select("id, name, code")
        .eq("is_active", true)
        .order("sort_order")
      if (prepError) throw prepError
      setPreparationLevels((prepData as { id: string; name: string; code: string }[]) || [])

      stage = "escala"

      // Régimen de la entidad (para mensajes específicos por régimen)
      const { data: entityData, error: entityError } = await supabase
        .from("organization_entities")
        .select("id, regime_id")
        .eq("id", entityId)
        .maybeSingle()

      if (entityError) throw entityError
      const regime = ((entityData?.regime_id as string | null) || "").toUpperCase() || null

      // Escala aplicable a la entidad (RPC SECURITY DEFINER):
      // PRESUPUESTADA → escala global; EMPRESARIAL → escala de esta entidad (sin fallback)
      const { data: scaleData, error: scaleError } = await supabase.rpc(
        "resolve_salary_scale_for_entity",
        { entity_id: entityId }
      )

      if (scaleError) throw scaleError

      const resolvedScaleId = (scaleData as string | null) || null

      stage = "grupos"

      if (!resolvedScaleId) {
        setScaleInfo({ scaleId: null, scaleName: "", scopeType: null, regime })
        setGroups([])
      } else {
        // Detalles de la escala (tolerante a RLS: el nombre es solo informativo)
        const { data: scaleRows, error: scaleDetailsError } = await supabase
          .from("salary_scales")
          .select("id, name, scope_type")
          .eq("id", resolvedScaleId)

        if (scaleDetailsError) throw scaleDetailsError

        const scaleDetails = (scaleRows as { id: string; name: string | null; scope_type: string | null }[] | null)?.[0] || null

        setScaleInfo({
          scaleId: resolvedScaleId,
          scaleName: scaleDetails?.name || "Escala aplicable",
          scopeType: scaleDetails?.scope_type || null,
          regime,
        })

        // Grupos pertenecientes a ESA escala (relación real: salary_groups.salary_scale_id)
        const { data: groupsData, error: groupsError } = await supabase
          .from("salary_groups")
          .select("*")
          .eq("salary_scale_id", resolvedScaleId)
          .eq("is_active", true)
          .order("sequence_number")

        if (groupsError) throw groupsError

        // Fetch current values for each group
        const groupsWithValues: SalaryGroupWithCurrent[] = []
        for (const group of groupsData as SalaryGroup[]) {
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
            current_value: valueError && valueError.code !== "PGRST116" ? null : valueData,
            roman_numeral: toRomanNumeral(group.sequence_number),
          })
        }

        setGroups(groupsWithValues)
      }
    } catch (err) {
      console.error("Error loading data:", err)
      setError(
        stage === "areas"
          ? "No se pudieron cargar las áreas."
          : stage === "categorias"
            ? "No se pudieron cargar las categorías ocupacionales."
            : "No se pudieron cargar los grupos salariales."
      )
    } finally {
      setLoading(false)
    }
  }, [entityId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (!editingJob) {
      // Cargo nuevo: clasificación y retribución parten vacías
      setSelectedGroup("")
      setSelectedCategory("")
      setSelectedPreparationLevels([])
      setIsCuadro(false)
      setIsPrincipalSpecialist(false)
      setSalaryVigente(null)
      setHasAbnormalConditions(false)
      setClaDayEnabled(false)
      setClaDayRate("")
      setClaNightEnabled(false)
      setClaNight1Start("")
      setClaNight1End("")
      setClaNight1Rate("")
      setClaNight2Start("")
      setClaNight2End("")
      setClaNight2Rate("")
      return
    }

    setSelectedGroup(editingJob.salary_group_id)
        setSelectedCategory(editingJob.occupational_category_id || "")
        setSelectedPreparationLevels([])
        setIsCuadro(!!editingJob.is_cuadro)
        setIsPrincipalSpecialist(!!editingJob.is_principal_specialist)
        setHasAbnormalConditions(editingJob.has_abnormal_conditions || false)
        setClaDayEnabled(!!editingJob.cla_day_enabled)
        setClaDayRate(
          editingJob.cla_day_hourly_rate != null ? String(editingJob.cla_day_hourly_rate) : ""
        )
        setClaNightEnabled(!!editingJob.cla_night_enabled)
        setClaNight1Start("")
        setClaNight1End("")
        setClaNight1Rate("")
        setClaNight2Start("")
        setClaNight2End("")
        setClaNight2Rate("")

        // Tramos nocturnos CLA configurados para este Cargo (tabla hija)
        if (editingJob.id) {
          supabase
            .from("organization_job_cla_night_segments")
            .select("segment_order, start_time, end_time, hourly_rate")
            .eq("organization_job_id", editingJob.id)
            .order("segment_order")
            .then(({ data: segData, error: segError }) => {
              if (segError || !segData) return
              const segs = segData as { segment_order: number; start_time: string; end_time: string; hourly_rate: number }[]
              const s1 = segs.find((s) => s.segment_order === 1)
              const s2 = segs.find((s) => s.segment_order === 2)
              if (s1) {
                setClaNight1Start(String(s1.start_time).slice(0, 5))
                setClaNight1End(String(s1.end_time).slice(0, 5))
                setClaNight1Rate(String(s1.hourly_rate))
              }
              if (s2) {
                setClaNight2Start(String(s2.start_time).slice(0, 5))
                setClaNight2End(String(s2.end_time).slice(0, 5))
                setClaNight2Rate(String(s2.hourly_rate))
              }
            })
        }

        // Load existing preparation levels for this job
        if (editingJob.id) {
          supabase
            .from("organization_job_preparation_levels")
            .select("preparation_level_id")
            .eq("organization_job_id", editingJob.id)
            .then(({ data: jobPrepData, error: jobPrepError }) => {
              if (!jobPrepError && jobPrepData) {
                setSelectedPreparationLevels(
                  (jobPrepData as { preparation_level_id: string }[]).map(r => r.preparation_level_id)
                )
              }
            })
        }
    
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

  // Reemplazo atómico de los dos tramos nocturnos CLA del Cargo. Cuando el pago
  // nocturno está desactivado se eliminan (no se guardan horarios huérfanos).
  const saveClaNightSegments = async (jobId: string) => {
    await supabase
      .from("organization_job_cla_night_segments")
      .delete()
      .eq("organization_job_id", jobId)
    if (hasAbnormalConditions && claNightEnabled) {
      const { error: segError } = await supabase
        .from("organization_job_cla_night_segments")
        .insert([
          {
            organization_job_id: jobId,
            organization_entity_id: entityId,
            segment_order: 1,
            start_time: claNight1Start,
            end_time: claNight1End,
            hourly_rate: parseFloat(claNight1Rate),
          },
          {
            organization_job_id: jobId,
            organization_entity_id: entityId,
            segment_order: 2,
            start_time: claNight2Start,
            end_time: claNight2End,
            hourly_rate: parseFloat(claNight2Rate),
          },
        ])
      if (segError) throw segError
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!entityId) return
  
      setFormError(null)
  
      const form = e.target as HTMLFormElement
      const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim()
      const area_id = (form.elements.namedItem("area_id") as HTMLSelectElement).value
      const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value.trim() || null
      const required_profession_or_trade =
        ((form.elements.namedItem("required_profession_or_trade") as HTMLInputElement)?.value || "").trim() || null
      const work_content =
        ((form.elements.namedItem("work_content") as HTMLTextAreaElement)?.value || "").trim() || null
      const hierarchy_order = parseInt(
        (form.elements.namedItem("hierarchy_order") as HTMLInputElement).value,
        10
      )

    if (!name) {
      setFormError("El nombre es obligatorio")
      return
    }
    if (!area_id) {
      setFormError("El área es obligatoria")
      return
    }
    // Integridad contractual: la categoría ocupacional alimenta el contrato, por
    // lo que debe completarse también al editar cargos históricos incompletos.
    if (!selectedCategory) {
      setFormError("La categoría ocupacional es obligatoria")
      return
    }
    if (!selectedGroup) {
          setFormError("El grupo salarial es obligatorio")
          return
        }
    
        // Validación de CLA (no guardar configuraciones incompletas)
        if (hasAbnormalConditions) {
          if (claDayEnabled) {
            const rate = parseFloat(claDayRate)
            if (claDayRate.trim() === "" || isNaN(rate) || rate < 0) {
              setFormError("Indica una tarifa horaria válida (≥ 0) para el pago diurno de CLA")
              return
            }
          }
          if (claNightEnabled) {
            if (!claNight1Start || !claNight1End) {
              setFormError("Tramo nocturno 1: indica hora de inicio y hora de fin")
              return
            }
            const r1 = parseFloat(claNight1Rate)
            if (claNight1Rate.trim() === "" || isNaN(r1) || r1 < 0) {
              setFormError("Tramo nocturno 1: indica una tarifa horaria válida (≥ 0)")
              return
            }
            if (!claNight2Start || !claNight2End) {
              setFormError("Tramo nocturno 2: indica hora de inicio y hora de fin")
              return
            }
            const r2 = parseFloat(claNight2Rate)
            if (claNight2Rate.trim() === "" || isNaN(r2) || r2 < 0) {
              setFormError("Tramo nocturno 2: indica una tarifa horaria válida (≥ 0)")
              return
            }
          }
        }
    
        // Verify the area belongs to this entity
    const area = areas.find((a) => a.id === area_id)
    if (!area || area.organization_entity_id !== entityId) {
      setFormError("El área seleccionada no pertenece a esta entidad")
      return
    }

    setSubmitting(true)

    try {
          const claDayRateValue =
            hasAbnormalConditions && claDayEnabled ? parseFloat(claDayRate) : null
    
          if (editingJob) {
            const { error: updateError } = await supabase
              .from("organization_jobs")
              .update({
                name,
                area_id,
                description,
                salary_group_id: selectedGroup,
                hierarchy_order: isNaN(hierarchy_order) ? 0 : hierarchy_order,
                occupational_category_id: selectedCategory || null,
                required_profession_or_trade,
                work_content,
                has_abnormal_conditions: hasAbnormalConditions,
                cla_day_enabled: hasAbnormalConditions && claDayEnabled,
                cla_day_hourly_rate: claDayRateValue,
                cla_night_enabled: hasAbnormalConditions && claNightEnabled,
                is_cuadro: isCuadro,
                is_principal_specialist: isPrincipalSpecialist,
              })
              .eq("id", editingJob.id)
    
            if (updateError) throw updateError
            await saveClaNightSegments(editingJob.id)
            await supabase.from("organization_job_preparation_levels").delete().eq("organization_job_id", editingJob.id)
            if (selectedPreparationLevels.length > 0) {
              const { error: prepError } = await supabase
                .from("organization_job_preparation_levels")
                .insert(selectedPreparationLevels.map(preparation_level_id => ({ organization_job_id: editingJob.id, preparation_level_id })))
              if (prepError) throw prepError
            }
            onSuccess()
          } else {
            const { data: insertedJob, error: insertError } = await supabase
              .from("organization_jobs")
              .insert({
                organization_entity_id: entityId,
                name,
                area_id,
                description,
                salary_group_id: selectedGroup,
                hierarchy_order: isNaN(hierarchy_order) ? 0 : hierarchy_order,
                is_active: true,
                occupational_category_id: selectedCategory,
                required_profession_or_trade,
                work_content,
                has_abnormal_conditions: hasAbnormalConditions,
                cla_day_enabled: hasAbnormalConditions && claDayEnabled,
                cla_day_hourly_rate: claDayRateValue,
                cla_night_enabled: hasAbnormalConditions && claNightEnabled,
                is_cuadro: isCuadro,
                is_principal_specialist: isPrincipalSpecialist,
              })
              .select("id")
              .single()
    
            if (insertError) throw insertError
            if (insertedJob) await saveClaNightSegments(insertedJob.id)
            if (insertedJob && selectedPreparationLevels.length > 0) {
              const { error: prepError } = await supabase
                .from("organization_job_preparation_levels")
                .insert(selectedPreparationLevels.map(preparation_level_id => ({ organization_job_id: insertedJob.id, preparation_level_id })))
              if (prepError) throw prepError
            }
            onSuccess()
          }
        } catch (err) {
      console.error("Error saving job:", err)
      const message =
        err instanceof Error ? err.message : "Error al guardar el cargo"
      if (message.includes("categoría ocupacional")) {
        setFormError("La categoría ocupacional es obligatoria para los cargos nuevos.")
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

  const missingCategory = !!editingJob && !editingJob.occupational_category_id

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {formError && <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>}

      {/* INFORMACIÓN GENERAL */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Información general
        </p>

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
            <Label htmlFor="job-code">Código</Label>
            {editingJob ? (
              <SiteCorpInput
                id="job-code"
                name="code"
                value={editingJob.code || ""}
                readOnly
                className="bg-muted/50"
              />
            ) : (
              <SiteCorpInput
                id="job-code"
                name="code"
                value=""
                readOnly
                placeholder="Se generará automáticamente"
                className="bg-muted/50"
              />
            )}
            <p className="text-xs text-muted-foreground">
              {editingJob
                ? "Código generado automáticamente a partir del área y el nombre. Es de solo lectura."
                : "El código se genera automáticamente al guardar, combinando el código del área y el nombre del cargo."}
            </p>
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
          <Label htmlFor="job-description">Descripción</Label>
          <Textarea
            id="job-description"
            name="description"
            defaultValue={editingJob?.description || ""}
            placeholder="Descripción opcional del cargo"
            rows={2}
          />
        </div>
      </div>

      {/* CLASIFICACIÓN LABORAL */}
      <div className="space-y-4 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Clasificación laboral
        </p>

        {missingCategory && (
          <SiteCorpAlert type="warning">
            {NO_OCCUPATIONAL_CATEGORY_LABEL}. Complete la clasificación laboral del cargo; no se ha
            asignado ninguna categoría automáticamente.
          </SiteCorpAlert>
        )}

        <div className="space-y-2">
          <Label htmlFor="job-occupational-category">Categoría ocupacional *</Label>
          <SiteCorpSelect
            value={selectedCategory}
            onValueChange={setSelectedCategory}
          >
            <option value="">
              {missingCategory ? "Sin categoría ocupacional configurada" : "Seleccionar categoría"}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SiteCorpSelect>
          <p className="text-xs text-muted-foreground">
            Catálogo global de SiteCorp (Operario, Administrativo, Servicios, Técnico).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="job-preparation-levels">Nivel de Preparación</Label>
          <div className="flex flex-wrap gap-2">
            {preparationLevels.map((level) => {
              const checked = selectedPreparationLevels.includes(level.id)
              return (
                <label
                  key={level.id}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                    checked
                      ? "border-sitecorp-primary bg-sitecorp-primary/10 text-sitecorp-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-sitecorp-primary focus:ring-sitecorp-primary"
                    checked={checked}
                    onChange={(e) => {
                      const id = level.id
                      setSelectedPreparationLevels(
                        e.target.checked
                          ? [...selectedPreparationLevels, id]
                          : selectedPreparationLevels.filter((l) => l !== id)
                      )
                    }}
                  />
                  <span>{level.name}</span>
                  <span className="text-xs opacity-70">({level.code})</span>
                </label>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Puede seleccionar una o varias opciones. Describe la preparación que admite/requiere el cargo.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="job-required-profession">Profesión u oficio requerido</Label>
          <SiteCorpInput
            id="job-required-profession"
            name="required_profession_or_trade"
            defaultValue={editingJob?.required_profession_or_trade || ""}
            placeholder="Ej.: Licenciado en Contabilidad"
          />
          <p className="text-xs text-muted-foreground">
            Requisito del cargo. Es independiente de la profesión u oficio que posea la persona
            contratada.
          </p>
        </div>
      </div>

      {/* RETRIBUCIÓN */}
      <div className="space-y-4 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Retribución
        </p>

        <div className="space-y-2">
          <Label htmlFor="job-group">Grupo salarial *</Label>
          <SiteCorpSelect
            value={selectedGroup}
            onValueChange={handleGroupChange}
            required
            disabled={!!scaleInfo && !scaleInfo.scaleId}
          >
            <option value="">Seleccionar grupo salarial</option>
            {groups.map((g) => (
              <option key={g.group.id} value={g.group.id}>
                Grupo {g.roman_numeral}
                {g.current_value
                  ? ` — ${g.current_value.amount.toLocaleString("es-CU", {
                      minimumFractionDigits: 2,
                    })} ${g.current_value.currency_code}`
                  : " — Salario no configurado"}
              </option>
            ))}
          </SiteCorpSelect>
          {scaleInfo && scaleInfo.scaleId ? (
            <>
              <p className="text-xs text-muted-foreground">
                Escala: {scaleInfo.scaleName}
              </p>
              {groups.length === 0 && (
                <p className="text-xs text-sitecorp-danger">
                  {scaleInfo.scopeType === "PRESUPUESTADA_GLOBAL"
                    ? "La escala salarial presupuestada todavía no tiene grupos configurados."
                    : "La escala salarial de esta entidad todavía no tiene grupos configurados."}
                </p>
              )}
            </>
          ) : scaleInfo && scaleInfo.regime === "EMPRESARIAL" ? (
            <div className="space-y-1">
              <p className="text-xs text-sitecorp-danger">
                No hay escala salarial empresarial configurada para esta entidad.
              </p>
              <button
                type="button"
                onClick={() => navigate(`/entity/${entityId}/settings/salary`)}
                className="text-xs font-medium text-sitecorp-primary underline underline-offset-2 hover:opacity-80"
              >
                Ir a Ajustes → Escala salarial
              </button>
            </div>
          ) : scaleInfo ? (
            <p className="text-xs text-sitecorp-danger">
              La escala salarial presupuestada todavía no tiene grupos configurados.
            </p>
          ) : null}
        </div>

        {/* Salario derivado: nunca se escribe manualmente desde el cargo */}
                {salaryVigente && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">Salario actual</p>
                      <SiteCorpStatusBadge status="info">Calculado automáticamente</SiteCorpStatusBadge>
                    </div>
                    <p className="text-lg font-semibold text-ink">
                      {salaryVigente.amount.toLocaleString("es-CU", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      {salaryVigente.currency_code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Derivado del grupo salarial y de la escala aplicable a la entidad.
                    </p>
                  </div>
                )}
              </div>
        
              {/* CLA — CONDICIONES LABORALES ANORMALES (configuración del Cargo) */}
              <div className="space-y-4 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Condiciones Laborales Anormales (CLA)
                </p>
        
                <div className="space-y-2">
                  <SiteCorpCheckbox
                    label="Condiciones anormales"
                    checked={hasAbnormalConditions}
                    onCheckedChange={(checked) => setHasAbnormalConditions(!!checked)}
                  />
                  <p className="text-xs text-muted-foreground">
                    CLA es un concepto independiente de la Nocturnidad. Las tarifas pertenecen al Cargo,
                    no al trabajador ni a la Prenómina.
                  </p>
                </div>
        
                {hasAbnormalConditions && (
                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                    {/* Pago diurno */}
                    <div className="space-y-3">
                      <SiteCorpCheckbox
                        label="Pago diurno"
                        checked={claDayEnabled}
                        onCheckedChange={(checked) => setClaDayEnabled(!!checked)}
                      />
                      {claDayEnabled && (
                        <div className="space-y-2 pl-6">
                          <Label htmlFor="job-cla-day-rate">Pago por hora diurna (CUP/h)</Label>
                          <SiteCorpInput
                            id="job-cla-day-rate"
                            type="number"
                            min="0"
                            step="0.01"
                            value={claDayRate}
                            onChange={(e) => setClaDayRate(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      )}
                    </div>
        
                    {/* Pago nocturno: dos tramos configurables */}
                    <div className="space-y-3 border-t pt-3">
                      <SiteCorpCheckbox
                        label="Pago nocturno"
                        checked={claNightEnabled}
                        onCheckedChange={(checked) => setClaNightEnabled(!!checked)}
                      />
                      {claNightEnabled && (
                        <div className="space-y-4 pl-6">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-ink">Tramo nocturno 1</p>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <Label>Desde</Label>
                                <input
                                  type="time"
                                  value={claNight1Start}
                                  onChange={(e) => setClaNight1Start(e.target.value)}
                                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Hasta</Label>
                                <input
                                  type="time"
                                  value={claNight1End}
                                  onChange={(e) => setClaNight1End(e.target.value)}
                                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Pago por hora (CUP/h)</Label>
                                <SiteCorpInput
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={claNight1Rate}
                                  onChange={(e) => setClaNight1Rate(e.target.value)}
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
        
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-ink">Tramo nocturno 2</p>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <Label>Desde</Label>
                                <input
                                  type="time"
                                  value={claNight2Start}
                                  onChange={(e) => setClaNight2Start(e.target.value)}
                                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Hasta</Label>
                                <input
                                  type="time"
                                  value={claNight2End}
                                  onChange={(e) => setClaNight2End(e.target.value)}
                                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Pago por hora (CUP/h)</Label>
                                <SiteCorpInput
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={claNight2Rate}
                                  onChange={(e) => setClaNight2Rate(e.target.value)}
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
        
                          <p className="text-xs text-muted-foreground">
                            Los dos tramos son independientes y admiten horarios que cruzan medianoche
                            (p. ej. 23:00 → 07:00).
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
                            
                            {/* DOCUMENTACIÓN DEL CARGO */}
                            <div className="space-y-4 border-t border-border pt-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Documentación del cargo
                              </p>
              
                              <div className="space-y-2">
                                <SiteCorpCheckbox
                                  label="Cuadro"
                                  checked={isCuadro}
                                  onCheckedChange={(checked) => {
                                    setIsCuadro(!!checked)
                                    if (checked) setIsPrincipalSpecialist(false)
                                  }}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Si está marcado, el motor documental no generará contrato alguno para este cargo.
                                </p>
                              </div>
              
                              <div className="space-y-2">
                                <SiteCorpCheckbox
                                  label="Especialista Principal"
                                  checked={isPrincipalSpecialist}
                                  onCheckedChange={(checked) => {
                                    setIsPrincipalSpecialist(!!checked)
                                    if (checked) setIsCuadro(false)
                                  }}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Si está marcado, el motor documental espera una Resolución en lugar de contrato.
                                </p>
                              </div>
                            </div>
                            
                            {/* CONTENIDO DE TRABAJO */}
      <div className="space-y-4 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contenido de trabajo
        </p>

        <div className="space-y-2">
          <Label htmlFor="job-work-content">Funciones / contenido de trabajo</Label>
          <Textarea
            id="job-work-content"
            name="work_content"
            defaultValue={editingJob?.work_content || ""}
            placeholder="Funciones y responsabilidades generales correspondientes al cargo"
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            Este contenido pertenece al cargo y se reutiliza desde sus puestos.
          </p>
        </div>
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
