/**
 * Cuenta SiteCorp de una entidad organizativa.
 *
 * Regla única del sistema:
 *   organization_entities.is_sitecorp_account === true
 *   → la entidad usa los MÓDULOS INTERNOS de gestión de SiteCorp
 *     (Resumen, Candidatos, Plantilla, Vencimientos, Contratación, Ajustes)
 *
 * No significa: otro tenant/workspace, otro régimen, otra jerarquía ni una cuenta de
 * usuario. Es una propiedad estructural de la entidad y NO sustituye a los permisos:
 * el acceso real sigue siendo entidad SiteCorp + acceso a la entidad + permiso RBAC.
 *
 * `is_active` (estado de la entidad) y `is_sitecorp_account` (habilitación de módulos)
 * son conceptos independientes y no se sustituyen entre sí.
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

/** Módulos internos disponibles cuando la entidad es Cuenta SiteCorp. */
export const ENTITY_INTERNAL_MODULES: EntityInternalModule[] = [
  { key: "summary", label: "Resumen", path: (id) => `/entity/${id}/summary` },
  {
    key: "candidates",
    label: "Candidatos",
    path: (id) => `/entity/${id}/candidates`,
    permissions: ["candidates.view", "candidates.manage"],
  },
  {
    key: "staffing",
    label: "Plantilla",
    path: (id) => `/entity/${id}/staffing`,
    permissions: ["workers.view", "workers.manage"],
  },
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
  {
    key: "vacations",
    label: "Vacaciones",
    path: (id) => `/entity/${id}/vacations`,
    permissions: ["vacations.view", "vacations.manage"],
  },
  {
    key: "medical-certificates",
    label: "Licencias / Certificados Médicos",
    path: (id) => `/entity/${id}/medical-certificates`,
    permissions: ["medical_certificates.view", "medical_certificates.manage"],
  },
  { key: "settings", label: "Ajustes", path: (id) => `/entity/${id}/settings` },
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
 *
 * `isAuthorized` es el resultado de la verificación de acceso ya existente
 * (`can_view_entity`, permisos de plataforma o SuperAdmin). La Cuenta SiteCorp nunca
 * concede permisos por sí misma.
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
