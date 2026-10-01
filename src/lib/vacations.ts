import { supabase } from "@/lib/supabase"

/**
 * Vacaciones — capa de datos (Fase 18).
 *
 * Fuente de verdad: el LEDGER `worker_vacation_movements` (el saldo = SUM(movimientos))
 * y el motor backend. El frontend NUNCA calcula devengo ni consumo: solo previsualiza
 * lo que el backend devuelve y delega toda escritura a RPC con validación backend.
 */

export const VACATION_ANNUAL_DAYS = 24
export const VACATION_MAX_ACCRUAL_DAYS = 24
export const VACATION_MIN_NATURAL_DAYS = 1
export const VACATION_MAX_NATURAL_DAYS = 15

export type VacationStatus = "NORMAL" | "NEAR_LIMIT" | "LIMIT_REACHED"
export type VacationPeriodStatus = "SCHEDULED" | "TAKEN" | "CANCELLED"
export type VacationMovementType = "ACCRUAL" | "VACATION_USAGE" | "ADJUSTMENT" | "INITIAL_BALANCE" | "REVERSAL"

export interface VacationSummary {
  worker_id: string
  balance: number
  accrued_this_year: number
  consumed_this_year: number
  next_accrual: number
  next_accrual_working_days: number | null
  projected_balance: number
  unaccredited_projection: number
  status: VacationStatus
  scheduled_future_days: number
  free_balance: number
  current_vacation_end: string | null
  current_vacation_return: string | null
  next_vacation_start: string | null
  next_vacation_end: string | null
  opening_cutoff: string | null
  has_schedule: boolean
}

export interface VacationOverviewRow {
  worker_id: string
  full_name: string
  area_name: string | null
  job_name: string | null
  position_name: string | null
  balance: number
  next_accrual: number
  projected_balance: number
  status: VacationStatus
  scheduled_future_days: number
  current_vacation_end: string | null
  next_vacation_start: string | null
  has_schedule: boolean
  active_vacation: boolean
}

export interface VacationPeriod {
  id: string
  worker_id: string
  start_date: string
  end_date: string
  natural_days: number
  sundays_count: number
  charged_days: number
  status: VacationPeriodStatus
  notes: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_at: string
}

export interface VacationMovement {
  id: string
  movement_type: VacationMovementType
  amount: number
  calculated_amount: number | null
  effective_date: string
  accrual_year: number | null
  accrual_month: number | null
  working_days_month: number | null
  working_days_year: number | null
  description: string | null
  reason: string | null
  vacation_id: string | null
  created_at: string
}

export const VACATION_STATUS_LABELS: Record<VacationStatus, string> = {
  NORMAL: "Normal",
  NEAR_LIMIT: "Próximo al límite",
  LIMIT_REACHED: "Límite alcanzado",
}

export const VACATION_MOVEMENT_LABELS: Record<VacationMovementType, string> = {
  ACCRUAL: "Devengo",
  VACATION_USAGE: "Vacaciones",
  ADJUSTMENT: "Ajuste",
  INITIAL_BALANCE: "Saldo inicial",
  REVERSAL: "Reversión",
}

export const VACATION_PERIOD_STATUS_LABELS: Record<VacationPeriodStatus, string> = {
  SCHEDULED: "Programadas",
  TAKEN: "Disfrutadas",
  CANCELLED: "Canceladas",
}

/** Redondea a 2 decimales para mostrar (el backend conserva 4). */
export const formatVacationDays = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const rpcError = (error: { message?: string } | null): never => {
  throw new Error(error?.message || "No se pudo completar la operación de vacaciones.")
}

/** Lista + KPIs de vacaciones de la entidad (el backend ejecuta catch-up idempotente). */
export async function fetchEntityVacationOverview(entityId: string): Promise<VacationOverviewRow[]> {
  const { data, error } = await supabase.rpc("entity_vacation_overview", { p_entity_id: entityId })
  if (error) rpcError(error)
  return ((data as VacationOverviewRow[]) || []).map((row) => ({
    ...row,
    balance: Number(row.balance) || 0,
    next_accrual: Number(row.next_accrual) || 0,
    projected_balance: Number(row.projected_balance) || 0,
    scheduled_future_days: Number(row.scheduled_future_days) || 0,
  }))
}

/** Contabiliza de forma idempotente los meses cerrados pendientes del trabajador. */
export async function ensureWorkerVacationAccruals(workerId: string): Promise<void> {
  const { error } = await supabase.rpc("run_worker_vacation_catchup", { p_worker_id: workerId })
  if (error) rpcError(error)
}

export async function fetchWorkerVacationSummary(workerId: string): Promise<VacationSummary> {
  const { data, error } = await supabase.rpc("worker_vacation_summary", { p_worker_id: workerId })
  if (error) rpcError(error)
  const s = (data as VacationSummary | null) || null
  if (!s) throw new Error("No se pudo obtener el saldo de vacaciones del trabajador.")
  return {
    ...s,
    balance: Number(s.balance) || 0,
    accrued_this_year: Number(s.accrued_this_year) || 0,
    consumed_this_year: Number(s.consumed_this_year) || 0,
    next_accrual: Number(s.next_accrual) || 0,
    projected_balance: Number(s.projected_balance) || 0,
    unaccredited_projection: Number(s.unaccredited_projection) || 0,
    scheduled_future_days: Number(s.scheduled_future_days) || 0,
    free_balance: Number(s.free_balance) || 0,
  }
}

export async function fetchWorkerVacationPeriods(workerId: string): Promise<VacationPeriod[]> {
  const { data, error } = await supabase
    .from("worker_vacations")
    .select("id, worker_id, start_date, end_date, natural_days, sundays_count, charged_days, status, notes, cancelled_at, cancel_reason, created_at")
    .eq("worker_id", workerId)
    .order("start_date", { ascending: false })
  if (error) throw new Error(error.message)
  return ((data as VacationPeriod[]) || []).map((p) => ({
    ...p,
    charged_days: Number(p.charged_days) || 0,
  }))
}

export async function fetchWorkerVacationMovements(workerId: string): Promise<VacationMovement[]> {
  const { data, error } = await supabase
    .from("worker_vacation_movements")
    .select("id, movement_type, amount, calculated_amount, effective_date, accrual_year, accrual_month, working_days_month, working_days_year, description, reason, vacation_id, created_at")
    .eq("worker_id", workerId)
    .order("effective_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
  if (error) throw new Error(error.message)
  return ((data as VacationMovement[]) || []).map((m) => ({
    ...m,
    amount: Number(m.amount) || 0,
    calculated_amount: m.calculated_amount === null ? null : Number(m.calculated_amount),
  }))
}

/** Registra un período de vacaciones (crea período + movimiento negativo en una transacción). */
export async function registerWorkerVacation(params: {
  workerId: string
  startDate: string
  endDate: string
  notes?: string | null
  requestId?: string | null
}): Promise<{ charged_days: number; balance: number; vacation_id: string }> {
  const { data, error } = await supabase.rpc("register_worker_vacation", {
    p_worker_id: params.workerId,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_notes: params.notes ?? null,
    p_request_id: params.requestId ?? null,
  })
  if (error) rpcError(error)
  return data as { charged_days: number; balance: number; vacation_id: string }
}

/** Cancela un período y revierte el consumo (transacción). */
export async function cancelWorkerVacation(vacationId: string, reason?: string | null): Promise<{ balance: number }> {
  const { data, error } = await supabase.rpc("cancel_worker_vacation", {
    p_vacation_id: vacationId,
    p_reason: reason ?? null,
  })
  if (error) rpcError(error)
  return data as { balance: number }
}

/** Ajuste administrativo auditable (nunca edita el saldo directamente). */
export async function adjustWorkerVacationBalance(params: {
  workerId: string
  amount: number
  reason: string
  effectiveDate?: string | null
}): Promise<{ balance: number }> {
  const { data, error } = await supabase.rpc("adjust_worker_vacation_balance", {
    p_worker_id: params.workerId,
    p_amount: params.amount,
    p_reason: params.reason,
    p_effective_date: params.effectiveDate ?? null,
  })
  if (error) rpcError(error)
  return data as { balance: number }
}

/** Inicializa el saldo de un trabajador histórico desde una fecha de corte. */
export async function setWorkerVacationOpeningBalance(params: {
  workerId: string
  amount: number
  cutoffDate: string
}): Promise<{ balance: number }> {
  const { data, error } = await supabase.rpc("set_worker_vacation_opening_balance", {
    p_worker_id: params.workerId,
    p_amount: params.amount,
    p_cutoff_date: params.cutoffDate,
  })
  if (error) rpcError(error)
  return data as { balance: number }
}

/**
 * Previsualización de consumo (SIN tocar la BD): días naturales, domingos y días a
 * descontar. Réplica EXACTA de la regla backend (`charged = natural − domingos`,
 * `1 ≤ natural ≤ 15`), usada solo para el diálogo; la validación definitiva es del
 * backend.
 */
export function previewVacationConsumption(startDate: string, endDate: string): {
  naturalDays: number
  sundays: number
  chargedDays: number
  valid: boolean
} {
  if (!startDate || !endDate) return { naturalDays: 0, sundays: 0, chargedDays: 0, valid: false }
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { naturalDays: 0, sundays: 0, chargedDays: 0, valid: false }
  }
  const naturalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  let sundays = 0
  for (let i = 0; i < naturalDays; i += 1) {
    const day = new Date(start.getTime() + i * 86400000).getUTCDay()
    if (day === 0) sundays += 1
  }
  return {
    naturalDays,
    sundays,
    chargedDays: naturalDays - sundays,
    valid:
      naturalDays >= VACATION_MIN_NATURAL_DAYS && naturalDays <= VACATION_MAX_NATURAL_DAYS,
  }
}

export const vacationWorkspaceAlertsEnabled = (permissions: string[]): boolean =>
  permissions.some((code) => ["vacations.view", "vacations.manage"].includes(code))
