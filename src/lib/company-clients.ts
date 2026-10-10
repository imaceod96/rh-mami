import { supabase } from "@/lib/supabase"

/**
 * Company Client — Adaptador de ESCRITURA y operaciones administrativas.
 *
 * Este módulo es la frontera de compatibilidad con el backend LEGACY, que
 * todavía NO está migrado: la tabla física es `tenants`, las RPC son
 * `create_workspace`, `workspace_deletion_summary` y `delete_workspace`, y la
 * Edge Function es `delete-workspace`. Esos nombres físicos se envían
 * EXACTAMENTE como están (no se traducen aquí).
 *
 * La API pública de este módulo sí usa la nomenclatura de dominio
 * (`companyClientId`, `CompanyClient*`), porque es lo que consume la interfaz.
 * La correspondencia es la IDENTIDAD: `companyClientId === tenants.id`.
 *
 * El código del cliente es un identificador estable generado en el servidor:
 * nombre normalizado + sufijo alfanumérico único. Nunca se introduce a mano y
 * nunca se regenera al renombrar el cliente.
 */

export interface CompanyClientRecord {
  id: string
  name: string
  code: string
  description: string | null
  is_active: boolean
  created_at?: string
}

export interface CompanyClientInput {
  name: string
  description?: string | null
  isActive?: boolean
}

export const companyClientNameError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? "")
  if (message.toLowerCase().includes("row-level security")) {
    return "No tienes permiso para crear o editar clientes."
  }
  if (message.toLowerCase().includes("duplicate key")) {
    return "No se pudo generar un código único para el cliente. Inténtalo de nuevo."
  }
  return message || "No se pudo guardar el cliente."
}

/** Crea un cliente; el código lo genera la base de datos de forma automática. */
export async function createCompanyClient(
  input: CompanyClientInput,
): Promise<CompanyClientRecord> {
  // Contrato físico: RPC `create_workspace` (nombre legacy intacto).
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_is_active: input.isActive ?? true,
  })

  if (error) throw new Error(companyClientNameError(error))
  return data as CompanyClientRecord
}

/**
 * Actualiza los datos editables del cliente. El código no se envía nunca:
 * es inmutable y la base de datos rechaza cualquier cambio.
 */
export async function updateCompanyClient(
  companyClientId: string,
  input: CompanyClientInput,
): Promise<void> {
  // Tabla física: `tenants` (nombre legacy intacto).
  const { error } = await supabase
    .from("tenants")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: input.isActive ?? true,
    })
    .eq("id", companyClientId)

  if (error) throw new Error(companyClientNameError(error))
}

/**
 * Datos propios del cliente que se eliminan definitivamente.
 * Las claves `tenant_id` / `tenant_name` son el contrato de la RPC legacy.
 */
export interface CompanyClientDeletionSummary {
  tenant_id: string
  tenant_name: string
  entities: number
  workers: number
  positions: number
  candidates: number
  contracts: number
  addendums: number
  worker_documents: number
  candidate_documents: number
  document_templates: number
  roles: number
  memberships: number
  invitations: number
}

export interface CompanyClientDeletionResult {
  status: "DELETED"
  tenant_id: string
  tenant_name: string | null
  summary: CompanyClientDeletionSummary | null
  storage: { removed: number; failed: number; failures?: string[] }
}

const deletionError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? "")
  if (message.toLowerCase().includes("row-level security")) {
    return "No tienes permiso para eliminar clientes."
  }
  return message || "No se pudo eliminar el cliente."
}

/**
 * Resumen real (solo lectura) de lo que se eliminaría. Lo calcula el backend con
 * el permiso de plataforma `tenants.delete`; nunca se inventan cifras en la UI.
 */
export async function getCompanyClientDeletionSummary(
  companyClientId: string,
): Promise<CompanyClientDeletionSummary> {
  // Contrato físico: RPC `workspace_deletion_summary` (nombre legacy intacto).
  const { data, error } = await supabase.rpc("workspace_deletion_summary", {
    p_tenant_id: companyClientId,
  })

  if (error) {
    console.error("No se pudo obtener el resumen de eliminación del cliente.", {
      companyClientId,
      error,
    })
    throw new Error(deletionError(error))
  }

  return data as CompanyClientDeletionSummary
}

/**
 * Elimina definitivamente el cliente.
 *
 * La autorización, la confirmación por nombre y el borrado en base de datos se
 * ejecutan en una única transacción dentro de `delete_workspace`; la función
 * backend además limpia del Storage privado exclusivamente los objetos del
 * cliente eliminado y reporta cualquier fallo parcial.
 */
export async function deleteCompanyClient(
  companyClientId: string,
  confirmationName: string,
): Promise<CompanyClientDeletionResult> {
  // Contrato físico: Edge Function `delete-workspace` con cuerpo legacy.
  const { data, error } = await supabase.functions.invoke("delete-workspace", {
    body: { tenant_id: companyClientId, confirmation_name: confirmationName },
  })

  if (error) {
    let backendMessage: string | null = null
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === "function") {
      try {
        const payload = (await context.json()) as { error?: string }
        backendMessage = payload?.error ?? null
      } catch {
        backendMessage = null
      }
    }

    // Diagnóstico técnico completo: el mensaje final del backend puede ser
    // traducido, pero el error original nunca se descarta.
    console.error("Fallo al eliminar el cliente.", {
      companyClientId,
      backendMessage,
      error,
    })

    throw new Error(backendMessage || deletionError(error))
  }

  return data as CompanyClientDeletionResult
}
