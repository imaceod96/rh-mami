import * as React from "react"
import { cn } from "@/lib/utils"
import {
  componentTypeLabel,
  formatContractMoney,
  type ContractCompensationComponent,
} from "@/lib/contract-conditions"

interface ContractRetributionSummaryProps {
  /** Salario de escala formalizado (snapshot del contrato) */
  salaryAmount: number | null
  currency?: string | null
  /** Total contractual calculado por el backend */
  totalCompensation: number | null
  components: ContractCompensationComponent[]
  className?: string
}

/**
 * Fase 11A.5 — Retribución formalizada en un contrato (snapshot histórico).
 *
 * Nunca se recalcula con la escala actual: es lo que se firmó.
 */
export const ContractRetributionSummary: React.FC<ContractRetributionSummaryProps> = ({
  salaryAmount,
  currency,
  totalCompensation,
  components,
  className,
}) => {
  if (salaryAmount === null) {
    return (
      <p className={cn("text-sm italic text-muted-foreground", className)}>
        Sin información histórica: no fue posible determinar de forma fiable la retribución
        formalizada de este contrato y no se ha registrado ningún valor inventado.
      </p>
    )
  }

  const byType = (type: string) => components.filter((component) => component.component_type === type)
  const types = ["ADDITIONAL_PAYMENT", "ABNORMAL_CONDITIONS", "OTHER"]

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">Salario de escala</span>
        <span className="text-sm font-medium text-ink">
          {formatContractMoney(salaryAmount, currency)}
        </span>
      </div>

      {types.map((type) => {
        const rows = byType(type)
        return (
          <div key={type} className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">{componentTypeLabel(type)}</span>
            {rows.length === 0 ? (
              <span className="text-sm text-muted-foreground">Sin conceptos</span>
            ) : (
              <span className="flex flex-col items-end gap-0.5 text-right">
                {rows.map((row) => (
                  <span key={row.id} className="text-sm text-ink">
                    {row.description}:{" "}
                    <span className="font-medium">{formatContractMoney(row.amount, currency)}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2">
        <span className="text-sm font-semibold text-ink">Total contractual</span>
        <span className="text-base font-semibold text-ink">
          {formatContractMoney(totalCompensation, currency)}
        </span>
      </div>
    </div>
  )
}

export default ContractRetributionSummary
