import { useQuery, type QueryClient } from "@tanstack/react-query"
import {
  ensureWorkerVacationAccruals,
  fetchEntityVacationOverview,
  fetchWorkerVacationMovements,
  fetchWorkerVacationPeriods,
  fetchWorkerVacationSummary,
  type VacationMovement,
  type VacationOverviewRow,
  type VacationPeriod,
  type VacationSummary,
} from "@/lib/vacations"

/**
 * Vacaciones — queries de React Query (Fase 18).
 *
 * Toda query está SCOPEADA por entidad o por trabajador, de modo que cambiar de
 * entidad nunca reutiliza cache de otra (§86/§88). Abrir el módulo/ficha ejecuta el
 * catch-up idempotente del backend: el saldo consolidado siempre refleja meses cerrados.
 */

export const vacationOverviewQueryKey = (entityId: string | null | undefined) =>
  ["vacations", "overview", entityId ?? "none"] as const

export const workerVacationQueryKey = (workerId: string | null | undefined) =>
  ["vacations", "worker", workerId ?? "none"] as const

export function useEntityVacationOverview(entityId: string | null | undefined, enabled = true) {
  return useQuery<VacationOverviewRow[]>({
    queryKey: vacationOverviewQueryKey(entityId),
    queryFn: () => fetchEntityVacationOverview(entityId as string),
    enabled: !!entityId && enabled,
    staleTime: 0,
    refetchOnMount: "always",
  })
}

export interface WorkerVacationData {
  summary: VacationSummary
  periods: VacationPeriod[]
  movements: VacationMovement[]
}

export function useWorkerVacation(workerId: string | null | undefined, enabled = true) {
  return useQuery<WorkerVacationData>({
    queryKey: workerVacationQueryKey(workerId),
    queryFn: async () => {
      const id = workerId as string
      // Mantenimiento idempotente del devengo antes de leer el saldo consolidado.
      await ensureWorkerVacationAccruals(id)
      const [summary, periods, movements] = await Promise.all([
        fetchWorkerVacationSummary(id),
        fetchWorkerVacationPeriods(id),
        fetchWorkerVacationMovements(id),
      ])
      return { summary, periods, movements }
    },
    enabled: !!workerId && enabled,
    staleTime: 0,
    refetchOnMount: "always",
  })
}

/**
 * Invalida los datos derivados de vacaciones tras registrar/cancelar/ajustar/inicializar.
 * Invalida por prefijo para cubrir cualquier entidad/trabajador afectado, y también el
 * resumen de entidad (Dashboard) que reutiliza el mismo motor (§87).
 */
export function invalidateVacationData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["vacations"] })
  queryClient.invalidateQueries({ queryKey: ["entity-summary"] })
}
