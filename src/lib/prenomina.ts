import { supabase } from "@/lib/supabase"
import { academicCategoryLabel } from "@/lib/academic-payment"

export { academicCategoryLabel }

/**
 * PRENÓMINA (Fase 1) — preparación mensual del pago de los trabajadores activos.
 *
 * Conceptos incluidos: Salario Escala + Antigüedad + Categoría académica +
 * Nocturnidad + CLA (Condiciones Laborales Anormales).
 *
 * CLA y Nocturnidad son conceptos DISTINTOS e independientes y ambos coexisten:
 *   * Nocturnidad → tramos fijos 19:00–23:00 / 23:00–07:00 (prenomina_night_entries).
 *   * CLA         → tarifas por hora configuradas en el Cargo (diurno + dos tramos
 *                   nocturnos configurables) × minutos capturados por trabajador.
 *
 * El cálculo definitivo vive en la base de datos (RPC `prenomina_*`). Este módulo
 * reutiliza las MISMAS constantes de dominio para previsualizar en la UI y para
 * exportar; nunca introduce conceptos ni tarifas nuevas.
 */

/** Regla fija de negocio: divisor de horas del salario escala. NO depende del mes. */
export const MONTHLY_SALARY_HOURS_DIVISOR = 190.6

/** Tarifa adicional nocturnidad — Tramo 19:00–23:00 (CUP/hora). */
export const NIGHT_RATE_19_23 = 0.6

/** Tarifa adicional nocturnidad — Tramo 23:00–07:00 (CUP/hora). */
export const NIGHT_RATE_23_07 = 1.15

export const PRENOMINA_STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  CERRADA: "Cerrada",
}

export const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

export interface PrenominaPeriod {
  id: string
  organization_entity_id: string
  period_year: number
  period_month: number
  status: "BORRADOR" | "CERRADA"
  created_at: string
  closed_at: string | null
}

export interface PrenominaWorkerEntry {
  id: string
  period_id: string
  organization_entity_id: string
  worker_id: string
  worker_name_snapshot: string
  identification_snapshot: string | null
  area_name_snapshot: string | null
  job_name_snapshot: string | null
  position_name_snapshot: string | null
  salary_group_id: string | null
  salary_group_sequence: number | null
  salary_scale_id: string | null
  salary_scale_amount: number | null
  salary_currency: string | null
  workday_hours: number | null
  worked_days: number
  worked_hours: number
  hourly_scale_rate: number
  scale_salary_payment: number
  // Antigüedad (Fase 2)
  employment_start_date_snapshot: string | null
  tenure_reference_date: string | null
  tenure_years: number | null
  tenure_months: number | null
  tenure_total_months: number | null
  tenure_band_id: string | null
  tenure_band_label: string | null
  tenure_base_amount: number | null
  tenure_hourly_rate: number
  tenure_payment: number
  tenure_status: string
  // Pago por categoría académica (Máster / Doctor) — snapshot del período
  has_masters_degree_snapshot: boolean
  has_doctorate_degree_snapshot: boolean
  academic_category: "MASTER" | "DOCTOR" | null
  academic_status: string
  academic_monthly_amount: number | null
  academic_hourly_rate: number
  academic_payment: number
  // CLA — Condiciones Laborales Anormales (snapshot por trabajador del período).
  // Concepto INDEPENDIENTE de la Nocturnidad.
  cla_applied: boolean
  cla_day_enabled: boolean
  cla_day_used: boolean
  cla_day_hourly_rate: number | null
  cla_day_minutes: number
  cla_day_hours: number
  cla_day_payment: number
  cla_night_enabled: boolean
  cla_night_used: boolean
  cla_night1_start: string | null
  cla_night1_end: string | null
  cla_night1_hourly_rate: number | null
  cla_night1_minutes: number
  cla_night1_hours: number
  cla_night1_payment: number
  cla_night2_start: string | null
  cla_night2_end: string | null
  cla_night2_hourly_rate: number | null
  cla_night2_minutes: number
  cla_night2_hours: number
  cla_night2_payment: number
  cla_total_payment: number
  night_payment_19_23: number
  night_payment_23_07: number
  total_night_payment: number
  total_payment: number
}

export interface PrenominaNightEntry {
  id: string
  worker_entry_id: string
  start_time: string
  end_time: string
  nights_worked: number
  hours_19_23_per_night: number
  hours_23_07_per_night: number
  payment_19_23: number
  payment_23_07: number
  total_payment: number
}

/**
 * Configuración CLA del Cargo ACTUAL del trabajador (para la captura mensual).
 * Se resuelve desde el Assignment/Puesto vigente (RPC `prenomina_cla_config`) o,
 * en períodos CERRADOS, desde el snapshot del propio registro.
 */
export interface PrenominaClaConfig {
  applicable: boolean
  day_enabled: boolean
  day_rate: number | null
  night_enabled: boolean
  night1_start: string | null
  night1_end: string | null
  night1_rate: number | null
  night2_start: string | null
  night2_end: string | null
  night2_rate: number | null
}

/** Construye la configuración CLA a partir del snapshot congelado del registro. */
export function claConfigFromEntry(entry: PrenominaWorkerEntry): PrenominaClaConfig {
  const t = (value: string | null | undefined) => (value ? String(value).slice(0, 5) : null)
  return {
    applicable: entry.cla_day_enabled || entry.cla_night_enabled,
    day_enabled: entry.cla_day_enabled,
    day_rate: entry.cla_day_hourly_rate,
    night_enabled: entry.cla_night_enabled,
    night1_start: t(entry.cla_night1_start),
    night1_end: t(entry.cla_night1_end),
    night1_rate: entry.cla_night1_hourly_rate,
    night2_start: t(entry.cla_night2_start),
    night2_end: t(entry.cla_night2_end),
    night2_rate: entry.cla_night2_hourly_rate,
  }
}

// ---------------------------------------------------------------------------
// Formato / precisión
// ---------------------------------------------------------------------------

const moneyFormatter = new Intl.NumberFormat("es-CU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const formatMoney = (value: number | null | undefined): string =>
  moneyFormatter.format(Number(value || 0))

export const formatMoneyWithCurrency = (
  value: number | null | undefined,
  currency = "CUP"
): string => `${formatMoney(value)} ${currency || "CUP"}`

export const formatHours = (value: number | null | undefined): string =>
  Number(value || 0).toLocaleString("es-CU", { maximumFractionDigits: 2 })

/** Minutos enteros, sin decimales. */
export const formatMinutes = (value: number | null | undefined): string =>
  Number(value || 0).toLocaleString("es-CU", { maximumFractionDigits: 0 })

/** Conversión explícita minutos → horas para auditoría: «90 min → 1,5 h». */
export const formatMinutesToHours = (minutes: number | null | undefined): string =>
  `${formatMinutes(minutes)} min → ${formatHours(Number(minutes || 0) / 60)} h`

/** Días trabajados con coma decimal (UI española): 20.5 → "20,5". */
export const formatDecimalInput = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return ""
  return Number(value).toLocaleString("es-CU", { maximumFractionDigits: 2, useGrouping: false })
}

/**
 * Normaliza la entrada decimal aceptando coma española.
 * "20,5" → 20.5 ; "20" → 20 ; "" → 0. Nunca usa parseInt.
 */
export const parseDecimalInput = (raw: string): number => {
  if (raw === null || raw === undefined) return 0
  const normalized = String(raw).trim().replace(/\s/g, "").replace(",", ".")
  if (normalized === "" || normalized === ".") return 0
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export const parseIntegerInput = (raw: string): number => {
  const parsed = parseDecimalInput(raw)
  return Math.trunc(parsed)
}

// ---------------------------------------------------------------------------
// Cálculo (espejo de la lógica de dominio en BD; usado solo para previsualizar)
// ---------------------------------------------------------------------------

export interface NightOverlapHours {
  hours19_23: number
  hours23_07: number
}

const timeToMinutes = (time: string): number => {
  const [h, m] = String(time || "00:00").split(":")
  return Number(h) * 60 + Number(m || 0)
}

/**
 * Horas reales del horario introducido que se solapan con cada tramo nocturno,
 * contemplando horarios que cruzan medianoche (19:00 → 07:00) y parciales.
 */
export function computeNightOverlapHours(start: string, end: string): NightOverlapHours {
  let s = timeToMinutes(start)
  let e = timeToMinutes(end)
  if (e <= s) e += 1440

  const overlap = (a: number, b: number) => Math.max(0, Math.min(e, b) - Math.max(s, a))

  let m1 = 0
  let m2 = 0
  for (const k of [-1440, 0, 1440]) {
    m1 += overlap(1140 + k, 1380 + k) // 19:00–23:00
    m2 += overlap(1380 + k, 1860 + k) // 23:00–07:00 (cruza medianoche)
  }
  const round2 = (n: number) => Math.round(n * 100) / 100
  return { hours19_23: round2(m1 / 60), hours23_07: round2(m2 / 60) }
}

export interface NightPreview {
  hours19_23: number
  hours23_07: number
  payment19_23: number
  payment23_07: number
  totalPayment: number
}

export function computeNightPreview(start: string, end: string, nights: number): NightPreview {
  const { hours19_23, hours23_07 } = computeNightOverlapHours(start, end)
  const safeNights = Math.max(0, nights || 0)
  const payment19_23 = Math.round(hours19_23 * NIGHT_RATE_19_23 * safeNights * 100) / 100
  const payment23_07 = Math.round(hours23_07 * NIGHT_RATE_23_07 * safeNights * 100) / 100
  return {
    hours19_23,
    hours23_07,
    payment19_23,
    payment23_07,
    totalPayment: Math.round((payment19_23 + payment23_07) * 100) / 100,
  }
}

export interface ClaPreviewInput {
  applied: boolean
  dayEnabled: boolean
  dayRate: number | null
  dayMinutes: number
  nightEnabled: boolean
  night1Rate: number | null
  night1Minutes: number
  night2Rate: number | null
  night2Minutes: number
}

export interface ClaPreview {
  dayHours: number
  dayPayment: number
  night1Hours: number
  night1Payment: number
  night2Hours: number
  night2Payment: number
  totalPayment: number
}

/**
 * Previsualiza el CLA de un trabajador en el período (espejo de prenomina_recalc_entry).
 * Cada tramo es independiente: horas = minutos / 60 ; importe = horas × tarifa del tramo.
 * No redondea prematuramente las horas (4 decimales) y aplica la política monetaria
 * de Prenómina (2 decimales) al importe. NO tiene relación con la Nocturnidad.
 */
export function computeClaPreview(input: ClaPreviewInput): ClaPreview {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4
  const dayHours = input.applied && input.dayEnabled ? r4((input.dayMinutes || 0) / 60) : 0
  const dayPayment = input.applied && input.dayEnabled ? r2(dayHours * Number(input.dayRate || 0)) : 0
  const night1Hours = input.applied && input.nightEnabled ? r4((input.night1Minutes || 0) / 60) : 0
  const night1Payment = input.applied && input.nightEnabled ? r2(night1Hours * Number(input.night1Rate || 0)) : 0
  const night2Hours = input.applied && input.nightEnabled ? r4((input.night2Minutes || 0) / 60) : 0
  const night2Payment = input.applied && input.nightEnabled ? r2(night2Hours * Number(input.night2Rate || 0)) : 0
  return {
    dayHours,
    dayPayment,
    night1Hours,
    night1Payment,
    night2Hours,
    night2Payment,
    totalPayment: r2(dayPayment + night1Payment + night2Payment),
  }
}

export interface EntryPreview {
  hourlyRate: number
  workedHours: number
  scaleSalaryPayment: number
  tenureHourlyRate: number
  tenurePayment: number
  academicHourlyRate: number
  academicPayment: number
  claTotalPayment: number
  nightPayment19_23: number
  nightPayment23_07: number
  totalNightPayment: number
  totalPayment: number
}

export function computeEntryPreview(
  salaryScaleAmount: number | null,
  tenureBaseAmount: number | null,
  workdayHours: number | null,
  workedDays: number,
  nights: NightPreview[],
  academicMonthlyAmount: number | null = null,
  cla: ClaPreview | null = null
): EntryPreview {
  const hourlyRate =
    salaryScaleAmount && salaryScaleAmount > 0
      ? Math.round((salaryScaleAmount / MONTHLY_SALARY_HOURS_DIVISOR) * 1e6) / 1e6
      : 0
  // Antigüedad: mismo divisor y MISMAS horas trabajadas que el salario escala.
  const tenureHourlyRate =
    tenureBaseAmount && tenureBaseAmount > 0
      ? Math.round((tenureBaseAmount / MONTHLY_SALARY_HOURS_DIVISOR) * 1e6) / 1e6
      : 0
  // Categoría académica: mismo divisor y MISMAS horas trabajadas (concepto mensual).
  const academicHourlyRate =
    academicMonthlyAmount && academicMonthlyAmount > 0
      ? Math.round((academicMonthlyAmount / MONTHLY_SALARY_HOURS_DIVISOR) * 1e6) / 1e6
      : 0
  const workedHours = Math.round((workedDays || 0) * (workdayHours || 0) * 1e4) / 1e4
  const scaleSalaryPayment = Math.round(workedHours * hourlyRate * 100) / 100
  const tenurePayment = Math.round(workedHours * tenureHourlyRate * 100) / 100
  const academicPayment = Math.round(workedHours * academicHourlyRate * 100) / 100
  const nightPayment19_23 = Math.round(nights.reduce((acc, n) => acc + n.payment19_23, 0) * 100) / 100
  const nightPayment23_07 = Math.round(nights.reduce((acc, n) => acc + n.payment23_07, 0) * 100) / 100
  const totalNightPayment = Math.round((nightPayment19_23 + nightPayment23_07) * 100) / 100
  const claTotalPayment = cla ? cla.totalPayment : 0
  return {
    hourlyRate,
    workedHours,
    scaleSalaryPayment,
    tenureHourlyRate,
    tenurePayment,
    academicHourlyRate,
    academicPayment,
    claTotalPayment,
    nightPayment19_23,
    nightPayment23_07,
    totalNightPayment,
    totalPayment:
      Math.round(
        (scaleSalaryPayment + tenurePayment + academicPayment + totalNightPayment + claTotalPayment) * 100
      ) / 100,
  }
}


/** Etiqueta legible de la antigüedad del período: "X años, Y meses". */
export const formatTenureLabel = (
  years: number | null,
  months: number | null
): string => {
  if (years === null || years === undefined) return "—"
  const y = Number(years)
  const m = Number(months || 0)
  const yLabel = `${y} año${y === 1 ? "" : "s"}`
  if (m <= 0) return yLabel
  return `${yLabel}, ${m} mes${m === 1 ? "" : "es"}`
}

/** dd/mm/aaaa a partir de una fecha ISO. */
export const formatDateDMY = (value: string | null | undefined): string => {
  if (!value) return "—"
  const iso = String(value).slice(0, 10)
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return "—"
  return `${d}/${m}/${y}`
}

// ---------------------------------------------------------------------------
// Acceso a datos (RPC backend valida y recalcula antes de persistir)
// ---------------------------------------------------------------------------

export async function fetchPrenominaPeriods(entityId: string): Promise<PrenominaPeriod[]> {
  const { data, error } = await supabase
    .from("prenomina_periods")
    .select("id, organization_entity_id, period_year, period_month, status, created_at, closed_at")
    .eq("organization_entity_id", entityId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
  if (error) throw error
  return (data as PrenominaPeriod[]) || []
}

/** Total por período (para el histórico) sin traer todas las filas. */
export async function fetchPrenominaPeriodTotals(entityId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("prenomina_worker_entries")
    .select("period_id, total_payment")
    .eq("organization_entity_id", entityId)
  if (error) throw error
  const totals: Record<string, number> = {}
  ;((data as { period_id: string; total_payment: number }[]) || []).forEach((row) => {
    totals[row.period_id] = (totals[row.period_id] || 0) + Number(row.total_payment || 0)
  })
  return totals
}

export async function fetchPrenominaPeriod(periodId: string): Promise<PrenominaPeriod | null> {
  const { data, error } = await supabase
    .from("prenomina_periods")
    .select("id, organization_entity_id, period_year, period_month, status, created_at, closed_at")
    .eq("id", periodId)
    .maybeSingle()
  if (error) throw error
  return (data as PrenominaPeriod) || null
}

const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value)

const normalizeEntry = (row: any): PrenominaWorkerEntry => ({
  ...row,
  salary_group_sequence: toNumberOrNull(row.salary_group_sequence),
  salary_scale_amount: toNumberOrNull(row.salary_scale_amount),
  workday_hours: toNumberOrNull(row.workday_hours),
  worked_days: Number(row.worked_days || 0),
  worked_hours: Number(row.worked_hours || 0),
  hourly_scale_rate: Number(row.hourly_scale_rate || 0),
  scale_salary_payment: Number(row.scale_salary_payment || 0),
  tenure_years: toNumberOrNull(row.tenure_years),
  tenure_months: toNumberOrNull(row.tenure_months),
  tenure_total_months: toNumberOrNull(row.tenure_total_months),
  tenure_base_amount: toNumberOrNull(row.tenure_base_amount),
  tenure_hourly_rate: Number(row.tenure_hourly_rate || 0),
  tenure_payment: Number(row.tenure_payment || 0),
  has_masters_degree_snapshot: !!row.has_masters_degree_snapshot,
  has_doctorate_degree_snapshot: !!row.has_doctorate_degree_snapshot,
  academic_category:
    row.academic_category === "MASTER" || row.academic_category === "DOCTOR"
      ? row.academic_category
      : null,
  academic_status: row.academic_status || "OK",
  academic_monthly_amount: toNumberOrNull(row.academic_monthly_amount),
  academic_hourly_rate: Number(row.academic_hourly_rate || 0),
  academic_payment: Number(row.academic_payment || 0),
  cla_applied: !!row.cla_applied,
  cla_day_enabled: !!row.cla_day_enabled,
  cla_day_used: !!row.cla_day_used,
  cla_day_hourly_rate: toNumberOrNull(row.cla_day_hourly_rate),
  cla_day_minutes: Number(row.cla_day_minutes || 0),
  cla_day_hours: Number(row.cla_day_hours || 0),
  cla_day_payment: Number(row.cla_day_payment || 0),
  cla_night_enabled: !!row.cla_night_enabled,
  cla_night_used: !!row.cla_night_used,
  cla_night1_start: row.cla_night1_start ?? null,
  cla_night1_end: row.cla_night1_end ?? null,
  cla_night1_hourly_rate: toNumberOrNull(row.cla_night1_hourly_rate),
  cla_night1_minutes: Number(row.cla_night1_minutes || 0),
  cla_night1_hours: Number(row.cla_night1_hours || 0),
  cla_night1_payment: Number(row.cla_night1_payment || 0),
  cla_night2_start: row.cla_night2_start ?? null,
  cla_night2_end: row.cla_night2_end ?? null,
  cla_night2_hourly_rate: toNumberOrNull(row.cla_night2_hourly_rate),
  cla_night2_minutes: Number(row.cla_night2_minutes || 0),
  cla_night2_hours: Number(row.cla_night2_hours || 0),
  cla_night2_payment: Number(row.cla_night2_payment || 0),
  cla_total_payment: Number(row.cla_total_payment || 0),
  night_payment_19_23: Number(row.night_payment_19_23 || 0),
  night_payment_23_07: Number(row.night_payment_23_07 || 0),
  total_night_payment: Number(row.total_night_payment || 0),
  total_payment: Number(row.total_payment || 0),
})

const normalizeNight = (row: any): PrenominaNightEntry => ({
  ...row,
  nights_worked: Number(row.nights_worked || 0),
  hours_19_23_per_night: Number(row.hours_19_23_per_night || 0),
  hours_23_07_per_night: Number(row.hours_23_07_per_night || 0),
  payment_19_23: Number(row.payment_19_23 || 0),
  payment_23_07: Number(row.payment_23_07 || 0),
  total_payment: Number(row.total_payment || 0),
})

export async function fetchPrenominaEntries(periodId: string): Promise<PrenominaWorkerEntry[]> {
  const { data, error } = await supabase
    .from("prenomina_worker_entries")
    .select("*")
    .eq("period_id", periodId)
    .order("worker_name_snapshot")
  if (error) throw error
  return (((data as any[]) || [])).map(normalizeEntry)
}

export async function fetchPrenominaNights(
  entryIds: string[]
): Promise<Record<string, PrenominaNightEntry[]>> {
  if (entryIds.length === 0) return {}
  const { data, error } = await supabase
    .from("prenomina_night_entries")
    .select("*")
    .in("worker_entry_id", entryIds)
    .order("display_order")
    .order("created_at")
  if (error) throw error
  const grouped: Record<string, PrenominaNightEntry[]> = {}
    ;(((data as any[]) || [])).map(normalizeNight).forEach((night) => {
      grouped[night.worker_entry_id] = grouped[night.worker_entry_id] || []
      grouped[night.worker_entry_id].push(night)
    })
    return grouped
}

/**
 * Configuración CLA del Cargo actual del trabajador (Assignment vigente).
 * Autorizada con prenomina.view/manage, no requiere permisos de Plantilla.
 */
export async function fetchPrenominaClaConfig(entryId: string): Promise<PrenominaClaConfig> {
  const { data, error } = await supabase.rpc("prenomina_cla_config", { p_entry_id: entryId })
  if (error) throw error
  const raw = (data || {}) as Record<string, unknown>
  const num = (value: unknown): number | null =>
    value === null || value === undefined ? null : Number(value)
  return {
    applicable: !!raw.applicable,
    day_enabled: !!raw.day_enabled,
    day_rate: num(raw.day_rate),
    night_enabled: !!raw.night_enabled,
    night1_start: (raw.night1_start as string) ?? null,
    night1_end: (raw.night1_end as string) ?? null,
    night1_rate: num(raw.night1_rate),
    night2_start: (raw.night2_start as string) ?? null,
    night2_end: (raw.night2_end as string) ?? null,
    night2_rate: num(raw.night2_rate),
  }
}

export async function createPrenominaPeriod(
  entityId: string,
  year: number,
  month: number
): Promise<string> {
  const { data, error } = await supabase.rpc("prenomina_create_period", {
    p_entity_id: entityId,
    p_year: year,
    p_month: month,
  })
  if (error) throw error
  return data as string
}

export async function refreshPrenominaWorkers(periodId: string): Promise<number> {
  const { data, error } = await supabase.rpc("prenomina_refresh_workers", {
    p_period_id: periodId,
  })
  if (error) throw error
  return (data as number) || 0
}

export async function savePrenominaInputs(
  entryId: string,
  workedDays: number,
  salaryScaleAmount: number | null,
  workdayHours: number | null
): Promise<void> {
  const { error } = await supabase.rpc("prenomina_upsert_inputs", {
    p_entry_id: entryId,
    p_worked_days: workedDays,
    p_salary_scale_amount: salaryScaleAmount,
    p_workday_hours: workdayHours,
  })
  if (error) throw error
}

export async function savePrenominaCla(
  entryId: string,
  applied: boolean,
  dayUsed: boolean,
  dayMinutes: number,
  nightUsed: boolean,
  night1Minutes: number,
  night2Minutes: number
): Promise<void> {
  const { error } = await supabase.rpc("prenomina_save_cla", {
    p_entry_id: entryId,
    p_applied: applied,
    p_day_used: dayUsed,
    p_day_minutes: dayMinutes,
    p_night_used: nightUsed,
    p_night1_minutes: night1Minutes,
    p_night2_minutes: night2Minutes,
  })
  if (error) throw error
}

export async function savePrenominaNight(
  entryId: string,
  nightId: string | null,
  start: string,
  end: string,
  nights: number
): Promise<string> {
  const { data, error } = await supabase.rpc("prenomina_save_night", {
    p_entry_id: entryId,
    p_night_id: nightId,
    p_start: start,
    p_end: end,
    p_nights: nights,
  })
  if (error) throw error
  return data as string
}

export async function deletePrenominaNight(nightId: string): Promise<void> {
  const { error } = await supabase.rpc("prenomina_delete_night", { p_night_id: nightId })
  if (error) throw error
}

export async function closePrenominaPeriod(periodId: string): Promise<void> {
  const { error } = await supabase.rpc("prenomina_close_period", { p_period_id: periodId })
  if (error) throw error
}

export async function reopenPrenominaPeriod(periodId: string): Promise<void> {
  const { error } = await supabase.rpc("prenomina_reopen_period", { p_period_id: periodId })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Excel (.xlsx) — reutiliza ExcelJS como el resto de exportaciones del proyecto
// ---------------------------------------------------------------------------

export const PRENOMINA_EXPORT_HEADERS = [
  "No.",
  "Trabajador",
  "Identificación",
  "Área",
  "Cargo",
  "Puesto",
  "Grupo Escala",
  "Salario Escala",
  "Tarifa por Hora",
  "Días Trabajados",
  "Horas Trabajadas",
  "Pago Salario Escala",
  "Fecha de Incorporación",
  "Antigüedad",
  "Tramo de Antigüedad",
  "Importe Base Antigüedad",
  "Tarifa Antigüedad/Hora",
  "Pago Antigüedad",
  "Nocturnidad 19–23",
  "Nocturnidad 23–07",
  "Total Nocturnidad",
  "CLA",
  "Categoría académica",
  "Pago categoría académica",
  "Total Trabajador",
] as const

const COLUMN_WIDTHS = [
  6, 32, 18, 22, 26, 26, 14, 14, 14, 14, 14, 18, 20, 18, 20, 20, 18, 16, 16, 16, 16, 14, 18, 18, 16,
]

/** Números monetarios/numerados: índices (1-based) de columnas numéricas del Excel. */
const NUMERIC_COLUMNS = [8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 24, 25]

export function buildPrenominaFileName(entityName: string, year: number, month: number): string {
  const safeName =
    (entityName || "Entidad")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || "Entidad"
  const monthName = MONTH_LABELS[month - 1] || String(month)
  return `Prenomina_${safeName}_${monthName}_${year}.xlsx`
}

export interface PrenominaExportMeta {
  entityName: string
  year: number
  month: number
  status: string
  generatedAt: Date
}

export async function buildPrenominaWorkbookBlob(
  entries: PrenominaWorkerEntry[],
  nightsByEntry: Record<string, PrenominaNightEntry[]>,
  meta: PrenominaExportMeta
): Promise<Blob> {
  const mod: any = await import("exceljs")
  const ExcelJS = mod?.default ?? mod

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "SiteCorp"
  workbook.created = meta.generatedAt

  const sheet = workbook.addWorksheet("Prenómina")
    sheet.columns = COLUMN_WIDTHS.map((width, index) => ({ width, key: `c${index}` }))
  
    const monthName = MONTH_LABELS[meta.month - 1] || String(meta.month)
  const dateLabel = meta.generatedAt.toLocaleDateString("es-CU")

  // Metadatos de cabecera
  const metaRows: [string, string][] = [
    ["PRENÓMINA", ""],
    ["Entidad:", meta.entityName],
    ["Mes:", monthName],
    ["Año:", String(meta.year)],
    ["Fecha de generación:", dateLabel],
    ["Estado:", PRENOMINA_STATUS_LABELS[meta.status] || meta.status],
  ]
  metaRows.forEach(([label, value], index) => {
    const row = sheet.addRow([label, value])
    if (index === 0) row.font = { bold: true, size: 14 }
  })
  sheet.addRow([])

  // Encabezados
  const headerRow = sheet.addRow([...PRENOMINA_EXPORT_HEADERS])
  headerRow.font = { bold: true }
    headerRow.alignment = { vertical: "middle" }

  let totalScale = 0
  let totalTenure = 0
  let totalAcademic = 0
  let total19 = 0
  let total23 = 0
  let totalNight = 0
  let totalCla = 0
  let totalAll = 0

  entries.forEach((entry, index) => {
    const nights = nightsByEntry[entry.id] || []
    const p19 = nights.reduce((acc, n) => acc + Number(n.payment_19_23 || 0), 0)
    const p23 = nights.reduce((acc, n) => acc + Number(n.payment_23_07 || 0), 0)
    const tenureLabel =
      entry.tenure_status === "NO_START_DATE"
        ? "Sin fecha de incorporación"
        : formatTenureLabel(entry.tenure_years, entry.tenure_months)
    const bandLabel =
      entry.tenure_status === "NO_BAND"
        ? "Sin tramo de antigüedad configurado"
        : entry.tenure_band_label || "—"
    const row = sheet.addRow([
      index + 1,
      entry.worker_name_snapshot,
      entry.identification_snapshot,
      entry.area_name_snapshot,
      entry.job_name_snapshot,
      entry.position_name_snapshot,
      entry.salary_group_sequence,
      entry.salary_scale_amount,
      entry.hourly_scale_rate,
      entry.worked_days,
      entry.worked_hours,
      entry.scale_salary_payment,
      formatDateDMY(entry.employment_start_date_snapshot),
      tenureLabel,
      bandLabel,
      entry.tenure_base_amount,
      entry.tenure_hourly_rate,
      entry.tenure_payment,
      p19,
      p23,
      entry.total_night_payment,
      entry.cla_total_payment,
      academicCategoryLabel(entry.academic_category),
      entry.academic_payment,
      entry.total_payment,
    ])
    // Identificación como texto (nunca notación científica)
    const idCell = row.getCell(3)
    idCell.numFmt = "@"
    if (entry.identification_snapshot !== null && entry.identification_snapshot !== undefined) {
      idCell.value = String(entry.identification_snapshot)
    }
    NUMERIC_COLUMNS.forEach((col) => {
      row.getCell(col).numFmt = "#,##0.00"
    })

    totalScale += Number(entry.scale_salary_payment || 0)
    totalTenure += Number(entry.tenure_payment || 0)
    totalAcademic += Number(entry.academic_payment || 0)
    total19 += p19
    total23 += p23
    totalNight += Number(entry.total_night_payment || 0)
    totalCla += Number(entry.cla_total_payment || 0)
    totalAll += Number(entry.total_payment || 0)
  })

  // Fila TOTAL GENERAL
  const totalRow = sheet.addRow([
    "",
    "TOTAL GENERAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    Math.round(totalScale * 100) / 100,
    "",
    "",
    "",
    "",
    "",
    Math.round(totalTenure * 100) / 100,
    Math.round(total19 * 100) / 100,
    Math.round(total23 * 100) / 100,
    Math.round(totalNight * 100) / 100,
    Math.round(totalCla * 100) / 100,
    "",
    Math.round(totalAcademic * 100) / 100,
    Math.round(totalAll * 100) / 100,
  ])
  totalRow.font = { bold: true }
  NUMERIC_COLUMNS.forEach((col) => {
    totalRow.getCell(col).numFmt = "#,##0.00"
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

export function savePrenominaExcelBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}