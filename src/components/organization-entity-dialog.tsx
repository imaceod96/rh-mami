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
import { CUBA_PROVINCES, MUNICIPIOS_BY_PROVINCE } from "@/data/cuba-locations"

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
  province: string | null
  municipality: string | null
  is_active: boolean
  description: string | null
  is_sitecorp_account: boolean
  account_code: string | null
}

const entityTypeOptions = [
  { value: "business_group", label: "Grupo empresarial" },
  { value: "company", label: "Empresa" },
  { value: "ueb", label: "UEB" },
]

const regimeOptions = [
  { value: "presupuestada", label: "Presupuestada" },
  { value: "empresarial", label: "Empresarial" },
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

const organizationEntitySchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  entity_type: z.enum(["business_group", "company", "ueb"]),
  regime_id: z.enum(["presupuestada", "empresarial"]).nullable(),
  province: z.string().nullable(),
  municipality: z.string().nullable(),
  is_active: z.boolean().default(true),
  description: z.string().nullable(),
  is_sitecorp_account: z.boolean().default(false),
  account_code: z.string().nullable(),
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
  defaultRegime = "presupuestada",
}: OrganizationEntityDialogProps) => {
  const { user } = useAuth()
  const { currentTenant } = useCurrentTenant()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)

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
      regime_id: defaultRegime,
      province: null,
      municipality: null,
      is_active: true,
      description: null,
      is_sitecorp_account: false,
      account_code: null,
    },
  })

  React.useEffect(() => {
    if (open) {
      if (editingEntity) {
        reset({
          name: editingEntity.name,
          entity_type: editingEntity.entity_type,
          regime_id: editingEntity.regime_id,
          province: editingEntity.province,
          municipality: editingEntity.municipality,
          is_active: editingEntity.is_active,
          description: editingEntity.description,
          is_sitecorp_account: editingEntity.is_sitecorp_account,
          account_code: editingEntity.account_code,
        })
        // When editing, keep the code unchanged
      } else {
        reset({
          name: "",
          entity_type: defaultEntityType,
          regime_id: defaultRegime,
          province: null,
          municipality: null,
          is_active: true,
          description: null,
          is_sitecorp_account: false,
          account_code: null,
        })
      }
    }
  }, [open, editingEntity, reset, defaultEntityType, defaultRegime])

  // When entity type changes, filter parent entities accordingly
  React.useEffect(() => {
    const entityType = watch("entity_type")
    if (entityType === "business_group") {
      // Business groups cannot have parents, clear any existing parent
      setValue("parent_id", null)
    }
  }, [watch("entity_type"), setValue])

  const onSubmit = async (data: OrganizationEntityFormDataZod) => {
    if (!user) return

    try {
      setSaving(true)

      // Generate automatic code if not provided and not editing
      const entityData = {
        ...data,
        tenant_id: defaultTenantId,
        code: data.entity_type === "business_group" || !editingEntity ? generateCode(data.entity_type) : editingEntity?.code || generateCode(data.entity_type),
        updated_by: user.id,
        parent_id: data.entity_type === "business_group" ? null : (editingEntity?.parent_id || null),
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

            {/* Tenant is auto-assigned, not shown in form */}
            {/* Regime selector */}
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

            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Provincia *</label>
              <SiteCorpSelect
                value={watch("province")}
                onValueChange={(value) =>
                  setValue("province", value as OrganizationEntityFormDataZod["province"])
                }
              >
                <option value="" disabled>
                  Seleccionar provincia
                </option>
                {CUBA_PROVINCES.map((province) => (
                  <option key={province.id} value={province.id}>
                    {province.name}
                  </option>
                ))}
              </SiteCorpSelect>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Municipio *</label>
              <SiteCorpSelect
                value={watch("municipality")}
                onValueChange={(value) =>
                  setValue(
                    "municipality",
                    value as OrganizationEntityFormDataZod["municipality"]
                  )
                }
                disabled={!watch("province")}
              >
                <option value="" disabled>
                  Seleccionar municipio
                </option>
                {watch("province") &&
                MUNICIPIOS_BY_PROVINCE[watch("province")] &&
                MUNICIPIOS_BY_PROVINCE[watch("province")].map((municipio) => (
                  <option key={municipio} value={municipio}>
                    {municipio}
                  </option>
                ))}
              </SiteCorpSelect>
            </div>
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