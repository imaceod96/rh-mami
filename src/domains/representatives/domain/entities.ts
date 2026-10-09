/**
 * Representantes y datos contractuales de entidad — Entidades y tipos del dominio.
 *
 * Vocabulario del dominio: CARGO de representación → PERSONA que lo ocupa → PERÍODO
 * de vigencia. Los períodos son históricos: un relevo cierra el anterior y crea uno
 * nuevo, nunca reescribe el nombre de la persona anterior.
 *
 * Las definiciones son EXACTAMENTE las que exponía `src/lib/representatives.ts`: la
 * migración a DDD es un traslado estructural, no un cambio de contrato.
 */

export const MAX_REPRESENTATIVE_POSITIONS = 2

export interface EntityContractData {
  id: string
  name: string
  code: string
  organism: string | null
  branch: string | null
  labor_identification_code: string | null
  address: string | null
  province: string | null
  municipality: string | null
  /** Fase 11A.7 — Año de la Revolución (dato institucional configurable, nunca calculado). Texto libre. */
  revolution_year: string | null
}

export interface RepresentativePositionRow {
  position_id: string
  title: string
  display_order: number
  assignment_id: string | null
  person_name: string | null
  effective_from: string | null
}

export interface RepresentativeHistoryRow {
  id: string
  person_name: string
  effective_from: string
  effective_to: string | null
}

export interface EntityContractDataInput {
  organism: string | null
  branch: string | null
  labor_identification_code: string | null
  address: string | null
  province: string | null
  municipality: string | null
  revolution_year: string | null
}
