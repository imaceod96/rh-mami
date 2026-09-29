import * as React from "react"
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { cn } from "@/lib/utils"
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
} from "lucide-react"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import {
  CONTRACT_ALERT_HORIZON_DAYS,
  fetchContractAlerts,
  requiresAttention,
} from "@/lib/contract-alerts"
import { ENTITY_INTERNAL_MODULES, hasSiteCorpAccount } from "@/lib/sitecorp-account"

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
  "contract-alerts": <CalendarClock className="h-5 w-5" />,
  hiring: <Mail className="h-5 w-5" />,
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

  // Contador de contratos por tiempo determinado que requieren atención (≤ 30 días
  // o ya vencidos). Cálculo derivado: no se persiste ninguna alerta.
  const [attentionCount, setAttentionCount] = React.useState<number | null>(null)

  React.useEffect(() => {
    let cancelled = false

    const loadAttentionCount = async () => {
      if (!entityId || !modulesEnabled) {
        setAttentionCount(null)
        return
      }
      try {
        const rows = await fetchContractAlerts(entityId, {
          horizonDays: CONTRACT_ALERT_HORIZON_DAYS,
        })
        if (!cancelled) setAttentionCount(rows.filter(requiresAttention).length)
      } catch {
        // Sin permiso o error de red: simplemente no se muestra el contador.
        if (!cancelled) setAttentionCount(null)
      }
    }

    loadAttentionCount()

    return () => {
      cancelled = true
    }
  }, [entityId, location.pathname, modulesEnabled])

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
              <p className="text-xs text-muted-foreground">Entidad</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {entityId && modulesEnabled && (
              <>
                {ENTITY_INTERNAL_MODULES.map((module) => (
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