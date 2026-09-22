import * as React from "react"
import { supabase } from "@/lib/supabase"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SelectItem } from "@/components/ui/select"
import { Building2, Factory, Layers, Save } from "lucide-react"
import type { OrganizationEntity } from "@/components/entity-users-dialog"

interface Tenant {
  id: string
  name: string
  code: string
  is_active: boolean
}

type EntityType = OrganizationEntity["entity_type"]

interface EntityForm {
  tenant_id: string
  entity_type: EntityType
  parent_id: string
  name: string
  description: string
  regime_id: string
  is_active: boolean
  is_sitecorp_account: boolean
  account_code: string
  account_is_active: boolean
  address: string
  municipality: string
  province: string
  postal_code: string
}

const emptyForm = (tenantId: string, entityType: EntityType = "business_group"): EntityForm => ({
  tenant_id: tenantId,
  entity_type: entityType,
  parent_id: "",
  name: "",
  description: "",
  regime_id: "PRESUPUESTADA",
  is_active: true,
  is_sitecorp_account: false,
  account_code: "",
  account_is_active: false,
  address: "",
  municipality: "",
  province: "",
  postal_code: "",
})

const entityTypeLabels: Record<EntityType, string> = {
  business_group: "Grupo empresarial",
  company: "Empresa",
  ueb: "UEB / Unidad Empresarial de Base",
}

const parentTypeByEntity: Record<EntityType, EntityType> = {
  business_group: "company",
  company: "business_group",
  ueb: "company",
}

const normalizeCode = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^[-]+|[-]+$/g, "")
    .slice(0, 56) || "ENTIDAD"

const friendlyEntityError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const normalized = message.toLowerCase()

  if (normalized.includes("uq_org_entities_tenant_name")) {
    return "Ya existe una entidad con ese nombre en este workspace."
  }
  if (normalized.includes("uq_org_entities_tenant_code")) {
    return "Ya existe una entidad con ese código interno."
  }
  if (normalized.includes("uq_org_entities_tenant_account_code")) {
    return "Ya existe una cuenta SiteCorp con ese código en este workspace."
  }
  if (normalized.includes("parent must be")) {
    return "El padre seleccionado no corresponde al tipo de entidad."
  }
  if (normalized.includes("same tenant")) {
    return "La entidad padre debe pertenecer al mismo workspace."
  }
  if (normalized.includes("cycle")) {
    return "No se puede usar un descendiente como entidad padre."
  }
  if (normalized.includes("row-level security")) {
    return "No tienes permiso para crear o editar esta entidad."
  }
  return message || "No se pudo guardar la entidad."
}

const buildUniqueCode = (
  base: string,
  tenantId: string,
  entities: OrganizationEntity[],
  currentId?: string
) => {
  const normalized = normalizeCode(base)
  const occupied = entities
    .filter((entity) => entity.tenant_id === tenantId && entity.id !== currentId)
    .map((entity) => entity.code)
  let candidate = normalized
  let counter = 2

  while (occupied.includes(candidate)) {
    candidate = `${normalized}-${counter}`
    counter += 1
  }

  return candidate
}

export const OrganizationEntityDialog = ({
  open,
  onOpenChange,
  onSaved,
  tenants,
  entities,
  editingEntity,
  defaultTenantId,
  defaultParentId,
  defaultEntityType = "business_group",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  tenants: Tenant[]
  entities: OrganizationEntity[]
  editingEntity: OrganizationEntity | null
  defaultTenantId: string
  defaultParentId?: string
  defaultEntityType?: EntityType
}) => {
  const [form, setForm] = React.useState<EntityForm>(emptyForm(defaultTenantId))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return

    setError(null)

    if (editingEntity) {
      setForm({
        tenant_id: editingEntity.tenant_id,
        entity_type: editingEntity.entity_type,
        parent_id: editingEntity.parent_id || "",
        name: editingEntity.name,
        description: editingEntity.description || "",
        regime_id: editingEntity.regime_id,
        is_active: editingEntity.is_active,
        is_sitecorp_account: editingEntity.is_sitecorp_account,
        account_code: editingEntity.account_code || "",
        account_is_active: editingEntity.account_is_active,
        address: editingEntity.address || "",
        municipality: editingEntity.municipality || "",
        province: editingEntity.province || "",
        postal_code: editingEntity.postal_code || "",
      })
      return
    }

    setForm({
      ...emptyForm(defaultTenantId, defaultEntityType),
      parent_id: defaultParentId || "",
    })
  }, [open, editingEntity, defaultTenantId, defaultParentId, defaultEntityType])

  const descendants = React.useMemo(() => {
    if (!editingEntity) return new Set<string>()

    const childrenByParent = entities.reduce<Record<string, string[]>>((map, entity) => {
      if (!entity.parent_id) return map
      map[entity.parent_id] = [...(map[entity.parent_id] || []), entity.id]
      return map
    }, {})

    const result = new Set<string>()
    const queue = [editingEntity.id]

    while (queue.length > 0) {
      const current = queue.shift() as string
      for (const child of childrenByParent[current] || []) {
        if (!result.has(child)) {
          result.add(child)
          queue.push(child)
        }
      }
    }

    return result
  }, [editingEntity, entities])

  const parentOptions = entities.filter((entity) => {
    if (entity.tenant_id !== form.tenant_id) return false
    if (!entity.is_active) return false
    if (entity.entity_type !== parentTypeByEntity[form.entity_type]) return false
    if (editingEntity && (entity.id === editingEntity.id || descendants.has(entity.id))) return false
    return true
  })

  const setFieldType = (value: string) => {
    setForm((current) => ({
      ...current,
      entity_type: value as EntityType,
      parent_id: "",
    }))
  }

  const setAccountEnabled = (value: string) => {
    const enabled = value === "yes"
    setForm((current) => ({
      ...current,
      is_sitecorp_account: enabled,
      account_code: enabled ? current.account_code : "",
      account_is_active: enabled ? current.account_is_active : false,
    }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      setError(null)

      if (!form.tenant_id) throw new Error("Selecciona un workspace.")
      if (!form.name.trim()) throw new Error("El nombre es obligatorio.")
      if (form.entity_type !== "business_group" && !form.parent_id) {
        throw new Error(
          form.entity_type === "company"
            ? "Selecciona el grupo empresarial padre."
            : "Selecciona la empresa padre."
        )
      }
      if (form.is_sitecorp_account && !form.account_code.trim()) {
        throw new Error("El código de cuenta SiteCorp es obligatorio.")
      }

      const accountCode = form.is_sitecorp_account ? form.account_code.trim().toUpperCase() : null
      const duplicateAccount = entities.some(
        (entity) =>
          entity.tenant_id === form.tenant_id &&
          entity.id !== editingEntity?.id &&
          accountCode !== null &&
          entity.account_code?.toUpperCase() === accountCode
      )
      if (duplicateAccount) {
        throw new Error("Ya existe una cuenta SiteCorp con ese código en este workspace.")
      }

      setSaving(true)

      const payload = {
        tenant_id: form.tenant_id,
        parent_id: form.entity_type === "business_group" ? null : form.parent_id,
        entity_type: form.entity_type,
        name: form.name.trim(),
        code: editingEntity?.code || buildUniqueCode(form.name, form.tenant_id, entities, editingEntity?.id),
        regime_id: form.regime_id,
        status: form.is_active ? "active" : "inactive",
        description: form.description.trim() || null,
        address: form.address.trim() || null,
        municipality: form.municipality.trim() || null,
        province: form.province.trim() || null,
        postal_code: form.postal_code.trim() || null,
        is_active: form.is_active,
        is_sitecorp_account: form.is_sitecorp_account,
        account_code: accountCode,
        account_is_active: form.is_sitecorp_account && form.account_is_active,
      }

      const response = editingEntity
        ? await supabase.from("organization_entities").update(payload).eq("id", editingEntity.id)
        : await supabase.from("organization_entities").insert(payload)

      if (response.error) throw response.error

      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(friendlyEntityError(err))
    } finally {
      setSaving(false)
    }
  }

  const typeIcon = (type: EntityType) => {
    if (type === "business_group") return <Layers className="h-4 w-4 text-sitecorp-primary" />
    if (type === "company") return <Building2 className="h-4 w-4 text-sitecorp-primary" />
    return <Factory className="h-4 w-4 text-sitecorp-primary" />
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {typeIcon(form.entity_type)}
            {editingEntity ? `Editar ${editingEntity.name}` : "Nueva entidad"}
          </DialogTitle>
          <DialogDescription>
            Los grupos empresariales contienen empresas y las empresas contienen UEB.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <SiteCorpAlert type="danger" title="Error">
            {error}
          </SiteCorpAlert>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <SiteCorpSelect
              label="Tipo de entidad"
              value={form.entity_type}
              onValueChange={setFieldType}
              disabled={Boolean(editingEntity)}
            >
              <SelectItem value="business_group">Grupo empresarial</SelectItem>
              <SelectItem value="company">Empresa</SelectItem>
              <SelectItem value="ueb">UEB / Unidad Empresarial de Base</SelectItem>
            </SiteCorpSelect>

            {!editingEntity && (
              <SiteCorpSelect
                label="Workspace"
                value={form.tenant_id}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, tenant_id: value, parent_id: "" }))
                }
              >
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SiteCorpSelect>
            )}

            {form.entity_type !== "business_group" && (
              <SiteCorpSelect
                label={form.entity_type === "company" ? "Grupo empresarial" : "Empresa"}
                value={form.parent_id}
                onValueChange={(value) => setForm((current) => ({ ...current, parent_id: value }))}
              >
                {parentOptions.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>
                    {entity.name}
                  </SelectItem>
                ))}
              </SiteCorpSelect>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Nombre</label>
              <SiteCorpInput
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nombre oficial"
                required
              />
            </div>
            <SiteCorpSelect
              label="Régimen"
              value={form.regime_id}
              onValueChange={(value) => setForm((current) => ({ ...current, regime_id: value }))}
            >
              <SelectItem value="PRESUPUESTADA">Presupuestada</SelectItem>
              <SelectItem value="EMPRESARIAL">Empresarial</SelectItem>
            </SiteCorpSelect>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Descripción</label>
            <SiteCorpInput
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Descripción opcional"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SiteCorpSelect
              label="¿Tiene cuenta propia de SiteCorp?"
              value={form.is_sitecorp_account ? "yes" : "no"}
              onValueChange={setAccountEnabled}
            >
              <SelectItem value="yes">Sí</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SiteCorpSelect>

            {form.is_sitecorp_account && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">Código de cuenta</label>
                  <SiteCorpInput
                    value={form.account_code}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, account_code: event.target.value }))
                    }
                    placeholder="CUENTA-XXX"
                    required
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-sitecorp-background/60 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, is_active: checked === true }))
                }
              />
              Entidad activa
            </label>

            {form.is_sitecorp_account && (
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <Checkbox
                  checked={form.account_is_active}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, account_is_active: checked === true }))
                  }
                />
                Cuenta activa
              </label>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Dirección</label>
              <SiteCorpInput
                value={form.address}
                onChange={(event) =>
                  setForm((current) => ({ ...current, address: event.target.value }))
                }
                placeholder="Calle y número"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Municipio</label>
              <SiteCorpInput
                value={form.municipality}
                onChange={(event) =>
                  setForm((current) => ({ ...current, municipality: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Provincia</label>
              <SiteCorpInput
                value={form.province}
                onChange={(event) =>
                  setForm((current) => ({ ...current, province: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Código postal</label>
              <SiteCorpInput
                value={form.postal_code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, postal_code: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <SiteCorpButton
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Guardando..." : editingEntity ? "Guardar cambios" : "Crear entidad"}
            </SiteCorpButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default OrganizationEntityDialog
