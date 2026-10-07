import { supabase } from "@/lib/supabase"

/**
 * Pago por categoría académica (Máster / Doctor).
 *
 * FUENTE ÚNICA DE VERDAD (servidor):
 *   public.resolve_academic_category_payment(p_entity_id, p_worker_id)
 *   public.resolve_academic_category_payment_for_flags(p_entity_id, masters, doctorate)
 *
 * Regla salarial (Doctor tiene prioridad; NUNCA se suman ambos):
 *   1. Doctor = true                        → categoría DOCTOR (importe Doctor)
 *   2. Doctor = false y Máster = true       → categoría MASTER (importe Máster)
 *   3. Doctor = false y Máster = false      → sin categoría (importe 0)
 *
 * Los dos indicadores académicos se conservan siempre; sólo la resolución
 * salarial usa la categoría superior (Doctor > Máster).
 *
 * Aislamiento entre regímenes (igual que la escala salarial):
 *   PRESUPUESTADA → configuración GLOBAL (scope_type = 'PRESUPUESTADA_GLOBAL')
 *   EMPRESARIAL   → configuración propia de la entidad (scope_type = 'EMPRESARIAL_ENTITY')
 *   Sin fallback EMPRESARIAL → PRESUPUESTADA: si la entidad no tiene configurado
 *   su importe, el resultado es NO CONFIGURADO (amount = null, configured = false).
 *
 * Este módulo NO interviene todavía en Prenómina ni en el Anexo 14: sólo modela
 * y resuelve los datos para fases posteriores.
 */

export type AcademicCategory = "MASTER" | "DOCTOR"

/** Catálogo de categorías académicas (orden de prioridad salarial descendente). */
export const ACADEMIC_CATEGORIES: { value: AcademicCategory; label: string }[] = [
  { value: "DOCTOR", label: "Doctor" },
  { value: "MASTER", label: "Máster" },
]

export interface AcademicCategoryPaymentResolution {
  /** Categoría académica efectiva (DOCTOR tiene prioridad sobre MASTER). */
  category: AcademicCategory | null
  /** Importe aplicable. `null` = no configurado. `0` = configurado sin pago. */
  amount: number | null
  /** true si existe configuración explícita para la categoría efectiva. */
  configured: boolean
  /** Régimen de la entidad (PRESUPUESTADA | EMPRESARIAL). */
  regime: string | null
  /** Alcance de la configuración aplicada. */
  scope: "PRESUPUESTADA_GLOBAL" | "EMPRESARIAL_ENTITY" | null
}

export interface AcademicCategoryPaymentConfig {
  entityId: string
  scope: "PRESUPUESTADA_GLOBAL" | "EMPRESARIAL_ENTITY"
  regime: string | null
  currencyCode: string
  masterAmount: number | null
  doctorAmount: number | null
  masterConfigured: boolean
  doctorConfigured: boolean
  configured: boolean
  canView: boolean
  canManage: boolean
}

/**
 * Categoría académica efectiva según los indicadores de la persona.
 * Máster y Doctor NO son excluyentes: ambos pueden estar marcados.
 */
export function resolveAcademicCategory(
  hasMastersDegree: boolean | null | undefined,
  hasDoctorateDegree: boolean | null | undefined
): AcademicCategory | null {
  if (hasDoctorateDegree) return "DOCTOR"
  if (hasMastersDegree) return "MASTER"
  return null
}

/** Etiqueta legible de una categoría académica. */
export function academicCategoryLabel(category: AcademicCategory | null): string {
  if (category === "DOCTOR") return "Doctor"
  if (category === "MASTER") return "Máster"
  return "Sin categoría académica"
}

/** Formato monetario único para importes en CUP. */
export function formatAcademicAmount(amount: number | null, currencyCode = "CUP"): string {
  if (amount === null || amount === undefined) return "No configurado"
  return `${amount.toLocaleString("es-CU", { minimumFractionDigits: 2 })} ${currencyCode}`
}

/** Resolución central del pago académico de un trabajador (RPC del servidor). */
export async function resolveAcademicCategoryPayment(
  entityId: string,
  workerId: string
): Promise<AcademicCategoryPaymentResolution> {
  const { data, error } = await supabase.rpc("resolve_academic_category_payment", {
    p_entity_id: entityId,
    p_worker_id: workerId,
  })
  if (error) throw error
  return mapResolution(data)
}

/** Resolución a partir de los indicadores (sin trabajador persistido). */
export async function resolveAcademicCategoryPaymentForFlags(
  entityId: string,
  hasMastersDegree: boolean | null | undefined,
  hasDoctorateDegree: boolean | null | undefined
): Promise<AcademicCategoryPaymentResolution> {
  const { data, error } = await supabase.rpc("resolve_academic_category_payment_for_flags", {
    p_entity_id: entityId,
    p_has_masters: hasMastersDegree ?? false,
    p_has_doctorate: hasDoctorateDegree ?? false,
  })
  if (error) throw error
  return mapResolution(data)
}

function mapResolution(data: unknown): AcademicCategoryPaymentResolution {
  const row = (data || {}) as Record<string, unknown>
  const rawCategory = row.category
  const rawAmount = row.amount
  const rawScope = row.scope
  return {
    category:
      rawCategory === "DOCTOR" || rawCategory === "MASTER"
        ? (rawCategory as AcademicCategory)
        : null,
    amount: rawAmount === null || rawAmount === undefined ? null : Number(rawAmount),
    configured: !!row.configured,
    regime: (row.regime as string | null) ?? null,
    scope:
      rawScope === "PRESUPUESTADA_GLOBAL" || rawScope === "EMPRESARIAL_ENTITY"
        ? (rawScope as AcademicCategoryPaymentResolution["scope"])
        : null,
  }
}

/** Configuración vigente de pago por categoría académica para una entidad. */
export async function fetchAcademicCategoryPaymentConfig(
  entityId: string
): Promise<AcademicCategoryPaymentConfig> {
  const { data, error } = await supabase.rpc("get_academic_category_payment_config", {
    p_entity_id: entityId,
  })
  if (error) throw error
  const row = (data || {}) as Record<string, any>
  return {
    entityId,
    scope:
      row.scope === "PRESUPUESTADA_GLOBAL" ? "PRESUPUESTADA_GLOBAL" : "EMPRESARIAL_ENTITY",
    regime: (row.regime as string | null) ?? null,
    currencyCode: (row.currency_code as string) || "CUP",
    masterAmount: row.master_amount === null ? null : Number(row.master_amount),
    doctorAmount: row.doctor_amount === null ? null : Number(row.doctor_amount),
    masterConfigured: !!row.master_configured,
    doctorConfigured: !!row.doctor_configured,
    configured: !!row.configured,
    canView: !!row.can_view,
    canManage: !!row.can_manage,
  }
}

/**
 * Guarda el importe de una categoría académica.
 * `null` deja la categoría explícitamente NO CONFIGURADA; `0` es un valor válido
 * (configurado sin pago) y nunca se convierte en NULL.
 */
export async function saveAcademicCategoryPayment(
  entityId: string,
  category: AcademicCategory,
  amount: number | null
): Promise<void> {
  const { error } = await supabase.rpc("save_academic_category_payment", {
    p_entity_id: entityId,
    p_category: category,
    p_amount: amount,
  })
  if (error) throw error
}