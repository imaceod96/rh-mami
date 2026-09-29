import { supabase } from "@/lib/supabase"

/**
 * Histórico salarial del trabajador y documentos contractuales pendientes (Fase 11A).
 * Son registros históricos/contractuales: nunca se recalculan ni se sobrescriben.
 */

export const SALARY_CHANGE_TYPE_LABELS: Record<string, string> = {
  INITIAL_CONTRACT: "Contrato inicial",
  SALARY_SCALE_CHANGE: "Cambio de escala salarial",
  POSITION_CHANGE: "Cambio de puesto",
  CONTRACT_CHANGE: "Cambio de contrato",
  REINCORPORATION: "Reincorporación",
}

export const ADDENDUM_STATUS_LABELS: Record<string, string> = {
  PENDING_TEMPLATE: "Pendiente de generar",
  READY_TO_GENERATE: "Listo para generar",
  GENERATED: "Generado",
  GENERATION_ERROR: "Error de generación",
  CANCELLED: "Cancelado",
}

export const ADDENDUM_STATUS_BADGE: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  PENDING_TEMPLATE: "warning",
  READY_TO_GENERATE: "info",
  GENERATED: "success",
  GENERATION_ERROR: "danger",
  CANCELLED: "neutral",
}

export interface WorkerSalaryHistoryEntry {
  id: string
  worker_id: string
  employment_contract_id: string | null
  assignment_id: string | null
  salary_group_id: string | null
  salary_scale_id: string | null
  previous_amount: number | null
  new_amount: number
  currency_code: string
  effective_date: string
  change_type: string
  source: string
  notes: string | null
  created_at: string
  group_sequence_number: number | null
  addendums: {
    id: string
    status: string
    effective_date: string
    document_type_id: string
    previous_amount: number | null
    new_amount: number | null
    currency_code: string | null
    employment_contract_id: string | null
  }[]
}

/** Histórico salarial del trabajador en orden cronológico inverso, con su anexo si existe. */
export async function fetchWorkerSalaryHistory(
  workerId: string
): Promise<WorkerSalaryHistoryEntry[]> {
  const { data, error } = await supabase
    .from("worker_salary_history")
    .select(
      `id, worker_id, employment_contract_id, assignment_id, salary_group_id, salary_scale_id,
       previous_amount, new_amount, currency_code, effective_date, change_type, source, notes, created_at,
       salary_group:salary_groups(sequence_number),
       addendums:contract_addendums(id, status, effective_date, document_type_id, previous_amount, new_amount, currency_code, employment_contract_id)`
    )
    .eq("worker_id", workerId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) throw error

  return (((data as any[]) || []).map((row) => ({
    ...row,
    group_sequence_number: Array.isArray(row.salary_group)
      ? row.salary_group[0]?.sequence_number ?? null
      : row.salary_group?.sequence_number ?? null,
    addendums: row.addendums || [],
  })) as WorkerSalaryHistoryEntry[]) || []
}

/** Anexos contractuales del trabajador pendientes de generar (sin archivo todavía). */
export function pendingAddendums(history: WorkerSalaryHistoryEntry[]) {
  const rows: {
    id: string
    status: string
    effective_date: string
    document_type_id: string
    previous_amount: number | null
    new_amount: number | null
    currency_code: string | null
    employment_contract_id: string | null
    group_sequence_number: number | null
  }[] = []

  history.forEach((entry) => {
    entry.addendums.forEach((addendum) => {
      rows.push({ ...addendum, group_sequence_number: entry.group_sequence_number })
    })
  })

  return rows.sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1))
}
