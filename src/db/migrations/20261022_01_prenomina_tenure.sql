-- ============================================================================
-- PRENÓMINA FASE 2 — PAGO POR ANTIGÜEDAD
-- Migración incremental idempotente.
--
-- Añade el concepto ANTIGÜEDAD a la prenómina mensual:
--   PAGO SALARIO ESCALA + PAGO ANTIGÜEDAD + NOCTURNIDAD = TOTAL TRABAJADOR
--
-- Reutiliza la implementación existente de antigüedad:
--   - Fuente canónica: workers.employment_start_date (fallback histórico hire_date).
--   - Escala: public.tenure_payment_scales (NO se crea una segunda escala).
--   - Resolver: public.resolve_tenure_payment_for_worker (ampliado con fecha de referencia).
--
-- La antigüedad se evalúa SIEMPRE al ÚLTIMO DÍA DEL MES del período, nunca a hoy.
-- NO se implementa CLA en esta fase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Resolver de antigüedad con fecha de referencia.
--    Se elimina la firma anterior (2 argumentos) y se recrea con 3 argumentos
--    (el tercero con valor por defecto) más columnas de detalle.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_tenure_payment_for_worker(uuid, uuid);

CREATE FUNCTION public.resolve_tenure_payment_for_worker(
    p_entity_id       uuid,
    p_worker_id       uuid,
    p_reference_date  date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    amount             numeric(12,2),
    from_months        numeric(10,2),
    to_months          numeric(10,2),
    years              integer,
    months             integer,
    human_description  text,
    start_date         date,
    total_months       numeric(10,2),
    band_id            uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_start_date date;
    v_ref        date := COALESCE(p_reference_date, CURRENT_DATE);
    v_months     numeric(10,2);
    v_years      integer;
    v_months_int integer;
    v_desc       text;
BEGIN
    IF NOT public.can_access_entity(p_entity_id, 'workers.view')
       AND NOT public.can_access_entity(p_entity_id, 'workers.manage') THEN
        RAISE EXCEPTION 'No tiene permiso para consultar la antigüedad de este trabajador';
    END IF;

    -- Fuente canónica de incorporación laboral (fallback histórico a hire_date).
    SELECT COALESCE(w.employment_start_date, w.hire_date) INTO v_start_date
    FROM public.workers w
    WHERE w.id = p_worker_id
      AND w.organization_entity_id = p_entity_id;

    IF v_start_date IS NULL OR v_start_date > v_ref THEN
        RETURN QUERY SELECT NULL::numeric(12,2), NULL::numeric(10,2), NULL::numeric(10,2),
                             NULL::integer, NULL::integer, NULL::text, v_start_date,
                             NULL::numeric(10,2), NULL::uuid;
        RETURN;
    END IF;

    -- Antigüedad de calendario real (año/mes/día), evaluada en la fecha de referencia.
    v_years      := date_part('year', age(v_ref, v_start_date));
    v_months_int := date_part('month', age(v_ref, v_start_date));
    v_months     := (v_years * 12 + v_months_int)::numeric(10,2);

    IF v_years = 0 AND v_months_int = 0 THEN
        v_desc := 'Menos de 1 mes';
    ELSIF v_years = 0 THEN
        v_desc := format('%s mes(es)', v_months_int);
    ELSIF v_months_int = 0 THEN
        v_desc := format('%s año(s)', v_years);
    ELSE
        v_desc := format('%s año(s) y %s mes(es)', v_years, v_months_int);
    END IF;

    RETURN QUERY
    SELECT
        t.amount,
        t.from_months,
        t.to_months,
        v_years,
        v_months_int,
        v_desc,
        v_start_date,
        v_months,
        t.id
    FROM public.tenure_payment_scales t
    WHERE t.organization_entity_id = p_entity_id
      AND t.is_active = true
      AND v_months >= t.from_months
      AND (t.to_months IS NULL OR v_months < t.to_months)
    ORDER BY t.from_months DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tenure_payment_for_worker(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tenure_payment_for_worker(uuid, uuid, date) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Sincronización de la fecha canónica de incorporación laboral.
--    El formulario de trabajador edita hire_date; la fecha canónica
--    employment_start_date debe permanecer coherente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workers_sync_employment_start_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF new.employment_start_date IS NULL
       OR (tg_op = 'UPDATE'
           AND new.hire_date IS DISTINCT FROM old.hire_date
           AND new.employment_start_date IS NOT DISTINCT FROM old.employment_start_date) THEN
        new.employment_start_date := new.hire_date;
    END IF;
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS workers_sync_employment_start_date ON public.workers;
CREATE TRIGGER workers_sync_employment_start_date
BEFORE INSERT OR UPDATE OF hire_date, employment_start_date ON public.workers
FOR EACH ROW EXECUTE FUNCTION public.workers_sync_employment_start_date();

-- ----------------------------------------------------------------------------
-- 3. Snapshot de antigüedad en la prenómina mensual.
-- ----------------------------------------------------------------------------
ALTER TABLE public.prenomina_worker_entries
    ADD COLUMN IF NOT EXISTS employment_start_date_snapshot date,
    ADD COLUMN IF NOT EXISTS tenure_reference_date          date,
    ADD COLUMN IF NOT EXISTS tenure_years                    integer,
    ADD COLUMN IF NOT EXISTS tenure_months                   integer,
    ADD COLUMN IF NOT EXISTS tenure_total_months             numeric(10,2),
    ADD COLUMN IF NOT EXISTS tenure_band_id                  uuid
        REFERENCES public.tenure_payment_scales(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tenure_band_label               text,
    ADD COLUMN IF NOT EXISTS tenure_base_amount              numeric(14,2),
    ADD COLUMN IF NOT EXISTS tenure_hourly_rate              numeric(14,6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tenure_payment                  numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tenure_status                   text NOT NULL DEFAULT 'OK';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prenomina_worker_entries_tenure_status_check'
    ) THEN
        ALTER TABLE public.prenomina_worker_entries
            ADD CONSTRAINT prenomina_worker_entries_tenure_status_check
            CHECK (tenure_status IN ('OK', 'NO_START_DATE', 'NO_BAND'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prenomina_worker_entries_tenure_payment_check'
    ) THEN
        ALTER TABLE public.prenomina_worker_entries
            ADD CONSTRAINT prenomina_worker_entries_tenure_payment_check
            CHECK (tenure_payment >= 0);
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Recalcular el registro: tarifa y pago de antigüedad con el MISMO divisor
--    (190.6) y las MISMAS horas trabajadas que el salario escala.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prenomina_recalc_entry(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth'
AS $$
DECLARE
    v_entry public.prenomina_worker_entries%rowtype;
    v_hourly numeric;
    v_hours numeric;
    v_pay numeric;
    v_tenure_hourly numeric;
    v_tenure_pay numeric;
    v_p19 numeric;
    v_p23 numeric;
BEGIN
    SELECT * INTO v_entry FROM public.prenomina_worker_entries WHERE id = p_entry_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_hourly := CASE
        WHEN COALESCE(v_entry.salary_scale_amount, 0) > 0
            THEN round(v_entry.salary_scale_amount / public.prenomina_monthly_hours_divisor(), 6)
        ELSE 0
    END;
    v_hours := round(COALESCE(v_entry.worked_days, 0) * COALESCE(v_entry.workday_hours, 0), 4);
    v_pay := round(v_hours * v_hourly, 2);

    v_tenure_hourly := CASE
        WHEN COALESCE(v_entry.tenure_base_amount, 0) > 0
            THEN round(v_entry.tenure_base_amount / public.prenomina_monthly_hours_divisor(), 6)
        ELSE 0
    END;
    v_tenure_pay := round(v_hours * v_tenure_hourly, 2);

    SELECT COALESCE(sum(payment_19_23), 0), COALESCE(sum(payment_23_07), 0)
        INTO v_p19, v_p23
    FROM public.prenomina_night_entries
    WHERE worker_entry_id = p_entry_id;

    UPDATE public.prenomina_worker_entries SET
        hourly_scale_rate = v_hourly,
        worked_hours = v_hours,
        scale_salary_payment = v_pay,
        tenure_hourly_rate = v_tenure_hourly,
        tenure_payment = v_tenure_pay,
        night_payment_19_23 = round(v_p19, 2),
        night_payment_23_07 = round(v_p23, 2),
        total_night_payment = round(v_p19 + v_p23, 2),
        total_payment = round(v_pay + v_tenure_pay + v_p19 + v_p23, 2),
        updated_at = now()
    WHERE id = p_entry_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Actualizar trabajadores: resolver la antigüedad del período.
--    La fecha de referencia es el ÚLTIMO DÍA DEL MES del período.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prenomina_refresh_workers(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth'
AS $$
DECLARE
    v_period public.prenomina_periods%rowtype;
    v_scale_id uuid;
    v_ref date;
    v_added integer := 0;
BEGIN
    SELECT * INTO v_period FROM public.prenomina_periods WHERE id = p_period_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Período de prenómina no encontrado'; END IF;
    IF NOT public.can_access_entity(v_period.organization_entity_id, 'prenomina.manage') THEN
        RAISE EXCEPTION 'Sin permiso para gestionar la prenómina';
    END IF;
    IF v_period.status <> 'BORRADOR' THEN
        RAISE EXCEPTION 'La prenómina está cerrada y no puede actualizarse';
    END IF;

    -- Fecha de corte: último día del mes del período (nunca la fecha actual).
    v_ref := (make_date(v_period.period_year, v_period.period_month, 1)
              + interval '1 month' - interval '1 day')::date;
    v_scale_id := public.resolve_salary_scale_for_entity(v_period.organization_entity_id);

    UPDATE public.prenomina_worker_entries e SET
        worker_name_snapshot = trim(concat_ws(' ', w.first_name, w.first_surname, w.second_surname)),
        identification_snapshot = w.identification,
        area_name_snapshot = ar.name,
        job_name_snapshot = j.name,
        position_name_snapshot = p.name,
        salary_group_id = sg.id,
        salary_group_sequence = sg.sequence_number,
        salary_scale_id = sg.salary_scale_id,
        salary_scale_amount = CASE
            WHEN sg.salary_scale_id IS NOT NULL AND sg.salary_scale_id = v_scale_id
                THEN (SELECT r.amount FROM public.resolve_salary_group_value(sg.id) r)
            ELSE NULL END,
        salary_currency = CASE
            WHEN sg.salary_scale_id IS NOT NULL AND sg.salary_scale_id = v_scale_id
                THEN (SELECT r.currency_code FROM public.resolve_salary_group_value(sg.id) r)
            ELSE NULL END,
        workday_hours = p.daily_hours,
        employment_start_date_snapshot = tn.start_date,
        tenure_reference_date = v_ref,
        tenure_years = tn.years,
        tenure_months = tn.months_rem,
        tenure_total_months = CASE WHEN tn.years IS NULL THEN NULL
                                   ELSE (tn.years * 12 + tn.months_rem)::numeric(10,2) END,
        tenure_band_id = band.id,
        tenure_band_label = CASE
            WHEN band.id IS NULL THEN NULL
            WHEN band.to_months IS NULL THEN 'Desde ' || trim(to_char(band.from_months, 'FM999999990')) || ' meses'
            ELSE trim(to_char(band.from_months, 'FM999999990')) || '–' || trim(to_char(band.to_months, 'FM999999990')) || ' meses'
        END,
        tenure_base_amount = band.amount,
        tenure_status = CASE
            WHEN tn.start_date IS NULL THEN 'NO_START_DATE'
            WHEN band.id IS NULL THEN 'NO_BAND'
            ELSE 'OK'
        END,
        updated_at = now()
    FROM public.workers w
    LEFT JOIN public.worker_position_assignments a
        ON a.worker_id = w.id AND a.is_current = true AND a.end_date IS NULL
    LEFT JOIN public.organization_positions p ON p.id = a.position_id
    LEFT JOIN public.organization_jobs j ON j.id = p.job_id
    LEFT JOIN public.organization_areas ar ON ar.id = j.area_id
    LEFT JOIN public.salary_groups sg ON sg.id = j.salary_group_id
    LEFT JOIN LATERAL (
        SELECT
            s.sd AS start_date,
            CASE WHEN s.sd IS NOT NULL AND s.sd <= v_ref
                 THEN date_part('year', age(v_ref, s.sd))::int END AS years,
            CASE WHEN s.sd IS NOT NULL AND s.sd <= v_ref
                 THEN date_part('month', age(v_ref, s.sd))::int END AS months_rem
        FROM (SELECT COALESCE(w.employment_start_date, w.hire_date) AS sd) s
    ) tn ON true
    LEFT JOIN LATERAL (
        SELECT t.* FROM public.tenure_payment_scales t
        WHERE tn.years IS NOT NULL
          AND t.organization_entity_id = v_period.organization_entity_id
          AND t.is_active = true
          AND (tn.years * 12 + tn.months_rem) >= t.from_months
          AND (t.to_months IS NULL OR (tn.years * 12 + tn.months_rem) < t.to_months)
        ORDER BY t.from_months DESC
        LIMIT 1
    ) band ON true
    WHERE e.period_id = v_period.id
      AND e.worker_id = w.id;

    INSERT INTO public.prenomina_worker_entries (
        period_id, organization_entity_id, worker_id,
        worker_name_snapshot, identification_snapshot,
        area_name_snapshot, job_name_snapshot, position_name_snapshot,
        salary_group_id, salary_group_sequence, salary_scale_id, salary_scale_amount, salary_currency,
        workday_hours,
        employment_start_date_snapshot, tenure_reference_date, tenure_years, tenure_months,
        tenure_total_months, tenure_band_id, tenure_band_label, tenure_base_amount, tenure_status
    )
    SELECT
        v_period.id, v_period.organization_entity_id, w.id,
        trim(concat_ws(' ', w.first_name, w.first_surname, w.second_surname)),
        w.identification,
        ar.name, j.name, p.name,
        sg.id, sg.sequence_number, sg.salary_scale_id,
        CASE
            WHEN sg.salary_scale_id IS NOT NULL AND sg.salary_scale_id = v_scale_id
                THEN (SELECT r.amount FROM public.resolve_salary_group_value(sg.id) r)
            ELSE NULL END,
        CASE
            WHEN sg.salary_scale_id IS NOT NULL AND sg.salary_scale_id = v_scale_id
                THEN (SELECT r.currency_code FROM public.resolve_salary_group_value(sg.id) r)
            ELSE NULL END,
        p.daily_hours,
        tn.start_date, v_ref, tn.years, tn.months_rem,
        CASE WHEN tn.years IS NULL THEN NULL
             ELSE (tn.years * 12 + tn.months_rem)::numeric(10,2) END,
        band.id,
        CASE
            WHEN band.id IS NULL THEN NULL
            WHEN band.to_months IS NULL THEN 'Desde ' || trim(to_char(band.from_months, 'FM999999990')) || ' meses'
            ELSE trim(to_char(band.from_months, 'FM999999990')) || '–' || trim(to_char(band.to_months, 'FM999999990')) || ' meses'
        END,
        band.amount,
        CASE
            WHEN tn.start_date IS NULL THEN 'NO_START_DATE'
            WHEN band.id IS NULL THEN 'NO_BAND'
            ELSE 'OK'
        END
    FROM public.workers w
    LEFT JOIN public.worker_position_assignments a
        ON a.worker_id = w.id AND a.is_current = true AND a.end_date IS NULL
    LEFT JOIN public.organization_positions p ON p.id = a.position_id
    LEFT JOIN public.organization_jobs j ON j.id = p.job_id
    LEFT JOIN public.organization_areas ar ON ar.id = j.area_id
    LEFT JOIN public.salary_groups sg ON sg.id = j.salary_group_id
    LEFT JOIN LATERAL (
        SELECT
            s.sd AS start_date,
            CASE WHEN s.sd IS NOT NULL AND s.sd <= v_ref
                 THEN date_part('year', age(v_ref, s.sd))::int END AS years,
            CASE WHEN s.sd IS NOT NULL AND s.sd <= v_ref
                 THEN date_part('month', age(v_ref, s.sd))::int END AS months_rem
        FROM (SELECT COALESCE(w.employment_start_date, w.hire_date) AS sd) s
    ) tn ON true
    LEFT JOIN LATERAL (
        SELECT t.* FROM public.tenure_payment_scales t
        WHERE tn.years IS NOT NULL
          AND t.organization_entity_id = v_period.organization_entity_id
          AND t.is_active = true
          AND (tn.years * 12 + tn.months_rem) >= t.from_months
          AND (t.to_months IS NULL OR (tn.years * 12 + tn.months_rem) < t.to_months)
        ORDER BY t.from_months DESC
        LIMIT 1
    ) band ON true
    WHERE w.organization_entity_id = v_period.organization_entity_id
      AND w.employment_status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM public.prenomina_worker_entries x
          WHERE x.period_id = v_period.id AND x.worker_id = w.id
      );

    GET DIAGNOSTICS v_added = ROW_COUNT;

    PERFORM public.prenomina_recalc_entry(e.id)
    FROM public.prenomina_worker_entries e
    WHERE e.period_id = v_period.id;

    RETURN v_added;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Cierre: exige antigüedad resoluble para todos los trabajadores.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prenomina_close_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth'
AS $$
DECLARE
    v_period public.prenomina_periods%rowtype;
    v_missing_salary integer;
    v_missing_hours integer;
    v_missing_tenure integer;
BEGIN
    SELECT * INTO v_period FROM public.prenomina_periods WHERE id = p_period_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Período de prenómina no encontrado'; END IF;
    IF NOT public.can_access_entity(v_period.organization_entity_id, 'prenomina.manage') THEN
        RAISE EXCEPTION 'Sin permiso para gestionar la prenómina';
    END IF;
    IF v_period.status = 'CERRADA' THEN RETURN; END IF;

    SELECT count(*) INTO v_missing_salary
    FROM public.prenomina_worker_entries
    WHERE period_id = p_period_id
      AND (salary_scale_amount IS NULL OR salary_scale_amount <= 0);

    IF v_missing_salary > 0 THEN
        RAISE EXCEPTION 'No se puede cerrar: % trabajador(es) sin salario escala configurado', v_missing_salary;
    END IF;

    SELECT count(*) INTO v_missing_hours
    FROM public.prenomina_worker_entries
    WHERE period_id = p_period_id
      AND (workday_hours IS NULL OR workday_hours <= 0);

    IF v_missing_hours > 0 THEN
        RAISE EXCEPTION 'No se puede cerrar: % trabajador(es) sin jornada configurada en su Puesto', v_missing_hours;
    END IF;

    SELECT count(*) INTO v_missing_tenure
    FROM public.prenomina_worker_entries
    WHERE period_id = p_period_id
      AND tenure_status <> 'OK';

    IF v_missing_tenure > 0 THEN
        RAISE EXCEPTION 'No se puede cerrar: % trabajador(es) sin antigüedad resoluble (sin fecha de incorporación o sin tramo de la escala de antigüedad)', v_missing_tenure;
    END IF;

    UPDATE public.prenomina_periods SET
        status = 'CERRADA',
        closed_at = now(),
        closed_by = auth.uid(),
        updated_at = now()
    WHERE id = p_period_id;
END;
$$;
