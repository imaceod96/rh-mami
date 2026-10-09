/**
 * Catálogos globales de la estructura organizativa.
 *
 * Estos catálogos son GLOBALES de SiteCorp: no tienen tenant_id ni
 * organization_entity_id. Todos los workspaces y entidades consumen
 * exactamente los mismos valores.
 */

/** Categoría ocupacional global (Operario, Administrativo, Servicios, Técnico…). */
export interface OccupationalCategory {
  id: string
  name: string
  code: string
  sort_order: number
  is_active: boolean
}

/** Nivel de preparación global (NS, TM, etc.). */
export interface PreparationLevel {
  id: string
  name: string
  code: string
  sort_order: number
}
