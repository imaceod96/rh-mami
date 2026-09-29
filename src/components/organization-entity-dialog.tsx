import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { supabase } from "@/lib/supabase"
import { Button as SiteCorpButton } from "@/components/ui/button"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { SiteCorpSelect } from "@/components/ui/sitecorp-select"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Building2, Factory, Layers, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Tenant {
  id: string
  name: string
  [key: string]: any
}

interface OrganizationEntity {
  id: string
  tenant_id: string
  parent_id: string | null
  entity_type: "business_group" | "company" | "ueb"
  name: string
  code: string
  regime_id: string
  status: string
  description: string | null
  address: string | null
  municipality: string | null
  province: string | null
  postal_code: string | null
  is_active: boolean
  is_sitecorp_account: boolean
  account_is_active: boolean
  account_code: string | null
}

interface OrganizationEntityFormData {
  name: string
  entity_type: "business_group" | "company" | "ueb"
  regime_id: string | null
  is_active: boolean
  description: string | null
  is_sitecorp_account: boolean
  account_code: string | null
  parent_id: string | null
}

const entityTypeOptions = [
  { value: "business_group", label: "Grupo empresarial" },
  { value: "company", label: "Empresa" },
  { value: "ueb", label: "UEB" },
]

// Códigos canónicos del catálogo `entity_regimes` (determinan la escala salarial aplicable)
const regimeOptions = [
  { value: "PRESUPUESTADA", label: "Presupuestada" },
  { value: "EMPRESARIAL", label: "Empresarial" },
]

const statusOptions = [
  { value: "active", label: "Activo" },
  { value: "inactive", label: "Inactivo" },
]

// Generate automatic code based on entity type
const generateCode = (entityType: "business_group" | "company" | "ueb"): string => {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(6, "0").substring(0, 6)
  const prefixes: Record<string, string> = {
    business_group: "GE",
    company: "EMP",
    ueb: "UEB",
  }
  return `${prefixes[entityType]}-${timestamp}`
}

// El domicilio (dirección, provincia, municipio) ya no forma parte del alta de la
// entidad: se gestiona en Entidad → Ajustes → Datos contractuales.
const organizationEntitySchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  entity_type: z.enum(["business_group", "company", "ueb"]),
  regime_id: z.enum(["PRESUPUESTADA", "EMPRESARIAL"]).nullable(),
  is_active: z.boolean().default(true),
  description: z.string().nullable(),
  is_sitecorp_account: z.boolean().default(false),
  account_code: z.string().nullable(),
  parent_id: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (data.entity_type !== "business_group" && !data.parent_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parent_id"],
      message: "Selecciona la entidad superior.",
    })
  }
})

type OrganizationEntityFormDataZod = z.infer<typeof organizationEntitySchema>

interface OrganizationEntityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  tenants: Tenant[]
  entities: OrganizationEntity[]
  editingEntity: OrganizationEntity | null
  defaultEntityType?: OrganizationEntity["entity_type"]
  /** Entidad superior preseleccionada según el nodo desde el que se crea */
  defaultParentId?: string
  defaultRegime?: OrganizationEntity["regime_id"]
}

export const OrganizationEntityDialog = ({
  open,
  onOpenChange,
  onSaved,
  tenants,
  entities,
  editingEntity,
  defaultEntityType = "business_group",
  defaultParentId,
  defaultRegime = "PRESUPUESTADA",
}: OrganizationEntityDialogProps) => {
  const { user } = useAuth()
  const { currentTenant } = useCurrentTenant()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)

  // Auto-assign tenant from current context, fallback to first tenant
  const defaultTenantId = currentTenant?.id || tenants[0]?.id || ""

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<OrganizationEntityFormDataZod>({
    resolver: zodResolver(organizationEntitySchema),
    defaultValues: {
          name: "",
          entity_type: defaultEntityType,
          regime_id: defaultRegime as "PRESUPUESTADA" | "EMPRESARIAL" | null,
          is_active: true,
          description: null,
          is_sitecorp_account: false,
          account_code: null,
          parent_id: null,
        },
  })

  React.useEffect(() => {
    if (open) {
      if (editingEntity) {
              reset({
                name: editingEntity.name,
                entity_type: editingEntity.entity_type,
                regime_id: editingEntity.regime_id as "PRESUPUESTADA" | "EMPRESARIAL" | null,
                is_active: editingEntity.is_active,
                description: editingEntity.description,
                is_sitecorp_account: editingEntity.is_sitecorp_account,
                account_code: editingEntity.account_code,
                parent_id: editingEntity.parent_id,
              })
        // Al editar, el código interno de la entidad se conserva sin cambios
      } else {
              reset({
                name: "",
                entity_type: defaultEntityType,
                regime_id: defaultRegime as "PRESUPUESTADA" | "EMPRESARIAL" | null,
                is_active: true,
                description: null,
                is_sitecorp_account: false,
                account_code: null,
                parent_id: defaultParentId ?? null,
              })
            }
    }
  }, [open, editingEntity, reset, defaultEntityType, defaultParentId, defaultRegime])

  const onSubmit = async (data: OrganizationEntityFormDataZod) => {
    if (!user) return

    try {
      setSaving(true)

      // Código interno de la entidad: se sigue generando automáticamente (nunca se pide)
      const entityData = {
        ...data,
        tenant_id: defaultTenantId,
        code: data.entity_type === "business_group" || !editingEntity ? generateCode(data.entity_type) : editingEntity?.code || generateCode(data.entity_type),
        updated_by: user.id,
        parent_id: data.entity_type === "business_group" ? null : data.parent_id || null,
      }

      if (editingEntity) {
        const { error } = await supabase
          .from("organization_entities")
          .update(entityData)
          .eq("id", editingEntity.id)

        if (error) throw error

        toast({
          title: "Entidad actualizada",
          description: `La entidad "${data.name}" ha sido actualizada correctamente.`,
        })
      } else {
        const { error } = await supabase
          .from("organization_entities")
          .insert([entityData])
          .select()
          .single()

        if (error) throw error

        toast({
          title: "Entidad creada",
          description: `La entidad "${data.name}" ha sido creada correctamente.`,
        })
      }

      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo guardar la entidad",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  // Filter parent entities based on entity type and tenant
  const parentEntities = entities.filter(
    (e) => e.id !== editingEntity?.id && e.tenant_id === defaultTenantId
  )

  // When entity type is business_group, no parents allowed
  // When entity type is company, only business_groups as parents
  // When entity type is ueb, only companies as parents
  const filteredParentEntities = React.useMemo(() => {
    const entityType = watch("entity_type")
    if (!entityType) return parentEntities

    return parentEntities.filter((e) => {
      if (entityType === "business_group") return false // No parents for business groups

      if (entityType === "company") {
        // Only business groups can be parents
        return e.entity_type === "business_group"
      }

      if (entityType === "ueb") {
        // Only companies can be parents
        return e.entity_type === "company"
      }

      return true
    })
  }, [watch("entity_type"), parentEntities])

  // La entidad superior debe ser coherente con el tipo: los grupos no tienen padre y
  // al cambiar de tipo se descarta una selección que ya no es válida.
  const watchedEntityType = watch("entity_type")
  const watchedParentId = watch("parent_id")
  React.useEffect(() => {
    if (watchedEntityType === "business_group") {
      if (watchedParentId) setValue("parent_id", null)
      return
    }
    if (watchedParentId && !filteredParentEntities.some((e) => e.id === watchedParentId)) {
      setValue("parent_id", null)
    }
  }, [watchedEntityType, watchedParentId, filteredParentEntities, setValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {editingEntity ? (
              <>
                <Building2 className="h-5 w-5 text-sitecorp-primary" />
                Editar entidad
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-sitecorp-primary" />
                Nueva entidad
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {editingEntity ? "Modifica los datos de la entidad." : "Completa los datos para crear una nueva entidad."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Nombre *</label>
              <SiteCorpInput
                placeholder="Nombre de la entidad"
                {...register("name")}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Tipo *</label>
              <SiteCorpSelect
                value={watch("entity_type")}
                onValueChange={(value) =>
                  setValue("entity_type", value as OrganizationEntityFormDataZod["entity_type"])
                }
              >
                {entityTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SiteCorpSelect>
            </div>

            {/* El workspace (tenant) se asigna automáticamente desde el contexto */}
            <div className="space-y-2 sm:col-span-full">
              <label className="text-sm font-medium text-ink">Régimen *</label>
              <SiteCorpSelect
                value={watch("regime_id")}
                onValueChange={(value) =>
                  setValue(
                    "regime_id",
                    value as OrganizationEntityFormDataZod["regime_id"]
                  )
                }
              >
                {regimeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SiteCorpSelect>
            </div>

            {/* Jerarquía: Grupo sin entidad superior; Empresa en un grupo; UEB en una empresa */}
            {watch("entity_type") !== "business_group" && (
              <div className="space-y-2 sm:col-span-full">
                <label className="text-sm font-medium text-ink">Entidad superior *</label>
                <SiteCorpSelect
                  value={watch("parent_id") || ""}
                  onValueChange={(value) =>
                    setValue("parent_id", value || null, { shouldValidate: true })
                  }
                  disabled={filteredParentEntities.length === 0}
                >
                  <option value="">Seleccionar entidad superior</option>
                  {filteredParentEntities.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.name} ·{" "}
                      {parent.entity_type === "business_group" ? "Grupo empresarial" : "Empresa"}
                    </option>
                  ))}
                </SiteCorpSelect>
                <p className="text-xs text-muted-foreground">
                  {errors.parent_id?.message
                    ? errors.parent_id.message
                    : watch("entity_type") === "company"
                      ? "La empresa pertenece a un grupo empresarial del mismo workspace."
                      : "La UEB pertenece a una empresa del mismo workspace."}
                </p>
                {filteredParentEntities.length === 0 && (
                  <p className="text-xs text-sitecorp-warning">
                    {watch("entity_type") === "company"
                      ? "Este workspace todavía no tiene grupos empresariales."
                      : "Este workspace todavía no tiene empresas en ese grupo empresarial."}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Description and sitecorp account are conditional */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Descripción</label>
            <SiteCorpInput
              placeholder="Descripción"
              {...register("description")}
            />
          </div>

          {watch("is_sitecorp_account") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Es cuenta SiteCorp</label>
              <input
                type="checkbox"
                id="is_sitecorp_account"
                checked={watch("is_sitecorp_account")}
                onChange={(e) =>
                  setValue("is_sitecorp_account", e.target.checked)
                }
                className="h-4 w-4 rounded border-input text-sitecorp-primary focus:ring-sitecorp-primary"
              />
              <label htmlFor="is_sitecorp_account" className="text-sm font-medium text-ink">
                Es cuenta SiteCorp
              </label>
            </div>
          )}

          {watch("is_sitecorp_account") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Código de cuenta</label>
              <SiteCorpInput
                placeholder="Código de cuenta"
                {...register("account_code")}
              />
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <SiteCorpButton
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton
              type="submit"
              disabled={saving}
            >
              {saving ? "Guardando..." : editingEntity ? "Actualizar" : "Crear"}
            </SiteCorpButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}