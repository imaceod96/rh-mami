import * as React from "react"
import { Outlet, Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Building2,
  Users,
  Briefcase,
  Mail,
  ArrowLeft,
  LogOut,
} from "lucide-react"

const tenantNavItems = [
  { label: "Panel", href: "/", icon: LayoutDashboard },
  { label: "Organización", href: "/organization", icon: Building2 },
  { label: "Usuarios", href: "/tenant/users", icon: Users },
  { label: "Invitaciones", href: "/tenant/invitations", icon: Mail },
  { label: "Candidatos", href: "/candidates", icon: Users },
  { label: "Contratación", href: "/hiring", icon: Briefcase },
]

const TenantLayout = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { logout } = useAuth()
  const { currentTenant, clearCurrentTenant } = useCurrentTenant()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate("/login")
  }

  const handleReturnToAdmin = () => {
    clearCurrentTenant()
    navigate("/admin")
  }

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
              <p className="text-xs text-muted-foreground">{currentTenant?.name || "Tenant"}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {tenantNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4 space-y-2">
          <button
            onClick={handleReturnToAdmin}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver a administración global
          </button>
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
        <Outlet />
      </main>
    </div>
  )
})
TenantLayout.displayName = "TenantLayout"

export { TenantLayout }