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
} from "@/lib/occupational-categories"
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
  const [categories, setCategories] = React.useState<OccupationalCategory[]>([])
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
    const [hasAbnormalConditions, setHasAbnormalConditions] = React.useState(false)
    const [abnormalConditionsAmount, setAbnormalConditionsAmount] = React.useState("")

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

        const scaleDetails = (scaleRows as any[] | null)?.[0] || null

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
      setSalaryVigente(null)
      return
    }

    setSelectedGroup(editingJob.salary_group_id)
        setSelectedCategory(editingJob.occupational_category_id || "")
        setHasAbnormalConditions(editingJob.has_abnormal_conditions || false)
        setAbnormalConditionsAmount(
          editingJob.has_abnormal_conditions && editingJob.abnormal_conditions_amount != null
            ? String(editingJob.abnormal_conditions_amount)
            : ""
        )
    
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

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!entityId) return
  
      setFormError(null)
  
      const form = e.target as HTMLFormElement
      const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim()
      const code = (form.elements.namedItem("code") as HTMLInputElement).value.trim()
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
    if (!code) {
      setFormError("El código es obligatorio")
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
    
        // Validación de Condiciones Anormales
        if (hasAbnormalConditions) {
          const amount = parseFloat(abnormalConditionsAmount)
          if (isNaN(amount) || abnormalConditionsAmount.trim() === "") {
            setFormError("Debe indicar el importe total a pagar para las condiciones anormales")
            return
          }
          if (amount < 0) {
            setFormError("El importe de condiciones anormales no puede ser negativo")
            return
          }
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
          const abnormalAmount = hasAbnormalConditions
            ? parseFloat(abnormalConditionsAmount)
            : null
    
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
                occupational_category_id: selectedCategory || null,
                required_profession_or_trade,
                work_content,
                has_abnormal_conditions: hasAbnormalConditions,
                abnormal_conditions_amount: abnormalAmount,
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
                occupational_category_id: selectedCategory,
                required_profession_or_trade,
                work_content,
                has_abnormal_conditions: hasAbnormalConditions,
                abnormal_conditions_amount: abnormalAmount,
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
      } else if (message.includes("categoría ocupacional")) {
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
        
              {/* CONDICIONES ANORMALES */}
              <div className="space-y-4 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Condiciones anormales
                </p>
        
                <div className="space-y-2">
                  <SiteCorpCheckbox
                    label="Condiciones Anormales"
                    checked={hasAbnormalConditions}
                    onCheckedChange={setHasAbnormalConditions}
                  />
                </div>
        
                {hasAbnormalConditions && (
                  <div className="space-y-2">
                    <Label htmlFor="job-abnormal-amount">Total a pagar *</Label>
                    <SiteCorpInput
                      id="job-abnormal-amount"
                      name="abnormal_conditions_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={abnormalConditionsAmount}
                      onChange={(e) => setAbnormalConditionsAmount(e.target.value)}
                      required
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground">
                      Importe monetario asociado a las condiciones anormales de este cargo.
                    </p>
                  </div>
                )}
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
