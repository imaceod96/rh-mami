/**
 * Company Client — Reglas puras del dominio.
 *
 * Únicamente lógica independiente de React y de Supabase: comparación de
 * pertenencia al mismo cliente y comprobación de que un identificador es
 * utilizable antes de usarlo.
 *
 * Estas reglas NO sustituyen a RLS ni a `can_access_entity`: son validaciones de
 * forma previas al uso de un identificador, NUNCA autorización.
 */

import type { CompanyClientId } from "./entities"

/**
 * Normaliza un identificador para compararlo.
 *
 * `tenants.id` es `uuid`: su representación textual es insensible a mayúsculas,
 * por lo que se recortan los espacios y se unifica el caso antes de comparar.
 */
const normalize = (value: CompanyClientId): string => value.trim().toLowerCase()

/**
 * ¿El identificador existe y no está vacío?
 *
 * Comprueba SOLO presencia de valor: no valida formato, ni existencia en la
 * base de datos, ni permisos sobre el cliente.
 */
export function isCompanyClientId(
  value: CompanyClientId | null | undefined
): value is CompanyClientId {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * ¿Ambos identificadores pertenecen al MISMO cliente propietario?
 *
 * Comparación pura en memoria: no consulta Supabase y NO concede permiso
 * alguno sobre el cliente comparado.
 */
export function sameCompanyClient(
  a: CompanyClientId | null | undefined,
  b: CompanyClientId | null | undefined
): boolean {
  if (!isCompanyClientId(a) || !isCompanyClientId(b)) return false
  return normalize(a) === normalize(b)
}
