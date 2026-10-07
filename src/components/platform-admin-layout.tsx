import * as React from "react"
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { cn } from "@/lib/utils"
import { SiteCorpBrand } from "@/components/sitecorp-brand"
import { SidebarUserMenu } from "@/components/sidebar-user-menu"
import {
  LayoutDashboard,
  Building2,
  Users,
  Shield,
  ArrowLeft,
  Scale,
} from "lucide-react"

const PlatformAdminLayout = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { currentTenant, clearCurrentTenant } = useCurrentTenant()
  const { clearCurrentEntity } = useCurrentEntity()
  const navigate = useNavigate()
  const location = useLocation()

  const handleReturnToAdmin = () => {
    clearCurrentTenant()
    clearCurrentEntity()
    navigate("/admin")
  }

  const isEntityRoute = location.pathname.startsWith("/organization/")
  // Solo mostramos el regreso cuando el usuario está realmente dentro de un
  // contexto inferior (tenant/entidad); si ya está en Administración Global, no.
  const showGlobalAdminReturn = !!currentTenant || isEntityRoute

  return (
    <div
      ref={ref}
      className={cn("flex h-screen w-full overflow-hidden", className)}
      {...props}
    >
      {/* Sidebar */}
      <div className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card">
        {/* Logo / Brand */}
        <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SiteCorpBrand variant="isotype" size="sm" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">SiteCorp</h2>
              <p className="truncate text-xs text-muted-foreground">
                {currentTenant?.name || "Admin"}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation (scrollable) */}
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
              to="/admin/settings/salary-scale"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
            >
              <Scale className="h-5 w-5" />
              Escala salarial presupuestada
            </Link>
          </div>
        </nav>

        {/* Footer fijo (no desaparece aunque la navegación tenga scroll) */}
        <div className="shrink-0 space-y-2 border-t border-border p-3">
          {showGlobalAdminReturn && (
            <button
              type="button"
              onClick={handleReturnToAdmin}
              title="Regresar a Administración Global"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">Regresar a Administración Global</span>
            </button>
          )}
          <SidebarUserMenu accountPath="/admin/account" />
        </div>
      </div>

      {/* Main content */}
      <main className="ml-64 flex-1 overflow-y-auto bg-sitecorp-background">
        <Outlet />
      </main>
    </div>
  )
})
PlatformAdminLayout.displayName = "PlatformAdminLayout"

export { PlatformAdminLayout }
