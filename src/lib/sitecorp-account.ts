/**
 * Cuenta SiteCorp de una entidad organizativa.
 *
 * Regla única del sistema:
 *   organization_entities.is_sitecorp_account === true
 *   → la entidad usa los MÓDULOS INTERNOS de gestión de SiteCorp
 *
 * No significa: otro tenant/workspace, otro régimen, otra jerarquía ni una cuenta de
 * usuario. Es una propiedad estructural de la entidad y NO sustituye a los permisos:
 * el acceso real sigue siendo entidad SiteCorp + acceso a la entidad + permiso RBAC.
 */

export interface EntityInternalModule {
  key: string
  label: string
  /** Ruta interna de la entidad correspondiente al módulo */
  path: (entityId: string) => string
  /**
   * Permisos internos que habilitan el módulo (basta con uno). Ausente = el módulo
   * está disponible para cualquier usuario con acceso a la entidad (p. ej. Resumen).
   */
  permissions?: string[]
}

/**
 * Módulos internos enrutables de una Cuenta SiteCorp. Es la lista ÚNICA de rutas y
 * de permisos por módulo (la navegación se compone a partir de aquí).
 */
export const ENTITY_INTERNAL_MODULES: EntityInternalModule[] = [
  { key: "summary", label: "Resumen", path: (id) => `/entity/${id}/summary` },
  {
    key: "candidates",
    label: "Candidatos",
    path: (id) => `/entity/${id}/candidates`,
    permissions: ["candidates.view", "candidates.manage"],
  },
  {
    key: "workers",
    label: "Trabajadores",
    path: (id) => `/entity/${id}/workers`,
    permissions: ["workers.view", "workers.manage"],
  },
  {
    key: "reentries",
    label: "Reingresos",
    path: (id) => `/entity/${id}/reentries`,
    permissions: ["workers.view", "workers.manage"],
  },
  {
    key: "staffing",
    label: "Plantilla",
    path: (id) => `/entity/${id}/staffing`,
    permissions: ["workers.view", "workers.manage"],
  },
  {
    key: "vacations",
    label: "Vacaciones",
    path: (id) => `/entity/${id}/vacations`,
    permissions: ["vacations.view", "vacations.manage"],
  },
  {
    key: "medical-certificates",
    label: "Licencias y certificados",
    path: (id) => `/entity/${id}/medical-certificates`,
    permissions: ["medical_certificates.view", "medical_certificates.manage"],
  },
  {
    key: "prenomina",
    label: "Prenómina",
    path: (id) => `/entity/${id}/payroll-preparation`,
    permissions: ["prenomina.view", "prenomina.manage"],
  },
  // Vencimientos YA NO es un elemento directo del sidebar (§36): su página y ruta
  // siguen existiendo y se accede desde Resumen → «Próximos a vencer».
  {
    key: "contract-alerts",
    label: "Vencimientos",
    path: (id) => `/entity/${id}/contracts/alerts`,
    permissions: ["contract_alerts.view", "workers.view", "workers.manage"],
  },
  {
    key: "hiring",
    label: "Contratación",
    path: (id) => `/entity/${id}/hiring`,
    permissions: ["hiring.view", "hiring.manage", "workers.view", "workers.manage"],
  },
  { key: "settings", label: "Ajustes", path: (id) => `/entity/${id}/settings` },
]

/** Ruta existente de Vencimientos (acceso directo permitido aunque no esté en el menú). */
export const contractAlertsPath = (entityId: string) => `/entity/${entityId}/contracts/alerts`

/** Elemento simple del menú lateral. */
export interface EntityNavLink {
  kind: "link"
  key: string
  label: string
  path: (entityId: string) => string
  permissions?: string[]
}

/** Grupo desplegable del menú lateral. */
export interface EntityNavGroup {
  kind: "group"
  key: string
  label: string
  permissions?: string[]
  items: EntityNavLink[]
}

export type EntityNavEntry = EntityNavLink | EntityNavGroup

const link = (
  module: EntityInternalModule,
  overrides: Partial<EntityNavLink> = {}
): EntityNavLink => ({
  kind: "link",
  key: module.key,
  label: module.label,
  path: module.path,
  permissions: module.permissions,
  ...overrides,
})

const moduleByKey = (key: string): EntityInternalModule => {
  const found = ENTITY_INTERNAL_MODULES.find((m) => m.key === key)
  if (!found) throw new Error(`Módulo interno desconocido: ${key}`)
  return found
}

/**
 * ORDEN DEFINITIVO del menú lateral (§45):
 *   Resumen · Personas (Candidatos / Trabajadores / Reingresos) · Contratación ·
 *   Plantilla · Vacaciones · Licencias y certificados · Prenómina · Ajustes
 * Contratación queda DEBAJO de Personas y ENCIMA de Plantilla, como elemento
 * propio (no dentro del grupo Personas): su ruta y su página no cambian.
 * Ninguna entrada se duplica y Vencimientos no aparece como elemento directo.
 */
export const ENTITY_NAV: EntityNavEntry[] = [
  link(moduleByKey("summary")),
  {
    kind: "group",
    key: "personas",
    label: "Personas",
    permissions: ["candidates.view", "candidates.manage", "workers.view", "workers.manage"],
    items: [
      link(moduleByKey("candidates")),
      link(moduleByKey("workers")),
      link(moduleByKey("reentries")),
    ],
  },
  link(moduleByKey("hiring")),
  link(moduleByKey("staffing")),
  link(moduleByKey("vacations")),
  link(moduleByKey("medical-certificates")),
  link(moduleByKey("prenomina")),
  link(moduleByKey("settings")),
]

export const SITECORP_MODULES_DISABLED_TITLE = "Módulos internos no habilitados"

export const SITECORP_MODULES_DISABLED_MESSAGE =
  "Esta entidad no tiene habilitados los módulos internos de SiteCorp."

/** ¿La entidad utiliza los módulos internos de SiteCorp? */
export function hasSiteCorpAccount(
  entity: { is_sitecorp_account?: boolean | null } | null | undefined
): boolean {
  return entity?.is_sitecorp_account === true
}

/**
 * Regla central de acceso a módulos internos:
 *   entidad es Cuenta SiteCorp  (condición estructural)
 *   + el usuario tiene acceso a la entidad y permiso para el módulo (RBAC)
 */
export function canUseInternalModules(
  entity: { is_sitecorp_account?: boolean | null } | null | undefined,
  options: { isAuthorized: boolean }
): boolean {
  return hasSiteCorpAccount(entity) && options.isAuthorized
}

/**
 * Código de cuenta SiteCorp. No se introduce a mano y no se regenera al reeditar:
 * se deriva del código interno de la entidad (único por workspace).
 */
export const buildAccountCode = (entityCode: string): string =>
  `CUENTA-${entityCode.toUpperCase()}`

/** Ruta externa equivalente para volver cuando los módulos internos no están disponibles. */
export const organizationFallbackPath = (options: {
  isPlatformSuperAdmin: boolean
  hasPlatformOrganizationAccess: boolean
}): string =>
  options.isPlatformSuperAdmin || options.hasPlatformOrganizationAccess
    ? "/admin/companies"
    : "/organization"
