-- ============================================================================
-- CLA — Condiciones Laborales Anormales (rediseño completo)
-- ----------------------------------------------------------------------------
-- CLA NO es Nocturnidad. Son conceptos salariales distintos y coexisten:
--   * Nocturnidad  → tabla prenomina_night_entries (19:00–23:00 / 23:00–07:00), sin cambios.
--   * CLA          → tarifas por hora configuradas en el CARGO + minutos capturados
--                    por trabajador en la Prenómina. Concepto independiente.
--
-- La configuración CLA pertenece al CARGO y reutiliza la opción existente
-- organization_jobs.has_abnormal_conditions (no se crea un sistema CLA paralelo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Configuración CLA en el Cargo
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_jobs
  ADD COLUMN IF NOT EXISTS cla_day_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cla_day_hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS cla_night_enabled boolean NOT NULL DEFAULT false;

-- La antigua constraint ligaba has_abnormal_conditions con un importe único
-- (abnormal_conditions_amount). El nuevo modelo usa tarifas por hora, así que se
-- sustituye por una validación no negativa; la columna histórica se conserva.
ALTER TABLE public.organization_jobs DROP CONSTRAINT IF EXISTS organization_jobs_abnormal_conditions_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_jobs_abnormal_conditions_amount_check' AND conrelid = 'public.organization_jobs'::regclass) THEN
    ALTER TABLE public.organization_jobs ADD CONSTRAINT organization_jobs_abnormal_conditions_amount_check
      CHECK (abnormal_conditions_amount IS NULL OR abnormal_conditions_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_jobs_cla_day_rate_check' AND conrelid = 'public.organization_jobs'::regclass) THEN
    ALTER TABLE public.organization_jobs ADD CONSTRAINT organization_jobs_cla_day_rate_check
      CHECK (NOT cla_day_enabled OR (cla_day_hourly_rate IS NOT NULL AND cla_day_hourly_rate >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_jobs_cla_day_rate_nonneg_check' AND conrelid = 'public.organization_jobs'::regclass) THEN
    ALTER TABLE public.organization_jobs ADD CONSTRAINT organization_jobs_cla_day_rate_nonneg_check
      CHECK (cla_day_hourly_rate IS NULL OR cla_day_hourly_rate >= 0);
  END IF;
END $$;

-- Dos tramos nocturnos configurables por Cargo (horarios + tarifa independiente).
-- Los horarios pueden cruzar medianoche (p. ej. 23:00 → 07:00): no hay CHECK end > start.
CREATE TABLE IF NOT EXISTS public.organization_job_cla_night_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_job_id uuid NOT NULL REFERENCES public.organization_jobs(id) ON DELETE CASCADE,
  organization_entity_id uuid NOT NULL REFERENCES public.organization_entities(id) ON DELETE CASCADE,
  segment_order integer NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  hourly_rate numeric(12,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organization_job_cla_night_segments_order_check CHECK (segment_order IN (1,2)),
  CONSTRAINT organization_job_cla_night_segments_rate_check CHECK (hourly_rate >= 0),
  CONSTRAINT organization_job_cla_night_segments_unique UNIQUE (organization_job_id, segment_order)
);

ALTER TABLE public.organization_job_cla_night_segments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_job_cla_night_segments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_job_cla_night_segments TO service_role;

-- RLS: reutiliza los permisos de Plantilla/Cargos (staffing.view / staffing.manage).
CREATE POLICY "org_job_cla_night_segments_select" ON public.organization_job_cla_night_segments
FOR SELECT TO authenticated
USING (public.can_access_entity(organization_entity_id, 'staffing.view') OR public.can_access_entity(organization_entity_id, 'staffing.manage'));

CREATE POLICY "org_job_cla_night_segments_insert" ON public.organization_job_cla_night_segments
FOR INSERT TO authenticated
WITH CHECK (public.can_access_entity(organization_entity_id, 'staffing.manage'));

CREATE POLICY "org_job_cla_night_segments_update" ON public.organization_job_cla_night_segments
FOR UPDATE TO authenticated
USING (public.can_access_entity(organization_entity_id, 'staffing.manage'))
WITH CHECK (public.can_access_entity(organization_entity_id, 'staffing.manage'));

CREATE POLICY "org_job_cla_night_segments_delete" ON public.organization_job_cla_night_segments
FOR DELETE TO authenticated
USING (public.can_access_entity(organization_entity_id, 'staffing.manage'));

DROP TRIGGER IF EXISTS organization_job_cla_night_segments_updated_at ON public.organization_job_cla_night_segments;
CREATE TRIGGER organization_job_cla_night_segments_updated_at
BEFORE UPDATE ON public.organization_job_cla_night_segments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Snapshot CLA por trabajador dentro del período (prenomina_worker_entries)
-- ---------------------------------------------------------------------------
-- Cada registro conserva la configuración del Cargo (flag, tarifas y horarios) y
-- los minutos capturados, las horas calculadas y el importe. Una Prenómina
-- cerrada nunca se recalcula: conserva su snapshot aunque el Cargo cambie.
ALTER TABLE public.prenomina_worker_entries
  ADD COLUMN IF NOT EXISTS cla_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cla_day_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cla_day_hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS cla_day_minutes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_day_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_day_payment numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_night_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cla_night1_start time without time zone,
  ADD COLUMN IF NOT EXISTS cla_night1_end time without time zone,
  ADD COLUMN IF NOT EXISTS cla_night1_hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS cla_night1_minutes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_night1_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_night1_payment numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_night2_start time without time zone,
  ADD COLUMN IF NOT EXISTS cla_night2_end time without time zone,
  ADD COLUMN IF NOT EXISTS cla_night2_hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS cla_night2_minutes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_night2_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_night2_payment numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cla_total_payment numeric NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Funciones
-- ---------------------------------------------------------------------------
-- * prenomina_recalc_entry   → calcula horas = minutos/60 e importe = horas × tarifa
--                              por cada tramo; cla_total = suma; se añade al total.
-- * prenomina_save_cla       → RPC de captura (BORRADOR + prenomina.manage):
--                              guarda minutos y congela tarifas/horarios del Cargo.
-- * prenomina_refresh_workers→ refresca la configuración CLA del Cargo en BORRADOR.
-- * prenomina_close_period   → bloquea el cierre si hay CLA aplicada con tarifas incompletas.
-- * entity_staffing_export   → la columna CLA del Anexo 14 queda vacía (no hay
--                              importe fijo representable sin minutos de un período).
--
-- Ver los cuerpos completos en la base de datos (aplicados vía execute SQL).
