import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { EntityLayout } from "@/components/entity-layout"
import { Outlet } from "react-router-dom"

const EntityRouteWrapper = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const { user, isPlatformSuperAdmin, hasPlatformPermission } = useAuth()
  const { currentTenant } = useCurrentTenant()
  const { setCurrentEntity } = useCurrentEntity()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!entityId) {
      setError("ID de entidad no proporcionado")
      setLoading(false)
      return
    }

    const loadEntity = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error: fetchError } = await supabase
          .from("organization_entities")
          .select("*")
          .eq("id", entityId)
          .single()

        if (fetchError) throw fetchError

        // Authorization logic
        let isAuthorized = false

        // 1. Platform SuperAdmin always authorized
        if (isPlatformSuperAdmin) {
          isAuthorized = true
        }
        // 2. Platform User with organization view/manage permissions
        else {
          const [viewAllPerm, manageAllPerm] = await Promise.all([
            hasPlatformPermission("organizations.view_all"),
            hasPlatformPermission("organizations.manage_all")
          ])
          
          if (viewAllPerm || manageAllPerm) {
            isAuthorized = true
          }
          // 3. Normal entity-user access check
          else {
            const { data: accessData, error: accessError } = await supabase
              .rpc("can_view_entity", { target_entity_id: entityId })
              
            if (accessError) throw accessError
            isAuthorized = !!accessData
          }
        }

        if (!isAuthorized) {
          throw new Error("Acceso no autorizado")
        }

        setCurrentEntity(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar la entidad")
      } finally {
        setLoading(false)
      }
    }

    loadEntity()
  }, [entityId, isPlatformSuperAdmin, hasPlatformPermission, setCurrentEntity])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Cargando entidad..."
          description="Obteniendo información de la entidad organizativa"
        />
        <SiteCorpLoading rows={3} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader
          title="Error"
          description="No se pudo cargar la entidad organizativa"
        />
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
        <div className="flex justify-end">
          <SiteCorpButton variant="outline" onClick={() => navigate("/admin")}>
            Volver a administración
          </SiteCorpButton>
        </div>
      </div>
    )
  }

  return <EntityLayout><Outlet /></EntityLayout>
}

export default EntityRouteWrapper