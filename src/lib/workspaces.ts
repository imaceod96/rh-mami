import { supabase } from "@/lib/supabase"

/**
 * Workspaces (tenant de organización).
 *
 * El código del workspace es un identificador estable generado en el servidor:
 * nombre normalizado + sufijo alfanumérico único. Nunca se introduce a mano y
 * nunca se regenera al renombrar el workspace.
 */

export interface Workspace {
  id: string
  name: string
  code: string
  description: string | null
  is_active: boolean
  created_at?: string
}

export interface WorkspaceInput {
  name: string
  description?: string | null
  isActive?: boolean
}

export const workspaceNameError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? "")
  if (message.toLowerCase().includes("row-level security")) {
    return "No tienes permiso para crear o editar workspaces."
  }
  if (message.toLowerCase().includes("duplicate key")) {
    return "No se pudo generar un código único para el workspace. Inténtalo de nuevo."
  }
  return message || "No se pudo guardar el workspace."
}

/** Crea un workspace; el código lo genera la base de datos de forma automática. */
export async function createWorkspace(input: WorkspaceInput): Promise<Workspace> {
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_is_active: input.isActive ?? true,
  })

  if (error) throw new Error(workspaceNameError(error))
  return data as Workspace
}

/**
 * Actualiza los datos editables del workspace. El código no se envía nunca:
 * es inmutable y la base de datos rechaza cualquier cambio.
 */
export async function updateWorkspace(id: string, input: WorkspaceInput): Promise<void> {
  const { error } = await supabase
    .from("tenants")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: input.isActive ?? true,
    })
    .eq("id", id)

  if (error) throw new Error(workspaceNameError(error))
}

/** Datos propios del workspace que se eliminan definitivamente. */
export interface WorkspaceDeletionSummary {
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

export interface WorkspaceDeletionResult {
  status: "DELETED"
  tenant_id: string
  tenant_name: string | null
  summary: WorkspaceDeletionSummary | null
  storage: { removed: number; failed: number; failures?: string[] }
}

const deletionError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? "")
  if (message.toLowerCase().includes("row-level security")) {
    return "No tienes permiso para eliminar workspaces."
  }
  return message || "No se pudo eliminar el workspace."
}

/**
 * Resumen real (solo lectura) de lo que se eliminaría. Lo calcula el backend con
 * el permiso de plataforma `tenants.delete`; nunca se inventan cifras en la UI.
 */
export async function getWorkspaceDeletionSummary(
  tenantId: string,
): Promise<WorkspaceDeletionSummary> {
  const { data, error } = await supabase.rpc("workspace_deletion_summary", {
    p_tenant_id: tenantId,
  })

  if (error) {
    console.error("No se pudo obtener el resumen de eliminación del workspace.", {
      tenantId,
      error,
    })
    throw new Error(deletionError(error))
  }

  return data as WorkspaceDeletionSummary
}

/**
 * Elimina definitivamente el workspace.
 *
 * La autorización, la confirmación por nombre y el borrado en base de datos se
 * ejecutan en una única transacción dentro de `delete_workspace`; la función
 * backend además limpia del Storage privado exclusivamente los objetos del
 * workspace eliminado y reporta cualquier fallo parcial.
 */
export async function deleteWorkspace(
  tenantId: string,
  confirmationName: string,
): Promise<WorkspaceDeletionResult> {
  const { data, error } = await supabase.functions.invoke("delete-workspace", {
    body: { tenant_id: tenantId, confirmation_name: confirmationName },
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
    console.error("Fallo al eliminar el workspace.", { tenantId, backendMessage, error })

    throw new Error(backendMessage || deletionError(error))
  }

  return data as WorkspaceDeletionResult
}
