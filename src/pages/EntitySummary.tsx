import * as React from "react"
import { Link, useParams } from "react-router-dom"
import { useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { useEntitySummaryDashboard } from "@/hooks/use-entity-summary"
import type { DistributionSlice } from "@/lib/entity-summary"
import { ENTITY_INTERNAL_MODULES } from "@/lib/sitecorp-account"
import {
  Building2,
  Layers,
  Factory,
  Users,
  Briefcase,
  FileText,
  CalendarClock,
  Mail,
  UserCheck,
  UserPlus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Palmtree,
} from "lucide-react"
import { cn } from "@/lib/utils"

const entityTypeLabels: Record<string, string> = {
  business_group: "Grupo empresarial",
  company: "Empresa",
  ueb: "UEB / Unidad Empresarial de Base",
}

const typeIcon = (type: string) => {
  if (type === "business_group") return <Layers className="h-5 w-5" />
  if (type === "company") return <Building2 className="h-5 w-5" />
  return <Factory className="h-5 w-5" />
}

const formatInt = (value: number): string => (value || 0).toLocaleString("es-ES")

const formatDateShort = (iso: string | null | undefined): string => {
  if (!iso) return "—"
  const [year, month, day] = iso.split("-")
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

// --- Tarjeta KPI -----------------------------------------------------------

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  tone?: "primary" | "orange" | "success" | "danger" | "warning"
}

const toneStyles: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  primary: "bg-sitecorp-primary/10 text-sitecorp-primary",
  orange: "bg-sitecorp-secondary-orange/10 text-sitecorp-secondary-orange",
  success: "bg-sitecorp-success/10 text-sitecorp-success",
  danger: "bg-sitecorp-danger/10 text-sitecorp-danger",
  warning: "bg-sitecorp-warning/10 text-sitecorp-warning",
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon, tone = "primary" }) => (
  <SiteCorpCard className="rounded-2xl">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold leading-none text-ink">{value}</p>
        {subtitle && <p className="pt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className={cn("rounded-xl p-2.5", toneStyles[tone])}>{icon}</div>
    </div>
  </SiteCorpCard>
)

// --- Fila de distribución --------------------------------------------------

const BarRow: React.FC<{ slice: DistributionSlice; max: number; tone: "primary" | "orange" }> = ({
  slice,
  max,
  tone,
}) => {
  const pct = max > 0 ? Math.round((slice.value / max) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="truncate pr-3 text-ink" title={slice.label}>
          {slice.label}
        </span>
        <span className="font-semibold text-ink">{formatInt(slice.value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "primary" ? "bg-sitecorp-primary" : "bg-sitecorp-secondary-orange"
          )}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  )
}

const DistributionList: React.FC<{ slices: DistributionSlice[]; tone: "primary" | "orange" }> = ({
  slices,
  tone,
}) => {
  if (slices.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Sin trabajadores ocupados que distribuir.</p>
  }
  const max = slices.reduce((m, s) => Math.max(m, s.value), 0)
  return (
    <div className="space-y-3">
      {slices.map((slice) => (
        <BarRow key={slice.key} slice={slice} max={max} tone={tone} />
      ))}
    </div>
  )
}

// --- Checklist de configuración -------------------------------------------

const ChecklistRow: React.FC<{ label: string; ready: boolean; hint?: string }> = ({
  label,
  ready,
  hint,
}) => (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
    <div className="min-w-0">
      <p className="truncate text-sm text-ink">{label}</p>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
    {ready ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-sitecorp-success">
        <CheckCircle2 className="h-4 w-4" /> Listo
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-sitecorp-warning">
        <XCircle className="h-4 w-4" /> Pendiente
      </span>
    )}
  </div>
)

// --- Página ----------------------------------------------------------------

const EntitySummary = () => {
  const { entityId } = useParams<{ entityId: string }>()
  const { currentEntity } = useCurrentEntity()
  const summary = useEntitySummaryDashboard(entityId)

  if (!entityId) {
    return (
      <div className="space-y-6 p-6">
        <SiteCorpPageHeader title="Resumen" description="No se indicó una entidad" />
        <SiteCorpAlert type="danger" title="Entidad no encontrada">
          La ruta no incluye una entidad válida.
        </SiteCorpAlert>
      </div>
    )
  }

  const entityType = currentEntity ? entityTypeLabels[currentEntity.entity_type] || "Entidad" : "Entidad"
  const scopeLabel =
    summary.scope === "descendants" ? "Entidad + descendientes" : "Esta entidad"

  const quickLinks = [
    {
      key: "candidates",
      label: "Candidatos",
      path: `/entity/${entityId}/candidates`,
      icon: <Users className="h-4 w-4" />,
      enabled: summary.has(["candidates.view", "candidates.manage"]),
    },
    {
      key: "staffing",
      label: "Plantilla",
      path: `/entity/${entityId}/staffing`,
      icon: <Briefcase className="h-4 w-4" />,
      enabled: summary.has(["workers.view", "workers.manage"]),
    },
    {
      key: "alerts",
      label: "Vencimientos",
      path: `/entity/${entityId}/contracts/alerts`,
      icon: <CalendarClock className="h-4 w-4" />,
      enabled: summary.has(["contract_alerts.view", "workers.view", "workers.manage"]),
    },
    {
      key: "hiring",
      label: "Contratación",
      path: `/entity/${entityId}/hiring`,
      icon: <Mail className="h-4 w-4" />,
      enabled: summary.has(["hiring.view", "hiring.manage", "workers.view", "workers.manage"]),
    },
    {
      key: "vacations",
      label: "Vacaciones",
      path: `/entity/${entityId}/vacations`,
      icon: <Palmtree className="h-4 w-4" />,
      enabled: summary.has(["vacations.view", "vacations.manage"]),
    },
  ].filter((link) => link.enabled)

  const showDistribution = !!summary.distribution
  const hasAnyBlock =
    showDistribution ||
    summary.permissions.candidates ||
    summary.permissions.contracts ||
    summary.permissions.alerts ||
    summary.permissions.workers ||
    summary.permissions.vacations ||
    summary.permissions.configuration

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title={`Resumen — ${currentEntity?.name ?? "Entidad"}`}
        description={`${entityType}${currentEntity?.code ? ` • ${currentEntity.code}` : ""}`}
      />

      {/* Selector de ámbito + aviso de alcance */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => summary.setScope("self")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              summary.scope === "self"
                ? "bg-sitecorp-primary text-white"
                : "text-ink hover:bg-muted"
            )}
          >
            Esta entidad
          </button>
          {summary.descendantsAvailable && (
            <button
              type="button"
              onClick={() => summary.setScope("descendants")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                summary.scope === "descendants"
                  ? "bg-sitecorp-primary text-white"
                  : "text-ink hover:bg-muted"
              )}
            >
              Entidad + descendientes
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          Ámbito mostrado: <strong className="text-ink">{scopeLabel}</strong>
          {summary.scope === "descendants" && summary.descendantCount > 0
            ? ` (${formatInt(summary.descendantCount)} entidad(es) descendiente(s))`
            : ""}
        </span>
      </div>

      {summary.scopeLoading && <SiteCorpLoading rows={2} />}

      {/* BLOQUE PRINCIPAL — PLANTILLA */}
      {showMainBlock && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Plantilla
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summary.permissions.staffing && (
              <KpiCard
                title="Plantilla autorizada"
                value={formatInt(summary.staffing.authorized)}
                subtitle="Suma de capacidades de puestos activos"
                icon={<FileText className="h-5 w-5" />}
                tone="primary"
              />
            )}
            {summary.permissions.workers && (
              <>
                <KpiCard
                  title="Trabajadores activos"
                  value={formatInt(summary.occupancy?.activeWorkers ?? 0)}
                  subtitle="Estado laboral activo"
                  icon={<Users className="h-5 w-5" />}
                  tone="success"
                />
                <KpiCard
                  title="Puestos ocupados"
                  value={formatInt(summary.staffing.occupied)}
                  subtitle="Asignaciones actuales"
                  icon={<UserCheck className="h-5 w-5" />}
                  tone="orange"
                />
              </>
            )}
            {summary.permissions.staffing && summary.permissions.workers && (
              <>
                <KpiCard
                  title="Vacantes"
                  value={formatInt(summary.staffing.vacancies)}
                  subtitle="Autorizada − ocupación"
                  icon={<Briefcase className="h-5 w-5" />}
                  tone={summary.staffing.vacancies > 0 ? "warning" : "success"}
                />
                <KpiCard
                  title="Ocupación"
                  value={`${summary.staffing.occupancyPct.toFixed(1)} %`}
                  subtitle={
                    summary.staffing.authorized > 0
                      ? `${formatInt(summary.staffing.occupied)} / ${formatInt(summary.staffing.authorized)}`
                      : "Sin plantilla autorizada"
                  }
                  icon={<TrendingUp className="h-5 w-5" />}
                  tone="primary"
                />
              </>
            )}
          </div>

          {summary.staffing.inconsistent && (
            <SiteCorpAlert type="warning" title="Inconsistencia de datos detectada">
              La ocupación activa supera la plantilla autorizada del ámbito seleccionado. Revise los
              puestos y las asignaciones actuales.
            </SiteCorpAlert>
          )}
        </div>
      )}

      {/* PRÓXIMOS VENCIMIENTOS */}
      {summary.permissions.alerts && summary.expirations && (
        <SiteCorpCard
          title="Próximos vencimientos"
          description="Contratos por tiempo determinado que requieren atención (≤ 30 días)"
          className="rounded-2xl"
        >
          {summary.expirations.attention === 0 && summary.expirations.correction === 0 ? (
            <p className="text-sm text-muted-foreground">No hay contratos próximos a vencer.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-sitecorp-danger/20 bg-sitecorp-danger/5 p-3">
                <p className="text-xs text-muted-foreground">Vencidos / hoy</p>
                <p className="text-2xl font-bold text-sitecorp-danger">
                  {formatInt(summary.expirations.overdue + summary.expirations.dueToday)}
                </p>
              </div>
              <div className="rounded-xl border border-sitecorp-warning/20 bg-sitecorp-warning/5 p-3">
                <p className="text-xs text-muted-foreground">Próximos 7 días</p>
                <p className="text-2xl font-bold text-sitecorp-warning">
                  {formatInt(summary.expirations.dueIn7)}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">8–15 días</p>
                <p className="text-2xl font-bold text-ink">{formatInt(summary.expirations.dueIn15)}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">16–30 días</p>
                <p className="text-2xl font-bold text-ink">{formatInt(summary.expirations.dueIn30)}</p>
              </div>
            </div>
          )}
          {summary.expirations.correction > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {formatInt(summary.expirations.correction)} contrato(s) determinado(s) sin fecha de
              finalización (inconsistencia administrativa).
            </p>
          )}
          <div className="mt-3">
            <Link
              to={`/entity/${entityId}/contracts/alerts`}
              className="inline-flex items-center gap-1 text-sm font-medium text-sitecorp-primary hover:underline"
            >
              Ver vencimientos <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </SiteCorpCard>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* CANDIDATOS */}
        {summary.permissions.candidates && (
          <SiteCorpCard title="Candidatos" className="rounded-2xl">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Totales</p>
                <p className="text-2xl font-bold text-ink">
                  {formatInt(summary.candidates?.total ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Activos</p>
                <p className="text-2xl font-bold text-sitecorp-success">
                  {formatInt(summary.candidates?.active ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Archivados</p>
                <p className="text-2xl font-bold text-ink">
                  {formatInt(summary.candidates?.archived ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Contratados</p>
                <p className="text-2xl font-bold text-sitecorp-primary">
                  {formatInt(summary.candidates?.hired ?? 0)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <Link
                to={`/entity/${entityId}/candidates`}
                className="inline-flex items-center gap-1 text-sm font-medium text-sitecorp-primary hover:underline"
              >
                Ver candidatos <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </SiteCorpCard>
        )}

        {/* CONTRATOS */}
        {summary.permissions.contracts && (
          <SiteCorpCard title="Contratos vigentes" className="rounded-2xl">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Total vigentes</p>
                <p className="text-2xl font-bold text-ink">
                  {formatInt(summary.contracts?.current ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Tiempo determinado</p>
                <p className="text-2xl font-bold text-sitecorp-secondary-orange">
                  {formatInt(summary.contracts?.determined ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Tiempo indeterminado</p>
                <p className="text-2xl font-bold text-sitecorp-primary">
                  {formatInt(summary.contracts?.undetermined ?? 0)}
                </p>
              </div>
            </div>
          </SiteCorpCard>
        )}
      </div>

      {/* VACACIONES */}
      {summary.permissions.vacations && summary.vacations && (
        <SiteCorpCard
          title="Vacaciones"
          description="Saldos y devengos de los trabajadores activos del ámbito seleccionado"
          className="rounded-2xl"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
              <p className="text-xs text-muted-foreground">Actualmente de vacaciones</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatInt(summary.vacations.onVacation)}
              </p>
            </div>
            <div className="rounded-xl border border-sitecorp-warning/20 bg-sitecorp-warning/5 p-3">
              <p className="text-xs text-muted-foreground">Próximos al límite</p>
              <p className="text-2xl font-bold text-sitecorp-warning">
                {formatInt(summary.vacations.nearLimit)}
              </p>
            </div>
            <div className="rounded-xl border border-sitecorp-danger/20 bg-sitecorp-danger/5 p-3">
              <p className="text-xs text-muted-foreground">En límite (24 días)</p>
              <p className="text-2xl font-bold text-sitecorp-danger">
                {formatInt(summary.vacations.atLimit)}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Promedio disponible</p>
              <p className="text-2xl font-bold text-ink">
                {summary.vacations.averageBalance.toLocaleString("es-CU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                d
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Link
              to={`/entity/${entityId}/vacations`}
              className="inline-flex items-center gap-1 text-sm font-medium text-sitecorp-primary hover:underline"
            >
              Ver vacaciones <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </SiteCorpCard>
      )}

      {/* MOVIMIENTOS */}
      {summary.permissions.workers && summary.movements && (
        <SiteCorpCard
          title="Movimientos de personal"
          description={`Últimos ${summary.movements.days} días (${formatDateShort(
            summary.movements.from
          )} – ${formatDateShort(summary.movements.to)})`}
          className="rounded-2xl"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="rounded-lg bg-sitecorp-success/10 p-2 text-sitecorp-success">
                <UserPlus className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Altas</p>
                <p className="text-xl font-bold text-ink">{formatInt(summary.movements.hires)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="rounded-lg bg-sitecorp-danger/10 p-2 text-sitecorp-danger">
                <TrendingDown className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Bajas</p>
                <p className="text-xl font-bold text-ink">{formatInt(summary.movements.separations)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="rounded-lg bg-sitecorp-secondary-orange/10 p-2 text-sitecorp-secondary-orange">
                <UserCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Reincorporaciones</p>
                <p className="text-xl font-bold text-ink">
                  {formatInt(summary.movements.reincorporations)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="rounded-lg bg-sitecorp-primary/10 p-2 text-sitecorp-primary">
                <Briefcase className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Cambios de puesto</p>
                <p className="text-xl font-bold text-ink">
                  {formatInt(summary.movements.positionChanges)}
                </p>
              </div>
            </div>
          </div>
          {summary.movements.contractChanges > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {formatInt(summary.movements.contractChanges)} cambio(s) de contrato en el período.
            </p>
          )}
        </SiteCorpCard>
      )}

      {/* DISTRIBUCIÓN */}
      {showDistribution && summary.distribution && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SiteCorpCard title="Trabajadores por área" className="rounded-2xl">
            <DistributionList slices={summary.distribution.byArea} tone="primary" />
          </SiteCorpCard>
          <SiteCorpCard title="Trabajadores por categoría ocupacional" className="rounded-2xl">
            <DistributionList slices={summary.distribution.byCategory} tone="orange" />
          </SiteCorpCard>
        </div>
      )}

      {/* CONFIGURACIÓN / READINESS */}
      {summary.permissions.configuration && (
        <SiteCorpCard
          title="Configuración"
          description="Estado de los datos necesarios para operar la entidad"
          className="rounded-2xl"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.permissions.contractData && summary.contractData && (
              <ChecklistRow
                label="Datos contractuales de la entidad"
                ready={summary.contractData.ready}
                hint={
                  summary.contractData.ready
                    ? undefined
                    : `${formatInt(summary.contractData.missing)} dato(s) pendiente(s)`
                }
              />
            )}
            {summary.permissions.representative && summary.representative && (
              <ChecklistRow
                label="Representante autorizado"
                ready={summary.representative.ready}
                hint={
                  summary.representative.assigned > 0
                    ? `${formatInt(summary.representative.assigned)} representante(s) asignado(s)`
                    : "Sin representante vigente"
                }
              />
            )}
            {summary.permissions.salary && summary.salary && (
              <ChecklistRow
                label="Escala salarial aplicable"
                ready={summary.salary.ready}
                hint="Según el régimen de la entidad"
              />
            )}
            {summary.permissions.templates && summary.templates && (
              <ChecklistRow
                label="Plantillas documentales"
                ready={summary.templates.total > 0 && summary.templates.configured === summary.templates.total}
                hint={`${formatInt(summary.templates.configured)}/${formatInt(
                  summary.templates.total
                )} configuradas`}
              />
            )}
          </div>
          {summary.has(["organization.view", "organization.manage"]) && (
            <div className="mt-3">
              <Link
                to={`/entity/${entityId}/settings`}
                className="inline-flex items-center gap-1 text-sm font-medium text-sitecorp-primary hover:underline"
              >
                Ir a ajustes <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </SiteCorpCard>
      )}

      {/* ESTADO VACÍO / SIN BLOQUES */}
      {!hasAnyBlock && !summary.permissionsLoading && (
        <SiteCorpCard title="Sin datos disponibles" className="rounded-2xl">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-sitecorp-warning" />
            <p className="max-w-lg text-sm text-muted-foreground">
              No tiene permisos para consultar los indicadores operativos de esta entidad.
            </p>
          </div>
        </SiteCorpCard>
      )}

      {/* ACCESOS RÁPIDOS */}
      {quickLinks.length > 0 && (
        <SiteCorpCard title="Accesos rápidos" className="rounded-2xl">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((link) => (
              <Link
                key={link.key}
                to={link.path}
                className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm text-ink transition-colors hover:bg-muted"
              >
                <span className="text-sitecorp-primary">{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>
        </SiteCorpCard>
      )}

      {/* INFORMACIÓN GENERAL */}
      {currentEntity && (
        <SiteCorpCard title="Información general" className="rounded-2xl">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tipo de entidad</p>
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {typeIcon(currentEntity.entity_type)}
                {entityType}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Estado</p>
              <SiteCorpStatusBadge status={currentEntity.is_active ? "success" : "danger"}>
                {currentEntity.is_active ? "Activa" : "Inactiva"}
              </SiteCorpStatusBadge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Código interno</p>
              <p className="text-sm font-mono text-ink">{currentEntity.code}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Régimen</p>
              <p className="text-sm font-medium text-ink">{currentEntity.regime_id || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Cuenta SiteCorp</p>
              <p className="text-sm font-mono text-ink">{currentEntity.account_code || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Módulos internos</p>
              <p className="text-sm font-medium text-ink">
                {ENTITY_INTERNAL_MODULES.length} módulos disponibles
              </p>
            </div>
          </div>
        </SiteCorpCard>
      )}
    </div>
  )
}

export default EntitySummary
