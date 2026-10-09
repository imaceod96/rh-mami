/**
 * Vacaciones — Módulo de COMPATIBILIDAD.
 *
 * El código del dominio se ha trasladado a la estructura DDD:
 *   src/domains/vacations-licenses/vacations/
 *     · domain/entities.ts                            → estados, contratos y etiquetas
 *     · domain/rules.ts                               → constantes y reglas puras
 *     · application/vacations.queries.ts              → casos de uso y claves de caché
 *     · infrastructure/vacations.repository.ts        → RPC y consultas Supabase
 *
 * Este archivo conserva EXACTAMENTE las 26 exportaciones públicas originales
 * (mismos nombres y firmas) para que cualquier consumidor que todavía importe desde
 * "@/lib/vacations" siga funcionando sin cambios.
 *
 * Es únicamente una reexportación: no debe contener lógica. Cualquier ajuste de
 * comportamiento pertenece al dominio, no a este módulo.
 */

/* Tipos, estados y etiquetas */
export type {
  VacationStatus,
  VacationPeriodStatus,
  VacationMovementType,
  VacationSummary,
  VacationOverviewRow,
  VacationPeriod,
  VacationMovement,
} from "@/domains/vacations-licenses/vacations"

export {
  VACATION_STATUS_LABELS,
  VACATION_MOVEMENT_LABELS,
  VACATION_PERIOD_STATUS_LABELS,
} from "@/domains/vacations-licenses/vacations"

/* Constantes y reglas puras */
export {
  VACATION_ANNUAL_DAYS,
  VACATION_MAX_ACCRUAL_DAYS,
  VACATION_MIN_NATURAL_DAYS,
  VACATION_MAX_NATURAL_DAYS,
  formatVacationDays,
  previewVacationConsumption,
  vacationWorkspaceAlertsEnabled,
} from "@/domains/vacations-licenses/vacations"

/* Operaciones de datos (RPC y consultas) */
export {
  fetchEntityVacationOverview,
  ensureWorkerVacationAccruals,
  fetchWorkerVacationSummary,
  fetchWorkerVacationPeriods,
  fetchWorkerVacationMovements,
  registerWorkerVacation,
  cancelWorkerVacation,
  adjustWorkerVacationBalance,
  setWorkerVacationOpeningBalance,
} from "@/domains/vacations-licenses/vacations"
