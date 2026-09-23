import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useAuth } from "@/contexts/AuthContext"
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

const entityTypeOptions = [
  { value: "business_group", label: "Grupo empresarial" },
  { value: "company", label: "Empresa" },
  { value: "ueb", label: "UEB / Unidad Empresarial de Base" },
]

const statusOptions = [
  { value: "active", label: "Activo" },
  { value: "inactive", label: "Inactivo" },
]

const organizationEntitySchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  code: z.string().min(1, "El código es obligatorio"),
  entity_type: z.enum(["business_group", "company", "ueb"]),
  tenant_id: z.string().min(1, "El tenant es obligatorio"),
  parent_id: z.string().nullable(),
  regime_id: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
  description: z.string().nullable(),
  address: z.string().nullable(),
  municipality: z.string().nullable(),
  province: z.string().nullable(),
  postal_code: z.string().nullable(),
  is_sitecorp_account: z.boolean().default(false),
  account_code: z.string().nullable(),
})

type OrganizationEntityFormData = z.infer<typeof organizationEntitySchema>

interface OrganizationEntityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  tenants: Tenant[]
  entities: OrganizationEntity[]
  editingEntity: OrganizationEntity | null
  defaultTenantId: string
  defaultParentId?: string | null
  defaultEntityType?: OrganizationEntity["entity_type"]
}

export const OrganizationEntityDialog = ({
  open,
  onOpenChange,
  onSaved,
  tenants,
  entities,
  editingEntity,
  defaultTenantId,
  defaultParentId = null,
  defaultEntityType = "company",
}: OrganizationEntityDialogProps) => {
  const { user } = useAuth()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<OrganizationEntityFormData>({
    resolver: zodResolver(organizationEntitySchema),
    defaultValues: {
      name: "",
      code: "",
      entity_type: defaultEntityType,
      tenant_id: defaultTenantId,
      parent_id: defaultParentId,
      regime_id: null,
      status: "active",
      description: null,
      address: null,
      municipality: null,
      province: null,
      postal_code: null,
      is_sitecorp_account: false,
      account_code: null,
    },
  })
  
  React.useEffect(() => {
    if (open) {
      if (editingEntity) {
        reset({
          name: editingEntity.name,
          code: editingEntity.code,
          entity_type: editingEntity.entity_type,
          tenant_id: editingEntity.tenant_id,
          parent_id: editingEntity.parent_id,
          regime_id: editingEntity.regime_id,
          status: editingEntity.status as "active" | "inactive",
          description: editingEntity.description,
          address: editingEntity.address,
          municipality: editingEntity.municipality,
          province: editingEntity.province,
          postal_code: editingEntity.postal_code,
          is_sitecorp_account: editingEntity.is_sitecorp_account,
          account_code: editingEntity.account_code,
        })
      } else {
        reset({
          name: "",
          code: "",
          entity_type: defaultEntityType,
          tenant_id: defaultTenantId,
          parent_id: defaultParentId,
          regime_id: null,
          status: "active",
          description: null,
          address: null,
          municipality: null,
          province: null,
          postal_code: null,
          is_sitecorp_account: false,
          account_code: null,
        })
      }
    }
  }, [open, editingEntity, reset, defaultTenantId, defaultParentId, defaultEntityType])
  
  const onSubmit = async (data: OrganizationEntityFormData) => {
    if (!user) return
    
    try {
      setSaving(true)
      
      const entityData = {
        ...data,
        updated_by: user.id,
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
  
  const parentEntities = entities.filter(e => e.id !== editingEntity?.id)
  
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
              <label className="text-sm font-medium text-ink">Código *</label>
              <SiteCorpInput
                              placeholder="Código de la entidad"
                              {...register("code")}
                            />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Tipo *</label>
              <SiteCorpSelect
                value={watch("entity_type")}
                onValueChange={(value) => setValue("entity_type", value as OrganizationEntityFormData["entity_type"])}
              >
                {entityTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </SiteCorpSelect>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Tenant *</label>
              <SiteCorpSelect
                value={watch("tenant_id")}
                onValueChange={(value) => setValue("tenant_id", value)}
              >
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </SiteCorpSelect>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Entidad padre</label>
              <SiteCorpSelect
                value={watch("parent_id") || ""}
                onValueChange={(value) => setValue("parent_id", value || null)}
              >
                <option value="">Sin padre</option>
                {parentEntities.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </SiteCorpSelect>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Estado</label>
              <SiteCorpSelect
                value={watch("status")}
                onValueChange={(value) => setValue("status", value as OrganizationEntityFormData["status"])}
              >
                {statusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </SiteCorpSelect>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Descripción</label>
            <SiteCorpInput
              placeholder="Descripción"
              {...register("description")}
            />
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Dirección</label>
              <SiteCorpInput
                placeholder="Dirección"
                {...register("address")}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Municipio</label>
              <SiteCorpInput
                placeholder="Municipio"
                {...register("municipality")}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Provincia</label>
              <SiteCorpInput
                placeholder="Provincia"
                {...register("province")}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Código postal</label>
              <SiteCorpInput
                placeholder="Código postal"
                {...register("postal_code")}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_sitecorp_account"
              checked={watch("is_sitecorp_account")}
              onChange={(e) => setValue("is_sitecorp_account", e.target.checked)}
              className="h-4 w-4 rounded border-input text-sitecorp-primary focus:ring-sitecorp-primary"
            />
            <label htmlFor="is_sitecorp_account" className="text-sm font-medium text-ink">
              Es cuenta SiteCorp
            </label>
          </div>
          
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