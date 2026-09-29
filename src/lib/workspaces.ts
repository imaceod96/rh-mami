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
