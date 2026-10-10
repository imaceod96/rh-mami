import { supabase } from "@/lib/supabase"

/**
 * Catálogo de permisos de PLATAFORMA (Nivel 1 — Administración global de SiteCorp).
 *
 * Regla arquitectónica:
 *   NIVEL 1 — PLATAFORMA SITECORP  → platform_roles / platform_permissions
 *   NIVEL 2 — ENTIDAD             → tenant_roles / tenant_permissions
 *
 * La base de datos es la fuente de verdad de qué permiso pertenece al catálogo
 * de plataforma (`platform_permissions.is_platform_scope`). El frontend NO
 * decide por su cuenta: sólo agrupa y etiqueta lo que el catálogo marca como
 * de plataforma. Los permisos internos de entidad (p. ej. `jobs.*`,
 * `tenant_roles.*`) quedan fuera de este gestor y se administran en su nivel.
 */

/** Orden canónico de los grupos del gestor global (§7). */
export const PLATFORM_CATEGORY_ORDER = [
  "CLIENTES",
  "ORGANIZACIONES",
  "USUARIOS",
  "ROLES Y PERMISOS",
  "INFORMES",
  "CONFIGURACIÓN",
] as const

export interface PlatformPermission {
  id: string
  code: string
  description: string | null
  category: string | null
  is_platform_scope: boolean
}

export interface PlatformPermissionGroup {
  title: string
  codes: string[]
}

/** Etiquetas legibles del catálogo de plataforma (§7). */
export const PLATFORM_PERMISSION_LABELS: Record<string, string> = {
  "tenants.view": "Ver clientes",
  "tenants.create": "Crear clientes",
  "tenants.edit": "Editar clientes",
  "tenants.activate": "Activar clientes",
  "tenants.deactivate": "Desactivar clientes",
  "tenants.delete": "Eliminar clientes",
  "tenants.enter": "Abrir clientes",
  "organizations.view_all": "Ver todas las organizaciones",
  "organizations.manage_all": "Gestionar todas las organizaciones",
  "organizations.delete": "Eliminar organizaciones",
  "users.view_all": "Ver usuarios globales",
  "users.manage_all": "Crear, editar y gestionar usuarios globales",
  "users.invite": "Invitar usuarios de plataforma",
  "platform_roles.view": "Ver roles de plataforma",
  "platform_roles.manage": "Crear y editar roles de plataforma",
  "reports.cross_tenant": "Ver informes globales",
  "platform_settings.view": "Ver configuración de plataforma",
  "platform_settings.manage": "Gestionar configuración de plataforma",
  "salary.view": "Ver escala salarial presupuestada global",
  "salary.manage": "Gestionar escala salarial presupuestada global",
}

export const platformPermissionLabel = (permission: {
  code: string
  description: string | null
}): string =>
  PLATFORM_PERMISSION_LABELS[permission.code] || permission.description || permission.code

/** Catálogo completo de permisos de plataforma (incluye los retirados, para histórico). */
export const fetchPlatformPermissions = async (): Promise<PlatformPermission[]> => {
  const { data, error } = await supabase
    .from("platform_permissions")
    .select("id, code, description, category, is_platform_scope")
    .order("code")

  if (error) throw new Error(error.message)
  return (data as PlatformPermission[]) || []
}

/**
 * Agrupa los permisos DE PLATAFORMA según la categoría del catálogo.
 * Sólo se incluyen los permisos marcados como de plataforma.
 */
export const groupPlatformPermissions = (
  permissions: PlatformPermission[]
): PlatformPermissionGroup[] => {
  const catalog = permissions.filter((permission) => permission.is_platform_scope)
  const categories = [
    ...PLATFORM_CATEGORY_ORDER.filter((category) =>
      catalog.some((permission) => permission.category === category)
    ),
    ...[
      ...new Set(
        catalog
          .map((permission) => permission.category)
          .filter((category): category is string => !!category)
      ),
    ].filter((category) => !(PLATFORM_CATEGORY_ORDER as readonly string[]).includes(category)),
  ]

  return categories.map((category) => ({
    title: category,
    codes: catalog
      .filter((permission) => permission.category === category)
      .map((permission) => permission.code)
      .sort(),
  }))
}
