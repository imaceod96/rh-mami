-- ============================================================================
-- FASE — FECHA CANÓNICA DE INCORPORACIÓN LABORAL
-- Migración incremental idempotente.
--
-- Añade el campo `employment_start_date` a la tabla `workers` como fuente
-- canónica para el cálculo de antigüedad laboral.
--
-- Diferencia con hire_date:
--   - hire_date: fecha histórica de incorporación (ya existe)
--   - employment_start_date: fecha canónica de inicio de la relación laboral
--     continua con la entidad. NO se modifica al cambiar de puesto, cargo,
--     contrato o anexo.
--
-- Para trabajadores existentes: se migra desde hire_date si existe.
-- ============================================================================

-- 1. Añadir columna canónica.
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS employment_start_date DATE;

-- 2. Migrar datos existentes: si employment_start_date es NULL y hire_date existe,
--    copiar hire_date a employment_start_date.
UPDATE public.workers
SET employment_start_date = hire_date
WHERE employment_start_date IS NULL
  AND hire_date IS NOT NULL;

-- 3. Actualizar la función resolve_tenure_payment_for_worker para usar
--    employment_start_date en lugar de hire_date.
CREATE OR REPLACE FUNCTION public.resolve_tenure_payment_for_worker(
    p_entity_id  uuid,
    p_worker_id  uuid
)
RETURNS TABLE (
    amount             numeric(12,2),
    from_months        numeric(10,2),
    to_months          numeric(10,2),
    years              integer,
    months             integer,
    human_description  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_start_date date;
    v_months    numeric(10,2);
    v_years     integer;
    v_months_int integer;
    v_desc      text;
BEGIN
    -- Permiso de lectura sobre el trabajador.
    IF NOT public.can_access_entity(p_entity_id, 'workers.view')
       AND NOT public.can_access_entity(p_entity_id, 'workers.manage') THEN
        RAISE EXCEPTION 'No tiene permiso para consultar la antigüedad de este trabajador';
    END IF;

    -- Fecha canónica de incorporación laboral.
    SELECT employment_start_date INTO v_start_date
    FROM public.workers
    WHERE id = p_worker_id
      AND organization_entity_id = p_entity_id;

    IF v_start_date IS NULL THEN
        RETURN QUERY SELECT NULL::numeric(12,2), NULL::numeric(10,2), NULL::numeric(10,2),
                             NULL::integer, NULL::integer, NULL::text;
        RETURN;
    END IF;

    -- Antigüedad en meses (diferencia de calendario).
    v_years     := date_part('year', age(current_date, v_start_date));
    v_months_int := date_part('month', age(current_date, v_start_date));
    v_months    := (v_years * 12 + v_months_int)::numeric(10,2);

    -- Descripción humana.
    IF v_years = 0 AND v_months_int = 0 THEN
        v_desc := 'Menos de 1 mes';
    ELSIF v_years = 0 THEN
        v_desc := format('%s mes(es)', v_months_int);
    ELSIF v_months_int = 0 THEN
        v_desc := format('%s año(s)', v_years);
    ELSE
        v_desc := format('%s año(s) y %s mes(es)', v_years, v_months_int);
    END IF;

    -- Resolver el tramo aplicable: desde inclusive, hasta exclusive.
    RETURN QUERY
    SELECT
        t.amount,
        t.from_months,
        t.to_months,
        v_years,
        v_months_int,
        v_desc
    FROM public.tenure_payment_scales t
    WHERE t.organization_entity_id = p_entity_id
      AND t.is_active = true
      AND v_months >= t.from_months
      AND (t.to_months IS NULL OR v_months < t.to_months)
    ORDER BY t.from_months DESC
    LIMIT 1;
END;
$$;
