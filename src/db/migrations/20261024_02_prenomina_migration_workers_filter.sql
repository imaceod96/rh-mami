-- Excluir y retirar de Prenómina trabajadores sin puesto actual activo válido.
CREATE OR REPLACE FUNCTION public.prenomina_refresh_workers(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_period public.prenomina_periods%ROWTYPE;
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

    v_ref := (make_date(v_period.period_year, v_period.period_month, 1) + interval '1 month' - interval '1 day')::date;
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
        salary_scale_amount = CASE WHEN sg.salary_scale_id = v_scale_id THEN (SELECT r.amount FROM public.resolve_salary_group_value(sg.id) r) ELSE NULL END,
        salary_currency = CASE WHEN sg.salary_scale_id = v_scale_id THEN (SELECT r.currency_code FROM public.resolve_salary_group_value(sg.id) r) ELSE NULL END,
        workday_hours = p.daily_hours,
        employment_start_date_snapshot = tn.start_date,
        tenure_reference_date = v_ref,
        tenure_years = tn.years,
        tenure_months = tn.months_rem,
        tenure_total_months = CASE WHEN tn.years IS NULL THEN NULL ELSE (tn.years * 12 + tn.months_rem)::numeric(10,2) END,
        tenure_band_id = band.id,
        tenure_band_label = CASE WHEN band.id IS NULL THEN NULL WHEN band.to_months IS NULL THEN 'Desde ' || trim(to_char(band.from_months, 'FM999999990')) || ' meses' ELSE trim(to_char(band.from_months, 'FM999999990')) || '–' || trim(to_char(band.to_months, 'FM999999990')) || ' meses' END,
        tenure_base_amount = band.amount,
        tenure_status = CASE WHEN tn.start_date IS NULL THEN 'NO_START_DATE' WHEN band.id IS NULL THEN 'NO_BAND' ELSE 'OK' END,
        updated_at = now()
    FROM public.workers w
    JOIN public.worker_position_assignments a ON a.worker_id = w.id AND a.is_current = true AND a.end_date IS NULL
    JOIN public.organization_positions p ON p.id = a.position_id AND p.is_active = true AND p.organization_entity_id = w.organization_entity_id
    LEFT JOIN public.organization_jobs j ON j.id = p.job_id
    LEFT JOIN public.organization_areas ar ON ar.id = j.area_id
    LEFT JOIN public.salary_groups sg ON sg.id = j.salary_group_id
    LEFT JOIN LATERAL (
        SELECT COALESCE(w.employment_start_date, w.hire_date) AS start_date,
               CASE WHEN COALESCE(w.employment_start_date, w.hire_date) <= v_ref THEN date_part('year', age(v_ref, COALESCE(w.employment_start_date, w.hire_date)))::int END AS years,
               CASE WHEN COALESCE(w.employment_start_date, w.hire_date) <= v_ref THEN date_part('month', age(v_ref, COALESCE(w.employment_start_date, w.hire_date)))::int END AS months_rem
    ) tn ON true
    LEFT JOIN LATERAL (
        SELECT t.* FROM public.tenure_payment_scales t
        WHERE tn.years IS NOT NULL AND t.organization_entity_id = v_period.organization_entity_id AND t.is_active
          AND (tn.years * 12 + tn.months_rem) >= t.from_months
          AND (t.to_months IS NULL OR (tn.years * 12 + tn.months_rem) < t.to_months)
        ORDER BY t.from_months DESC LIMIT 1
    ) band ON true
    WHERE e.period_id = v_period.id AND e.worker_id = w.id;

    DELETE FROM public.prenomina_worker_entries e
    WHERE e.period_id = v_period.id
      AND NOT EXISTS (
        SELECT 1 FROM public.worker_position_assignments a
        JOIN public.organization_positions p ON p.id = a.position_id
        WHERE a.worker_id = e.worker_id AND a.is_current = true AND a.end_date IS NULL
          AND p.is_active = true AND p.organization_entity_id = e.organization_entity_id
      );

    INSERT INTO public.prenomina_worker_entries (
        period_id, organization_entity_id, worker_id, worker_name_snapshot, identification_snapshot,
        area_name_snapshot, job_name_snapshot, position_name_snapshot, salary_group_id, salary_group_sequence,
        salary_scale_id, salary_scale_amount, salary_currency, workday_hours, employment_start_date_snapshot,
        tenure_reference_date, tenure_years, tenure_months, tenure_total_months, tenure_band_id,
        tenure_band_label, tenure_base_amount, tenure_status
    )
    SELECT v_period.id, v_period.organization_entity_id, w.id,
        trim(concat_ws(' ', w.first_name, w.first_surname, w.second_surname)), w.identification,
        ar.name, j.name, p.name, sg.id, sg.sequence_number, sg.salary_scale_id,
        CASE WHEN sg.salary_scale_id = v_scale_id THEN (SELECT r.amount FROM public.resolve_salary_group_value(sg.id) r) ELSE NULL END,
        CASE WHEN sg.salary_scale_id = v_scale_id THEN (SELECT r.currency_code FROM public.resolve_salary_group_value(sg.id) r) ELSE NULL END,
        p.daily_hours, tn.start_date, v_ref, tn.years, tn.months_rem,
        CASE WHEN tn.years IS NULL THEN NULL ELSE (tn.years * 12 + tn.months_rem)::numeric(10,2) END,
        band.id,
        CASE WHEN band.id IS NULL THEN NULL WHEN band.to_months IS NULL THEN 'Desde ' || trim(to_char(band.from_months, 'FM999999990')) || ' meses' ELSE trim(to_char(band.from_months, 'FM999999990')) || '–' || trim(to_char(band.to_months, 'FM999999990')) || ' meses' END,
        band.amount,
        CASE WHEN tn.start_date IS NULL THEN 'NO_START_DATE' WHEN band.id IS NULL THEN 'NO_BAND' ELSE 'OK' END
    FROM public.workers w
    JOIN public.worker_position_assignments a ON a.worker_id = w.id AND a.is_current = true AND a.end_date IS NULL
    JOIN public.organization_positions p ON p.id = a.position_id AND p.is_active = true AND p.organization_entity_id = w.organization_entity_id
    LEFT JOIN public.organization_jobs j ON j.id = p.job_id
    LEFT JOIN public.organization_areas ar ON ar.id = j.area_id
    LEFT JOIN public.salary_groups sg ON sg.id = j.salary_group_id
    LEFT JOIN LATERAL (
        SELECT COALESCE(w.employment_start_date, w.hire_date) AS start_date,
               CASE WHEN COALESCE(w.employment_start_date, w.hire_date) <= v_ref THEN date_part('year', age(v_ref, COALESCE(w.employment_start_date, w.hire_date)))::int END AS years,
               CASE WHEN COALESCE(w.employment_start_date, w.hire_date) <= v_ref THEN date_part('month', age(v_ref, COALESCE(w.employment_start_date, w.hire_date)))::int END AS months_rem
    ) tn ON true
    LEFT JOIN LATERAL (
        SELECT t.* FROM public.tenure_payment_scales t
        WHERE tn.years IS NOT NULL AND t.organization_entity_id = v_period.organization_entity_id AND t.is_active
          AND (tn.years * 12 + tn.months_rem) >= t.from_months
          AND (t.to_months IS NULL OR (tn.years * 12 + tn.months_rem) < t.to_months)
        ORDER BY t.from_months DESC LIMIT 1
    ) band ON true
    WHERE w.organization_entity_id = v_period.organization_entity_id AND w.employment_status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.prenomina_worker_entries x WHERE x.period_id = v_period.id AND x.worker_id = w.id);

    GET DIAGNOSTICS v_added = ROW_COUNT;
    PERFORM public.prenomina_recalc_entry(e.id) FROM public.prenomina_worker_entries e WHERE e.period_id = v_period.id;
    RETURN v_added;
END;
$$;
