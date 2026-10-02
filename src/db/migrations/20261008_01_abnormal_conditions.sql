-- ============================================================================
-- FASE — CONDICIONES ANORMALES EN CARGOS (FASE 1-4)
-- Migración incremental idempotente.
--
-- Añade dos campos a organization_jobs:
--   - has_abnormal_conditions: boolean (default false)
--   - abnormal_conditions_amount: numeric(12,2) nullable
--
-- Reglas de integridad:
--   - Si has_abnormal_conditions = false → abnormal_conditions_amount = NULL
--   - Si has_abnormal_conditions = true  → abnormal_conditions_amount >= 0
-- ============================================================================

-- 1. Añadir columnas si no existen.
ALTER TABLE public.organization_jobs
ADD COLUMN IF NOT EXISTS has_abnormal_conditions boolean DEFAULT false NOT NULL;

ALTER TABLE public.organization_jobs
ADD COLUMN IF NOT EXISTS abnormal_conditions_amount numeric(12,2);

-- 2. Restricción: coherencia entre checkbox e importe.
ALTER TABLE public.organization_jobs
DROP CONSTRAINT IF EXISTS organization_jobs_abnormal_conditions_check;

ALTER TABLE public.organization_jobs
ADD CONSTRAINT organization_jobs_abnormal_conditions_check
CHECK (
    (has_abnormal_conditions = false AND abnormal_conditions_amount IS NULL)
    OR
    (has_abnormal_conditions = true AND abnormal_conditions_amount IS NOT NULL AND abnormal_conditions_amount >= 0)
);

-- 3. Índice para consultas frecuentes por entidad + flag.
CREATE INDEX IF NOT EXISTS idx_organization_jobs_abnormal_conditions
ON public.organization_jobs (organization_entity_id, has_abnormal_conditions)
WHERE has_abnormal_conditions = true;

-- 4. Comentarios para documentación.
COMMENT ON COLUMN public.organization_jobs.has_abnormal_conditions IS 'Indica si el cargo tiene condiciones anormales asociadas';
COMMENT ON COLUMN public.organization_jobs.abnormal_conditions_amount IS 'Importe monetario asociado a las condiciones anormales del cargo (NULL si no aplica)';