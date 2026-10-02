-- ============================================================================
-- FASE — ESCALA DE PAGO DE ANTIGÜEDAD (FASE 9-16)
-- Migración incremental idempotente.
--
-- Tabla de tramos de la escala de pago de antigüedad.
-- Cada entidad configura su propia escala (organization_entity_id).
-- INDEPENDIENTE de escala salarial, grupo salarial, cargo, salario contractual.
-- ============================================================================

-- 1. Tabla de tramos de la escala de pago de antigüedad.
CREATE TABLE IF NOT EXISTS public.tenure_payment_scales (
    id                       uuid                 DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_entity_id   uuid                 NOT NULL REFERENCES organization_entities(id) ON DELETE CASCADE,
    from_months              numeric(10,2)        NOT NULL,
    to_months                numeric(10,2),
    amount                   numeric(12,2)        NOT NULL,
    is_active                boolean              DEFAULT true NOT NULL,
    created_at               timestamp with time zone DEFAULT now() NOT NULL,
    updated_at               timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Restricciones de integridad.
ALTER TABLE public.tenure_payment_scales
ADD CONSTRAINT tenure_payment_scales_amount_check
CHECK (amount >= 0);

ALTER TABLE public.tenure_payment_scales
ADD CONSTRAINT tenure_payment_scales_range_check
CHECK (to_months IS NULL OR to_months > from_months);

-- 3. Índice para consultas por entidad.
CREATE INDEX IF NOT EXISTS idx_tenure_payment_scales_entity
ON public.tenure_payment_scales (organization_entity_id, from_months)
WHERE is_active = true;

-- 4. Trigger de updated_at.
CREATE TRIGGER IF NOT EXISTS tenure_payment_scales_updated_at
BEFORE UPDATE ON public.tenure_payment_scales
FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 5. RLS (obligatorio en todas las tablas expuestas por la API).
ALTER TABLE public.tenure_payment_scales ENABLE ROW LEVEL SECURITY;

-- 6. Grants: acceso API.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenure_payment_scales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenure_payment_scales TO authenticated;

-- 7. Políticas RLS: cada entidad administra su propia escala.
CREATE POLICY "tenure_payment_scales_select_policy"
ON public.tenure_payment_scales
FOR SELECT TO authenticated
USING (can_access_entity(organization_entity_id, 'staffing.view'));

CREATE POLICY "tenure_payment_scales_insert_policy"
ON public.tenure_payment_scales
FOR INSERT TO authenticated
WITH CHECK (can_access_entity(organization_entity_id, 'staffing.manage'));

CREATE POLICY "tenure_payment_scales_update_policy"
ON public.tenure_payment_scales
FOR UPDATE TO authenticated
USING (can_access_entity(organization_entity_id, 'staffing.manage'))
WITH CHECK (can_access_entity(organization_entity_id, 'staffing.manage'));

CREATE POLICY "tenure_payment_scales_delete_policy"
ON public.tenure_payment_scales
FOR DELETE TO authenticated
USING (can_access_entity(organization_entity_id, 'staffing.manage'));

-- 8. Función: resolver el pago por antigüedad aplicable a un trabajador.
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
    v_hire_date date;
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

    -- Fecha de contratación REAL del trabajador.
    SELECT hire_date INTO v_hire_date
    FROM public.workers
    WHERE id = p_worker_id
      AND organization_entity_id = p_entity_id;

    IF v_hire_date IS NULL THEN
        RETURN QUERY SELECT NULL::numeric(12,2), NULL::numeric(10,2), NULL::numeric(10,2),
                             NULL::integer, NULL::integer, NULL::text;
        RETURN;
    END IF;

    -- Antigüedad en meses (diferencia de calendario).
    v_years     := date_part('year', age(current_date, v_hire_date));
    v_months_int := date_part('month', age(current_date, v_hire_date));
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

-- 9. Función: reporte de demografía de trabajadores activos.
CREATE OR REPLACE FUNCTION public.report_worker_demographics(
    p_entity_id uuid,
    p_scope     text DEFAULT 'SELF'
)
RETURNS TABLE (
    category     text,
    value        text,
    count        bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_scope text := p_scope;
BEGIN
    -- Permiso de lectura sobre la entidad.
    IF NOT public.can_access_entity(p_entity_id, 'workers.view')
       AND NOT public.can_access_entity(p_entity_id, 'workers.manage') THEN
        RAISE EXCEPTION 'No tiene permiso para consultar la demografía de esta entidad';
    END IF;

    -- Normalizar scope.
    RETURN QUERY
    WITH target_entities AS (
        SELECT oe.id
        FROM public.organization_entities oe
        WHERE oe.id = p_entity_id
        UNION ALL
        SELECT d.id
        FROM public.organization_entities d
        WHERE v_scope = 'SELF_AND_DESCENDANTS'
          AND public.is_entity_descendant(p_entity_id, d.id)
          AND d.is_active = true
    ),
    active_workers AS (
        SELECT w.*
        FROM public.workers w
        JOIN target_entities te ON te.id = w.organization_entity_id
        WHERE w.employment_status = 'active'
    )
    SELECT 'edad' AS category,
           CASE
               WHEN w.birth_date IS NULL THEN 'Sin información'
               WHEN date_part('year', age(current_date, w.birth_date)) < 20 THEN 'Menos de 20'
               WHEN date_part('year', age(current_date, w.birth_date)) < 30 THEN '20-29'
               WHEN date_part('year', age(current_date, w.birth_date)) < 40 THEN '30-39'
               WHEN date_part('year', age(current_date, w.birth_date)) < 50 THEN '40-49'
               WHEN date_part('year', age(current_date, w.birth_date)) < 60 THEN '50-59'
               ELSE '60 o más'
           END AS value,
           count(*) AS count
    FROM active_workers w
    GROUP BY value

    UNION ALL
    SELECT 'color_piel' AS category,
           COALESCE(sc.name, 'Sin información') AS value,
           count(*) AS count
    FROM active_workers w
    LEFT JOIN public.skin_colors sc ON sc.id = w.skin_color_id
    GROUP BY value

    UNION ALL
    SELECT 'sexo' AS category,
           COALESCE(g.name, 'Sin información') AS value,
           count(*) AS count
    FROM active_workers w
    LEFT JOIN public.genders g ON g.id = w.gender_id
    GROUP BY value

    UNION ALL
    SELECT 'nivel_academico' AS category,
           COALESCE(el.name, 'Sin información') AS value,
           count(*) AS count
    FROM active_workers w
    LEFT JOIN public.education_levels el ON el.id = w.education_level_id
    GROUP BY value;
END;
$$;