/**
 * Compatibilidad pública — Niveles de preparación.
 *
 * El módulo ha sido migrado a `src/domains/organization-structure/`. Este archivo
 * reexporta explícitamente los símbolos originales para preservar la interfaz
 * pública sin romper a los consumidores existentes.
 *
 * No utiliza `export *` para mantener el contrato explícito.
 */

export type { PreparationLevel } from "@/domains/organization-structure"
export {
  NO_PREPARATION_LEVEL_LABEL,
  fetchPreparationLevels,
  fetchJobPreparationLevels,
  formatPreparationLevels,
} from "@/domains/organization-structure"
