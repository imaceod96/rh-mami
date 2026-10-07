import * as React from "react"
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { cn } from "@/lib/utils"
import { SiteCorpBrand } from "@/components/sitecorp-brand"
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Undo2,
  Briefcase,
  Settings,
  ArrowLeft,
  Layers,
  Building,
  Factory,
  CalendarClock,
  Palmtree,
  HeartPulse,
  Calculator,
  FileSignature,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import {
  ENTITY_NAV,
  hasSiteCorpAccount,
  type EntityNavEntry,
  type EntityNavGroup,
  type EntityNavLink,
} from "@/lib/sitecorp-account"
import { useEntityPermissions } from "@/hooks/use-entity-permissions"

const entityTypeLabels: Record<string, string> = {
  business_group: "Grupo empresarial",
  company: "Empresa",
  ueb: "UEB",
}

/** Iconos de los elementos del menú (la estructura está en ENTITY_NAV). */
const navIcons: Record<string, React.ReactNode> = {
  summary: <LayoutDashboard className="h-5 w-5" />,
  personas: <Users className="h-5 w-5" />,
  candidates: <Users className="h-5 w-5" />,
  workers: <UserCheck className="h-5 w-5" />,
  reentries: <Undo2 className="h-5 w-5" />,
  staffing: <Briefcase className="h-5 w-5" />,
  hiring: <FileSignature className="h-5 w-5" />,
  prenomina: <Calculator className="h-5 w-5" />,
  vacations: <Palmtree className="h-5 w-5" />,
  "medical-certificates": <HeartPulse className="h-5 w-5" />,
  "contract-alerts": <CalendarClock className="h-5 w-5" />,
  settings: <Settings className="h-5 w-5" />,
}

const typeIcon = (type: string) => {
  if (type === "business_group") return <Layers className="h-4 w-4" />
  if (type === "company") return <Building className="h-4 w-4" />
  return <Factory className="h-4 w-4" />
}

const isVisible = (entry: EntityNavEntry, permissions: string[]): boolean => {
  if (!entry.permissions || entry.permissions.length === 0) return true
  return entry.permissions.some((code) => permissions.includes(code))
}

const EntityLayout = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { logout } = useAuth()
  const { currentTenant, clearCurrentTenant } = useCurrentTenant()
  const { currentEntity, clearCurrentEntity } = useCurrentEntity()
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

  const isEntityRoute = location.pathname.startsWith("/entity/")

  const entityId = currentEntity?.id

  // Los módulos internos solo existen cuando la entidad es Cuenta SiteCorp
  const modulesEnabled = hasSiteCorpAccount(currentEntity)

  // Cada elemento del menú aparece según el permiso interno REAL del usuario en la
  // entidad actual (mismo motor que usa RLS).
  const { permissions: entityPermissions } = useEntityPermissions(modulesEnabled ? entityId : null)

  // Elementos visibles según permisos reales, preservando el ORDEN definitivo.
  const visibleNav = React.useMemo(() => {
    return ENTITY_NAV.map((entry) => {
      if (entry.kind === "group") {
        const items = entry.items.filter((item) => isVisible(item, entityPermissions))
        if (items.length === 0) return null
        return { ...entry, items } as EntityNavGroup
      }
      return isVisible(entry, entityPermissions) ? (entry as EntityNavLink) : null
    }).filter((entry): entry is EntityNavEntry => entry !== null)
  }, [entityPermissions])

  // Grupos desplegables: se expanden automáticamente cuando contienen la ruta activa.
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    if (!entityId) return
    setOpenGroups((prev) => {
      const next = { ...prev }
      visibleNav.forEach((entry) => {
        if (entry.kind !== "group") return
        const containsActive = entry.items.some((item) =>
          location.pathname.startsWith(item.path(entityId))
        )
        if (containsActive) next[entry.key] = true
      })
      return next
    })
  }, [location.pathname, entityId, visibleNav])

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))

  const renderLink = (item: EntityNavLink) => {
    const active = location.pathname.startsWith(item.path(entityId as string))
    return (
      <Link
        key={item.key}
        to={item.path(entityId as string)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-sitecorp-primary/10 text-sitecorp-primary"
            : "text-ink hover:bg-muted hover:text-ink"
        )}
      >
        {navIcons[item.key] || <Settings className="h-5 w-5" />}
        <span className="flex-1">{item.label}</span>
      </Link>
    )
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
            <SiteCorpBrand variant="isotype" size="sm" />
            <div>
              <h2 className="text-base font-semibold text-ink">SiteCorp</h2>
              <p className="text-xs text-muted-foreground">Entidad</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {entityId && modulesEnabled && (
              <>
                {visibleNav.map((entry) => {
                  if (entry.kind === "link") return renderLink(entry)

                  const isOpen = !!openGroups[entry.key]
                  const containsActive = entry.items.some((item) =>
                    location.pathname.startsWith(item.path(entityId))
                  )
                  return (
                    <div key={entry.key} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => toggleGroup(entry.key)}
                        aria-expanded={isOpen}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          containsActive
                            ? "text-sitecorp-primary"
                            : "text-ink hover:bg-muted hover:text-ink"
                        )}
                      >
                        {navIcons[entry.key] || <Users className="h-5 w-5" />}
                        <span className="flex-1 text-left">{entry.label}</span>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="ml-4 space-y-1 border-l border-border pl-2">
                          {entry.items.map((item) => renderLink(item))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}

            {entityId && !modulesEnabled && (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Esta entidad no tiene habilitados los módulos internos de SiteCorp.
              </p>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <button
            onClick={handleReturnToAdmin}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-5 w-5" /> Volver a administración global
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
                <ArrowLeft className="h-4 w-4" /> Volver a administración global
              </button>
              <span className="text-sm text-muted-foreground">
                Actualmente en: <strong className="text-ink">
                  {currentEntity && typeIcon(currentEntity.entity_type)}
                  {currentEntity?.name || "Entidad"}
                </strong>
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
                <ArrowLeft className="h-4 w-4" /> Volver a administración global
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

EntityLayout.displayName = "EntityLayout"

export { EntityLayout }
