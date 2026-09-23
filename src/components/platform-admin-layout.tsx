import * as React from "react"
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Building2,
  Users,
  Shield,
  User,
  LogOut,
  ArrowLeft,
  Layers,
  Building,
  Factory,
} from "lucide-react"

const entityTypeLabels: Record<string, string> = {
  business_group: "Grupo empresarial",
  company: "Empresa",
  ueb: "UEB",
}

const typeIcon = (type: string) => {
  if (type === "business_group") return <Layers className="h-4 w-4" />
  if (type === "company") return <Building className="h-4 w-4" />
  return <Factory className="h-4 w-4" />
}

const PlatformAdminLayout = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { user, logout } = useAuth()
  const { currentTenant, clearCurrentTenant } = useCurrentTenant()
  const { currentEntity, setCurrentEntity, clearCurrentEntity } = useCurrentEntity()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate("/login")
  }

  const handleReturnToAdmin = () => {
    clearCurrentTenant()
    clearCurrentEntity()
    navigate("/admin")
  }

  const isEntityRoute = location.pathname.startsWith("/organization/")

  return (
    <div
      ref={ref}
      className={cn("flex h-screen w-full overflow-hidden", className)}
      {...props}
    >
      {/* Sidebar */}
      <div className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card">
        {/* Logo / Brand */}
        <div className="flex h-16 items-center border-b border-border px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sitecorp-primary">
              <span className="text-lg font-bold text-white">SC</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">SiteCorp</h2>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            <Link
              to="/admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
            >
              <LayoutDashboard className="h-5 w-5" />
              Inicio
            </Link>
            <Link
              to="/admin/companies"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
            >
              <Building2 className="h-5 w-5" />
              Clientes / Organizaciones
            </Link>
            <Link
              to="/admin/users"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
            >
              <Users className="h-5 w-5" />
              Usuarios
            </Link>
            <Link
              to="/admin/roles"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
            >
              <Shield className="h-5 w-5" />
              Roles y permisos
            </Link>
            <Link
              to="/admin/account"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
            >
              <User className="h-5 w-5" />
              Mi cuenta
            </Link>
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-sitecorp-background ml-64">
        {currentTenant && (
          <div className="border-b border-border bg-muted/30 px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleReturnToAdmin}
                className="inline-flex items-center gap-2 rounded-md bg-sitecorp-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-sitecorp-primary-dark"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a administración global
              </button>
              <span className="text-sm text-muted-foreground">
                Actualmente en: <strong className="text-ink">{currentTenant.name}</strong>
              </span>
            </div>
          </div>
        )}
        {isEntityRoute && currentEntity && !currentTenant && (
          <div className="border-b border-border bg-muted/30 px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleReturnToAdmin}
                className="inline-flex items-center gap-2 rounded-md bg-sitecorp-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-sitecorp-primary-dark"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a administración global
              </button>
              <span className="text-sm text-muted-foreground">
                Actualmente en:{" "}
                <strong className="text-ink flex items-center gap-1">
                  {typeIcon(currentEntity.entity_type)}
                  {currentEntity.name}
                  <SiteCorpStatusBadge status="neutral">
                    {entityTypeLabels[currentEntity.entity_type] || "Entidad"}
                  </SiteCorpStatusBadge>
                </strong>
              </span>
            </div>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
})
PlatformAdminLayout.displayName = "PlatformAdminLayout"

// Import SiteCorpStatusBadge for entity display
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"

export { PlatformAdminLayout }