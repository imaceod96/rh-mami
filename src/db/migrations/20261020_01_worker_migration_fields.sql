-- ============================================================================
-- FASE — CAMPOS DE MIGRACIÓN EN TRABAJADORES
-- Añade campos para distinguir el origen de incorporación y habilitar
-- la migración de plantilla existente.
--
-- origin: HIRING | MIGRATION
-- migrated_at: marca cuándo se realizó la migración (solo para MIGRATION)
-- migration_batch_id: idempotencia por lote (evita doble creación por retry)
-- ============================================================================

-- 1. Añadir columna `origin` para distinguir el origen de incorporación.
--    HIRING = contratación normal (candidato → worker)
--    MIGRATION = migración de trabajador existente
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS origin text COLLATE "pg_catalog"."default"
DEFAULT 'HIRING'
CHECK (origin IN ('HIRING', 'MIGRATION'));

-- 2. Añadir columna `migrated_at` para registrar cuándo se migró el trabajador.
--    Solo tiene valor cuando origin = 'MIGRATION'.
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS migrated_at timestamp with time zone;

-- 3. Añadir columna `migration_batch_id` para idempotencia.
--    Mismo lote = misma importación. Si el navegador retry, el backend ignora.
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS migration_batch_id text COLLATE "pg_catalog"."default";

-- 4. Índice para búsquedas por origen (útil para reportes y filtros).
CREATE INDEX IF NOT EXISTS idx_workers_origin ON public.workers (origin);
CREATE INDEX IF NOT EXISTS idx_workers_migration_batch ON public.workers (migration_batch_id);

-- 5. Comentario documentado.
COMMENT ON COLUMN public.workers.origin IS 'Origen de incorporación: HIRING (contratación normal) o MIGRATION (migración de plantilla existente)';
COMMENT ON COLUMN public.workers.migrated_at IS 'Marca temporal de cuándo se realizó la migración. Solo tiene valor cuando origin = MIGRATION';
COMMENT ON COLUMN public.workers.migration_batch_id IS 'Identificador de lote para idempotencia: evita que un mismo archivo Excel se procese dos veces por retry o timeout';