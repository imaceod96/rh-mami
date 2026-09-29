import { supabase } from "@/lib/supabase"

/**
 * Catálogo GLOBAL de categorías ocupacionales (Fase 11A.2).
 *
 * Común a todas las entidades y tenants: nunca se filtra por tenant ni entidad.
 * La lógica de negocio se apoya en `code` (estable), nunca en el nombre visible.
 */

export interface OccupationalCategory {
  id: string
  name: string
  code: string
  sort_order: number
  is_active: boolean
}

/** Texto único usado por la UI cuando un cargo histórico no tiene categoría. */
export const NO_OCCUPATIONAL_CATEGORY_LABEL = "Sin categoría ocupacional configurada"

export async function fetchOccupationalCategories(options?: {
  includeInactive?: boolean
}): Promise<OccupationalCategory[]> {
  let query = supabase
    .from("occupational_categories")
    .select("id, name, code, sort_order, is_active")
    .order("sort_order")
    .order("name")

  if (!options?.includeInactive) {
    query = query.eq("is_active", true)
  }

  const { data, error } = await query
  if (error) throw error
  return (data as OccupationalCategory[]) || []
}

export function occupationalCategoryLabel(
  category: { name: string } | null | undefined
): string {
  return category?.name?.trim() || NO_OCCUPATIONAL_CATEGORY_LABEL
}

export function hasOccupationalCategory(
  job: { occupational_category_id?: string | null } | null | undefined
): boolean {
  return !!job?.occupational_category_id
}
