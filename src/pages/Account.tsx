import * as React from "react"
import { useAuth } from "@/contexts/AuthContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"

const Account = () => {
  const { user, profile, isPlatformSuperAdmin } = useAuth()

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Mi cuenta"
        description="Información de tu cuenta de usuario"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SiteCorpCard title="Información personal">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sitecorp-primary">
                <span className="text-2xl font-bold text-white">
                  {profile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
              <div>
                <p className="text-lg font-semibold text-ink">{profile?.full_name || "Sin nombre"}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-medium text-ink">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Estado</span>
                <SiteCorpStatusBadge status={profile?.is_active ? "success" : "warning"} />
              </div>
            </div>
          </div>
        </SiteCorpCard>

        <SiteCorpCard title="Rol de plataforma">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <SiteCorpStatusBadge status={isPlatformSuperAdmin ? "success" : "warning"} />
              <span className="text-sm font-medium text-ink">
                {isPlatformSuperAdmin ? "SuperAdmin" : "Rol de plataforma"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isPlatformSuperAdmin
                ? "Tienes acceso completo a la administración global de SiteCorp."
                : "Tienes acceso limitado a la plataforma. Contacta a tu administrador."}
            </p>
          </div>
        </SiteCorpCard>
      </div>
    </div>
  )
}

export default Account