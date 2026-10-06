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
  Briefcase,
  Mail,
  Settings,
  ArrowLeft,
  LogOut,
  Layers,
  Building,
  Factory,
  CalendarClock,
    Palmtree,
    HeartPulse,
    Calculator,
  } from "lucide-react"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { ENTITY_INTERNAL_MODULES, hasSiteCorpAccount } from "@/lib/sitecorp-account"
import { useEntityPermissions } from "@/hooks/use-entity-permissions"
import { useContractAlertAttentionCount } from "@/hooks/use-contract-alerts"

const entityTypeLabels: Record<string, string> = {
  business_group: "Grupo empresarial",
  company: "Empresa",
  ueb: "UEB",
}

/** Iconos de los módulos internos (la lista de módulos es única: ENTITY_INTERNAL_MODULES) */
const moduleIcons: Record<string, React.ReactNode> = {
  summary: <LayoutDashboard className="h-5 w-5" />,
  candidates: <Users className="h-5 w-5" />,
  staffing: <Briefcase className="h-5 w-5" />,
    prenomina: <Calculator className="h-5 w-5" />,
    "contract-alerts": <CalendarClock className="h-5 w-5" />,
  hiring: <Mail className="h-5 w-5" />,
  vacations: <Palmtree className="h-5 w-5" />,
  "medical-certificates": <HeartPulse className="h-5 w-5" />,
  settings: <Settings className="h-5 w-5" />,
}

const typeIcon = (type: string) => {
  if (type === "business_group") return <Layers className="h-4 w-4" />
  if (type === "company") return <Building className="h-4 w-4" />
  return <Factory className="h-4 w-4" />
}

const EntityLayout = React.forwardRef<
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

  const isEntityRoute = location.pathname.startsWith("/entity/")

  const entityId = currentEntity?.id

  // Los módulos internos solo existen cuando la entidad es Cuenta SiteCorp
  const modulesEnabled = hasSiteCorpAccount(currentEntity)

  // Cada módulo del menú aparece según el permiso interno REAL del usuario en la
  // entidad actual (nunca según una lista fija): el mismo motor que usa RLS.
  const { permissions: entityPermissions } = useEntityPermissions(modulesEnabled ? entityId : null)

  const visibleModules = React.useMemo(
    () =>
      ENTITY_INTERNAL_MODULES.filter((module) => {
        if (!module.permissions || module.permissions.length === 0) return true
        return module.permissions.some((code) => entityPermissions.includes(code))
      }),
    [entityPermissions]
  )

  // Badge de alertas contractuales: contratos determinados vigentes que requieren
  // atención (vencidos + hoy + 1–7 + 8–15 + 16–30). Regla ÚNICA compartida con el
  // módulo de Vencimientos y el Dashboard (`requiresAttention`). No se persiste ni se
  // cuentan todos los determinados. Solo se consulta con el permiso real del módulo.
  const canViewAlerts = React.useMemo(
    () =>
      entityPermissions.some((code) =>
        ["contract_alerts.view", "workers.view", "workers.manage"].includes(code)
      ),
    [entityPermissions]
  )

  const attentionCount = useContractAlertAttentionCount(entityId, {
    enabled: !!entityId && modulesEnabled && canViewAlerts,
  })

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
                {visibleModules.map((module) => (
                  <Link
                    key={module.key}
                    to={module.path(entityId)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-muted hover:text-ink transition-colors"
                  >
                    {moduleIcons[module.key] || <Settings className="h-5 w-5" />}
                    <span className="flex-1">{module.label}</span>
                    {module.key === "contract-alerts" &&
                      attentionCount !== null &&
                      attentionCount > 0 && (
                        <span className="rounded-full bg-sitecorp-danger/10 px-2 py-0.5 text-xs font-semibold text-sitecorp-danger">
                          {attentionCount}
                        </span>
                      )}
                  </Link>
                ))}
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