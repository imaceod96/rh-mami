import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { Building2, Briefcase, LayoutDashboard, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  {
    label: "Panel",
    href: "/",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: "Organización",
    href: "/organization",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    label: "Candidatos",
    href: "/candidates",
    icon: <Users className="h-5 w-5" />,
  },
  {
    label: "Contratación",
    href: "/hiring",
    icon: <Briefcase className="h-5 w-5" />,
  },
]

const SiteCorpSidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const location = useLocation()

  return (
    <div
      ref={ref}
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card",
        className
      )}
      {...props}
    >
      {/* Logo / Brand */}
      <div className="flex h-16 items-center border-b border-border px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sitecorp-primary">
            <span className="text-lg font-bold text-white">SC</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">SiteCorp</h2>
            <p className="text-xs text-muted-foreground">HR Management</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sitecorp-primary text-white"
                    : "text-ink hover:bg-muted hover:text-ink"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          © 2025 SiteCorp
        </p>
      </div>
    </div>
  )
})
SiteCorpSidebar.displayName = "SiteCorpSidebar"

export { SiteCorpSidebar }