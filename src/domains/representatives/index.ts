/**
 * Representantes y datos contractuales de entidad — Interfaz pública del dominio.
 *
 * Punto único de entrada para los consumidores (componentes y páginas):
 *   · domain/entities.ts                  → contratos de datos y límite de cargos
 *   · domain/rules.ts                     → reglas puras (pendientes y formatos)
 *   · infrastructure/                     → repositorio (RPC y consultas Supabase)
 *
 * El dominio NO importa de `@/lib/*` ni de la presentación: la dependencia va
 * siempre en un solo sentido (presentación → dominio → infraestructura → Supabase),
 * por lo que no puede formarse ningún ciclo.
 *
 * Este contexto NO tiene capa `application/`: no existe orquestación multi-paso
 * (cada operación es una única llamada) y la resolución por fecha es del backend.
 */

/* Entidades y límites */
export type {
  EntityContractData,
  EntityContractDataInput,
  RepresentativeHistoryRow,
  RepresentativePositionRow,
} from "./domain/entities"

export { MAX_REPRESENTATIVE_POSITIONS } from "./domain/entities"

/* Reglas puras */
export {
  pendingEntityContractualData,
  representativePeriodLabel,
  formatRepresentativeDate,
} from "./domain/rules"

/* Repositorio (acceso a datos) */
export {
  fetchEntityContractData,
  saveEntityContractData,
  fetchRepresentativePositions,
  fetchValidRepresentatives,
  fetchRepresentativeHistory,
  createRepresentativePosition,
  changeRepresentative,
  updateRepresentativePosition,
} from "./infrastructure/representatives.repository"
