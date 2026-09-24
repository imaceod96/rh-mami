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
  const { user, isPlatformSuperAdmin } = useAuth()
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

        // Check permissions
        if (currentTenant && data.tenant_id !== currentTenant.id) {
          throw new Error("No tienes permiso para acceder a esta entidad")
        }

        if (!currentTenant && !isPlatformSuperAdmin) {
          throw new Error("No tienes permiso para acceder a esta entidad")
        }

        setCurrentEntity(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar la entidad")
      } finally {
        setLoading(false)
      }
    }

    loadEntity()
  }, [entityId, currentTenant?.id, isPlatformSuperAdmin, setCurrentEntity])

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