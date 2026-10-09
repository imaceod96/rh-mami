/**
 * Representantes y datos contractuales de entidad — Módulo de COMPATIBILIDAD.
 *
 * El código del dominio se ha trasladado a la estructura DDD:
 *   src/domains/representatives/
 *     · domain/entities.ts                             → contratos de datos y límites
 *     · domain/rules.ts                                → reglas puras (pendientes y formatos)
 *     · infrastructure/representatives.repository.ts   → RPC y consultas Supabase
 *
 * Este archivo conserva EXACTAMENTE las 16 exportaciones públicas originales
 * (mismos nombres y firmas) para que cualquier consumidor que todavía importe desde
 * "@/lib/representatives" siga funcionando sin cambios.
 *
 * Es únicamente una reexportación: no debe contener lógica. Cualquier ajuste de
 * comportamiento pertenece al dominio, no a este módulo.
 */

/* Entidades y límites */
export type {
  EntityContractData,
  EntityContractDataInput,
  RepresentativeHistoryRow,
  RepresentativePositionRow,
} from "@/domains/representatives"

export { MAX_REPRESENTATIVE_POSITIONS } from "@/domains/representatives"

/* Reglas puras */
export {
  pendingEntityContractualData,
  representativePeriodLabel,
  formatRepresentativeDate,
} from "@/domains/representatives"

/* Operaciones de datos (RPC y consultas) */
export {
  fetchEntityContractData,
  saveEntityContractData,
  fetchRepresentativePositions,
  fetchValidRepresentatives,
  fetchRepresentativeHistory,
  createRepresentativePosition,
  changeRepresentative,
  updateRepresentativePosition,
} from "@/domains/representatives"
