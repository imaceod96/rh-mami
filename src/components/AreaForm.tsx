import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

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

interface AreaFormProps {
  entityId: string
  areas: OrganizationArea[]
  editingArea: OrganizationArea | null
  onSuccess: () => void
  onCancel: () => void
}

export const AreaForm: React.FC<AreaFormProps> = ({
  entityId,
  areas,
  editingArea,
  onSuccess,
  onCancel,
}) => {
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  // Build parent options: active areas of this entity, excluding the area itself and its descendants
  const getDescendantIds = (areaId: string, all: OrganizationArea[]): Set<string> => {
    const result = new Set<string>()
    const stack = [areaId]
    while (stack.length > 0) {
      const current = stack.pop()!
      result.add(current)
      all.filter(a => a.parent_area_id === current).forEach(c => stack.push(c.id))
    }
    return result
  }

  const parentOptions = React.useMemo(() => {
    const excluded = editingArea ? getDescendantIds(editingArea.id, areas) : new Set<string>()
    let options = areas.filter(a => a.is_active && !excluded.has(a.id))

    // If editing, always include the current parent so the value is visible
    if (editingArea?.parent_area_id) {
      const currentParent = areas.find(a => a.id === editingArea.parent_area_id)
      if (currentParent && !options.some(o => o.id === currentParent.id)) {
        options = [...options, currentParent]
      }
    }
    return options.sort(
      (a, b) => a.hierarchy_order - b.hierarchy_order || a.name.localeCompare(b.name)
    )
  }, [areas, editingArea])

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!entityId) return
  
      setFormError(null)
  
      const form = e.target as HTMLFormElement
      const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim()
      const code = (form.elements.namedItem("code") as HTMLInputElement).value.trim()
      const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value.trim() || null
      const parent_area_id = (form.elements.namedItem("parent_area_id") as HTMLSelectElement).value || null
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

    // Check for duplicate code within the entity
    const duplicate = areas.find(
      (a) =>
        a.code.toLowerCase() === code.toLowerCase() &&
        a.id !== editingArea?.id
    )
    if (duplicate) {
      setFormError("Ya existe un área con ese código en esta entidad")
      return
    }

    // Validate parent area belongs to this entity
    if (parent_area_id) {
      const parent = areas.find(a => a.id === parent_area_id)
      if (!parent || parent.organization_entity_id !== entityId) {
        setFormError("El área superior seleccionada no pertenece a esta entidad")
        return
      }
    }

    setSubmitting(true)

    try {
      if (editingArea) {
        const { error: updateError } = await supabase
          .from("organization_areas")
          .update({
            name,
            code,
            description,
            parent_area_id: parent_area_id || null,
            hierarchy_order: isNaN(hierarchy_order) ? 0 : hierarchy_order,
          })
          .eq("id", editingArea.id)

        if (updateError) throw updateError
        onSuccess()
      } else {
        const { error: insertError } = await supabase
          .from("organization_areas")
          .insert({
            organization_entity_id: entityId,
            name,
            code,
            description,
            parent_area_id: parent_area_id || null,
            hierarchy_order: isNaN(hierarchy_order) ? 0 : hierarchy_order,
            is_active: true,
          })

        if (insertError) throw insertError
        onSuccess()
      }
    } catch (err) {
      console.error("Error saving area:", err)
      const message =
        err instanceof Error ? err.message : "Error al guardar el área"
      if (message.includes("organization_areas_organization_entity_id_code_unique")) {
        setFormError("Ya existe un área con ese código en esta entidad")
      } else {
        setFormError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>}

      <div className="space-y-2">
              <Label htmlFor="area-name">Nombre *</Label>
              <SiteCorpInput
                name="name"
                defaultValue={editingArea?.name || ""}
                placeholder="Ej.: Recursos Humanos"
                required
              />
            </div>

      <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="area-code">Código *</Label>
                <SiteCorpInput
                  name="code"
                  defaultValue={editingArea?.code || ""}
                  placeholder="Ej.: RRHH"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="area-order">Orden</Label>
                <SiteCorpInput
                  name="hierarchy_order"
                  type="number"
                  defaultValue={editingArea?.hierarchy_order || 0}
                  placeholder="0"
                />
              </div>
            </div>

      <div className="space-y-2">
              <Label htmlFor="area-parent">Área superior</Label>
              <SiteCorpSelect
                name="parent_area_id"
                defaultValue={editingArea?.parent_area_id || ""}
              >
                <option value="">Seleccionar área superior (opcional)</option>
                {parentOptions.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name} ({area.code})
                  </option>
                ))}
              </SiteCorpSelect>
              <p className="text-xs text-muted-foreground">
                Dejar vacío para crear un área raíz.
              </p>
            </div>

      <div className="space-y-2">
        <Label htmlFor="area-description">Descripción</Label>
        <Textarea
          id="area-description"
          name="description"
          defaultValue={editingArea?.description || ""}
          placeholder="Descripción opcional del área"
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <SiteCorpButton variant="outline" type="button" onClick={onCancel}>
          Cancelar
        </SiteCorpButton>
        <SiteCorpButton type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : editingArea ? "Guardar cambios" : "Crear área"}
        </SiteCorpButton>
      </div>
    </form>
  )
}
