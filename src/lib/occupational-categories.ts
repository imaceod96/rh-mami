/**
 * Compatibilidad pública — Categorías ocupacionales.
 *
 * El módulo ha sido migrado a `src/domains/organization-structure/`. Este archivo
 * reexporta explícitamente los símbolos originales para preservar la interfaz
 * pública sin romper a los consumidores existentes.
 *
 * No utiliza `export *` para mantener el contrato explícito.
 */

export type { OccupationalCategory } from "@/domains/organization-structure"
export {
  NO_OCCUPATIONAL_CATEGORY_LABEL,
  fetchOccupationalCategories,
  occupationalCategoryLabel,
  hasOccupationalCategory,
} from "@/domains/organization-structure"
