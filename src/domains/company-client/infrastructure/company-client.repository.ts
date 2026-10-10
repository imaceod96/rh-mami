import { supabase } from "@/lib/supabase"
import type { CompanyClientId } from "../domain/entities"
import { toCompanyClient } from "./company-client.mapper"

/**
 * Obtiene un cliente por su UUID legacy (`tenants.id`) y lo proyecta al dominio.
 *
 * La fila solo es visible si la sesión actual puede leerla según RLS. Un
 * resultado sin fila devuelve `null`; los errores de consulta se propagan.
 * Este repositorio no cambia el cliente activo ni concede autorización.
 */
export async function getCompanyClientById(
  companyClientId: CompanyClientId
) {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, code, description, is_active, created_at, updated_at")
    .eq("id", companyClientId)
    .maybeSingle()

  if (error) throw error
  return data ? toCompanyClient(data) : null
}
