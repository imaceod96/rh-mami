import { supabase } from "@/lib/supabase"

/**
 * Datos contractuales de la entidad y representantes autorizados (Fase 11A.1).
 *
 * Separación conceptual: CARGO de representación → PERSONA que lo ocupa → PERÍODO
 * de vigencia. Los períodos son históricos: un relevo cierra el anterior y crea uno
 * nuevo, nunca reescribe el nombre de la persona anterior.
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
}

/** Datos contractuales de la entidad (organismo, rama, código laboral y domicilio). */
export async function fetchEntityContractData(
  entityId: string
): Promise<EntityContractData | null> {
  const { data, error } = await supabase
    .from("organization_entities")
    .select(
      "id, name, code, organism, branch, labor_identification_code, address, province, municipality"
    )
    .eq("id", entityId)
    .single()

  if (error) throw error
  return (data as EntityContractData) || null
}

export async function saveEntityContractData(
  entityId: string,
  input: EntityContractDataInput
): Promise<void> {
  const { error } = await supabase
    .from("organization_entities")
    .update({
      organism: input.organism,
      branch: input.branch,
      labor_identification_code: input.labor_identification_code,
      address: input.address,
      province: input.province,
      municipality: input.municipality,
    })
    .eq("id", entityId)

  if (error) throw error
}

/**
 * Cargos de representación de la entidad con la persona vigente en una fecha.
 * La resolución por fecha se centraliza en la función SQL
 * `resolve_entity_representatives` (nunca se consulta `effective_to IS NULL`).
 */
export async function fetchRepresentativePositions(
  entityId: string,
  onDate?: string
): Promise<RepresentativePositionRow[]> {
  const { data, error } = await supabase.rpc("resolve_entity_representatives", {
    p_entity_id: entityId,
    p_on_date: onDate ?? null,
  })

  if (error) throw error
  return (data as RepresentativePositionRow[]) || []
}

/** Representantes válidos (con ocupante) para la fecha indicada. */
export async function fetchValidRepresentatives(
  entityId: string,
  onDate: string
): Promise<RepresentativePositionRow[]> {
  const rows = await fetchRepresentativePositions(entityId, onDate)
  return rows.filter((row) => !!row.assignment_id && !!row.person_name)
}

export async function fetchRepresentativeHistory(
  positionId: string
): Promise<RepresentativeHistoryRow[]> {
  const { data, error } = await supabase
    .from("organization_representative_assignments")
    .select("id, person_name, effective_from, effective_to")
    .eq("representative_position_id", positionId)
    .order("effective_from", { ascending: false })

  if (error) throw error
  return (data as RepresentativeHistoryRow[]) || []
}

export async function createRepresentativePosition(input: {
  entityId: string
  title: string
  personName: string
  effectiveFrom: string
  displayOrder: number
}): Promise<void> {
  const { error } = await supabase.rpc("create_representative_position", {
    p_entity_id: input.entityId,
    p_title: input.title,
    p_person_name: input.personName,
    p_effective_from: input.effectiveFrom,
    p_display_order: input.displayOrder,
  })

  if (error) throw error
}

/** Cambio de representante: cierra el período anterior y abre el nuevo. */
export async function changeRepresentative(input: {
  positionId: string
  personName: string
  effectiveFrom: string
}): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("set_entity_representative", {
    p_position_id: input.positionId,
    p_person_name: input.personName,
    p_effective_from: input.effectiveFrom,
  })

  if (error) throw error
  return data as { status: string }
}

export async function updateRepresentativePosition(input: {
  positionId: string
  title?: string | null
  isActive?: boolean | null
}): Promise<void> {
  const { error } = await supabase.rpc("update_representative_position", {
    p_position_id: input.positionId,
    p_title: input.title ?? null,
    p_is_active: input.isActive ?? null,
  })

  if (error) throw error
}

/** Texto humano de un período de vigencia de representante. */
export function representativePeriodLabel(
  effectiveFrom: string,
  effectiveTo: string | null
): string {
  const from = formatRepresentativeDate(effectiveFrom)
  return effectiveTo ? `${from} → ${formatRepresentativeDate(effectiveTo)}` : `${from} → Actualidad`
}

export function formatRepresentativeDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—"
  const [year, month, day] = isoDate.split("-")
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}
