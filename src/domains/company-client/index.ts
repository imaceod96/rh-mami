/**
 * Company Client — Interfaz pública del dominio.
 *
 * Punto único de entrada para consumidores:
 *   import { toCompanyClient } from "@/domains/company-client"
 *
 * Estructura:
 *   domain/entities.ts                            → tipos y contratos
 *   domain/rules.ts                               → reglas puras
 *   infrastructure/company-client.mapper.ts        → compatibilidad con `tenant_id`
 *
 * Alcance de este subbloque: el módulo es AUTÓNOMO y todavía NO lo consume
 * ningún otro dominio, hook, página ni componente. Existe únicamente como
 * nomenclatura de dominio + mapper de compatibilidad.
 *
 * El dominio NO importa de `@/lib/*` ni de la presentación: la dependencia va en
 * un solo sentido (presentación → dominio; infrastructure → domain), por lo que
 * no puede formarse ningún ciclo.
 *
 * No hay repositorio ni acceso a datos: la lectura del cliente actual sigue
 * residiendo donde ya estaba. Este módulo NO es una autorización: RLS y
 * `can_access_entity` siguen siendo la autoridad final.
 */

/* Identificadores y contratos de dominio */
export type { CompanyClientId, CompanyClient, CompanyClientScope } from "./domain/entities"

/* Reglas puras */
export { isCompanyClientId, sameCompanyClient } from "./domain/rules"

/* Mapper de compatibilidad (legacy `tenant_id` ↔ `companyClientId`) */
export type { LegacyTenantSummary } from "./infrastructure/company-client.mapper"

export {
  tenantIdToCompanyClientId,
  companyClientIdToTenantId,
  toCompanyClient,
} from "./infrastructure/company-client.mapper"
