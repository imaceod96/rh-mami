-- ============================================================================
-- FASE — PAGO POR CATEGORÍA ACADÉMICA (MÁSTER / DOCTOR)
-- Migración incremental idempotente.
--
-- Modela los importes de Máster y Doctor reutilizando el MISMO principio
-- arquitectónico que la escala salarial:
--   PRESUPUESTADA → configuración GLOBAL  (scope_type = 'PRESUPUESTADA_GLOBAL')
--   EMPRESARIAL   → configuración propia  (scope_type = 'EMPRESARIAL_ENTITY')
--
-- SIN fallback EMPRESARIAL → PRESUPUESTADA: si una entidad empresarial no tiene
-- importe configurado, la categoría queda NO CONFIGURADA.
--
-- Dinero: numeric(12,2), importe >= 0 con decimales (nunca float).
--   NULL       = todavía no configurado
--   0          = configurado explícitamente sin pago
-- NULL nunca se convierte silenciosamente en 0.
--
-- Esta fase NO integra los importes en Prenómina ni en el Anexo 14.
-- ============================================================================

-- 1. Tabla de configuración.
CREATE TABLE IF NOT EXISTS public.academic_category_payments (
    id                       uuid                 DEFAULT gen_random_uuid() PRIMARY KEY,
    scope_type               text                 NOT NULL,
    organization_entity_id   uuid                 REFERENCES public.organization_entities(id) ON DELETE CASCADE,
    tenant_id                uuid                 REFERENCES public.tenants(id) ON DELETE CASCADE,
    regime_id                text                 NOT NULL REFERENCES public.entity_regimes(id),
    category                 text                 NOT NULL,
    amount                   numeric(12,2),
    currency_code            text                 NOT NULL DEFAULT 'CUP',
    is_active                boolean              NOT NULL DEFAULT true,
    created_by               uuid,
    created_at               timestamp with time zone NOT NULL DEFAULT now(),
    updated_at               timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Restricciones de integridad.
ALTER TABLE public.academic_category_payments
ADD CONSTRAINT academic_category_payments_scope_check
CHECK (scope_type IN ('PRESUPUESTADA_GLOBAL', 'EMPRESARIAL_ENTITY'));

ALTER TABLE public.academic_category_payments
ADD CONSTRAINT academic_category_payments_category_check
CHECK (category IN ('MASTER', 'DOCTOR'));

-- Importe >= 0 con decimales. NULL permitido (categoría no configurada).
ALTER TABLE public.academic_category_payments
ADD CONSTRAINT academic_category_payments_amount_check
CHECK (amount IS NULL OR amount >= 0);

ALTER TABLE public.academic_category_payments
ADD CONSTRAINT academic_category_payments_empresarial_requires_entity
CHECK (scope_type <> 'EMPRESARIAL_ENTITY' OR organization_entity_id IS NOT NULL);

ALTER TABLE public.academic_category_payments
ADD CONSTRAINT academic_category_payments_presupuestada_no_entity
CHECK (scope_type <> 'PRESUPUESTADA_GLOBAL' OR (organization_entity_id IS NULL AND tenant_id IS NULL));

-- 3. Una única configuración global activa por categoría.
CREATE UNIQUE INDEX IF NOT EXISTS academic_category_payments_global_unique
ON public.academic_category_payments (category)
WHERE scope_type = 'PRESUPUESTADA_GLOBAL' AND is_active = true;

-- 4. Índice de consulta por entidad.
CREATE INDEX IF NOT EXISTS idx_academic_category_payments_entity
ON public.academic_category_payments (organization_entity_id);

-- 5. Trigger de updated_at.
CREATE TRIGGER academic_category_payments_updated_at
BEFORE UPDATE ON public.academic_category_payments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. RLS (misma separación de capas que el resto del esquema salarial:
--    grants para el acceso por API + políticas para el acceso por filas).
ALTER TABLE public.academic_category_payments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.academic_category_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.academic_category_payments TO service_role;

CREATE POLICY academic_category_payments_select
ON public.academic_category_payments
FOR SELECT TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('salary.view')
  OR public.has_platform_permission('salary.manage')
  OR (scope_type = 'PRESUPUESTADA_GLOBAL' AND is_active)
  OR (scope_type = 'EMPRESARIAL_ENTITY' AND organization_entity_id IS NOT NULL
      AND public.can_access_entity(organization_entity_id, 'salary.view'))
);

CREATE POLICY academic_category_payments_insert_global
ON public.academic_category_payments
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_superadmin() OR public.has_platform_permission('salary.manage'));

CREATE POLICY academic_category_payments_update
ON public.academic_category_payments
FOR UPDATE TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('salary.manage')
  OR (scope_type = 'EMPRESARIAL_ENTITY' AND organization_entity_id IS NOT NULL
      AND public.can_access_entity(organization_entity_id, 'salary.manage'))
)
WITH CHECK (
  public.is_platform_superadmin()
  OR public.has_platform_permission('salary.manage')
  OR (scope_type = 'EMPRESARIAL_ENTITY' AND organization_entity_id IS NOT NULL
      AND public.can_access_entity(organization_entity_id, 'salary.manage'))
);

CREATE POLICY academic_category_payments_delete
ON public.academic_category_payments
FOR DELETE TO authenticated
USING (public.is_platform_superadmin() OR public.has_platform_permission('salary.manage'));

-- 7. Alcance de configuración aplicable a una entidad (mismo criterio que la
--    resolución de la escala salarial: PRESUPUESTADA global, resto por entidad).
CREATE OR REPLACE FUNCTION public.resolve_academic_payment_scope(p_entity_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_regime text;
BEGIN
  IF p_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT regime_id INTO v_regime
  FROM public.organization_entities
  WHERE id = p_entity_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF upper(btrim(coalesce(v_regime, ''))) = 'PRESUPUESTADA' THEN
    RETURN 'PRESUPUESTADA_GLOBAL';
  END IF;

  RETURN 'EMPRESARIAL_ENTITY';
END $$;

-- 8. FUENTE ÚNICA DE VERDAD — resolución a partir de los indicadores.
--    Regla: Doctor > Máster (NUNCA se suman). Sin categoría → 0.
--    `configured = false` sólo cuando la categoría efectiva existe pero no tiene
--    configuración en el alcance correspondiente (no hay fallback entre regímenes).
CREATE OR REPLACE FUNCTION public.resolve_academic_category_payment_for_flags(
  p_entity_id uuid,
  p_has_masters boolean,
  p_has_doctorate boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_scope text;
  v_regime text;
  v_category text;
  v_amount numeric;
  v_has_row boolean := false;
BEGIN
  v_scope := public.resolve_academic_payment_scope(p_entity_id);

  SELECT upper(btrim(coalesce(regime_id, ''))) INTO v_regime
  FROM public.organization_entities
  WHERE id = p_entity_id;

  v_category := CASE
    WHEN coalesce(p_has_doctorate, false) THEN 'DOCTOR'
    WHEN coalesce(p_has_masters, false) THEN 'MASTER'
    ELSE NULL
  END;

  IF v_category IS NULL THEN
    RETURN jsonb_build_object(
      'category', NULL, 'amount', 0, 'configured', true,
      'regime', v_regime, 'scope', v_scope
    );
  END IF;

  IF v_scope = 'PRESUPUESTADA_GLOBAL' THEN
    SELECT a.amount, true INTO v_amount, v_has_row
    FROM public.academic_category_payments a
    WHERE a.scope_type = 'PRESUPUESTADA_GLOBAL'
      AND a.category = v_category
      AND a.is_active = true
    LIMIT 1;
  ELSIF v_scope = 'EMPRESARIAL_ENTITY' THEN
    SELECT a.amount, true INTO v_amount, v_has_row
    FROM public.academic_category_payments a
    WHERE a.scope_type = 'EMPRESARIAL_ENTITY'
      AND a.organization_entity_id = p_entity_id
      AND a.category = v_category
      AND a.is_active = true
    LIMIT 1;
  ELSE
    v_has_row := false;
  END IF;

  RETURN jsonb_build_object(
    'category', v_category,
    'amount', CASE WHEN coalesce(v_has_row, false) AND v_amount IS NOT NULL THEN v_amount ELSE NULL END,
    'configured', coalesce(v_has_row, false) AND v_amount IS NOT NULL,
    'regime', v_regime,
    'scope', v_scope
  );
END $$;

-- 9. Resolución para un trabajador concreto (valida permisos y pertenencia).
CREATE OR REPLACE FUNCTION public.resolve_academic_category_payment(p_entity_id uuid, p_worker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_masters boolean;
  v_doctorate boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.can_access_entity(p_entity_id, 'workers.view')
     AND NOT public.can_access_entity(p_entity_id, 'workers.manage') THEN
    RAISE EXCEPTION 'No tiene permiso para consultar el pago por categoría académica de este trabajador';
  END IF;

  SELECT coalesce(w.has_masters_degree, false), coalesce(w.has_doctorate_degree, false)
  INTO v_masters, v_doctorate
  FROM public.workers w
  WHERE w.id = p_worker_id AND w.organization_entity_id = p_entity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trabajador no encontrado en esta entidad';
  END IF;

  RETURN public.resolve_academic_category_payment_for_flags(p_entity_id, v_masters, v_doctorate);
END $$;

-- 10. Lectura de la configuración vigente de la entidad (alcance + permisos).
CREATE OR REPLACE FUNCTION public.get_academic_category_payment_config(p_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_scope text;
  v_regime text;
  v_can_view boolean;
  v_can_manage boolean;
  v_master numeric;
  v_doctor numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_can_view := public.is_platform_superadmin()
    OR public.has_platform_permission('salary.view')
    OR public.has_platform_permission('salary.manage')
    OR public.can_access_entity(p_entity_id, 'salary.view')
    OR public.can_access_entity(p_entity_id, 'salary.manage');

  IF NOT v_can_view THEN
    RAISE EXCEPTION 'No tiene permiso para consultar la configuración salarial de esta entidad';
  END IF;

  v_scope := public.resolve_academic_payment_scope(p_entity_id);
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'La entidad no existe o no está activa';
  END IF;

  SELECT upper(btrim(coalesce(regime_id, ''))) INTO v_regime
  FROM public.organization_entities
  WHERE id = p_entity_id;

  IF v_scope = 'PRESUPUESTADA_GLOBAL' THEN
    v_can_manage := public.is_platform_superadmin() OR public.has_platform_permission('salary.manage');

    SELECT a.amount INTO v_master FROM public.academic_category_payments a
    WHERE a.scope_type = 'PRESUPUESTADA_GLOBAL' AND a.category = 'MASTER' AND a.is_active = true
    LIMIT 1;

    SELECT a.amount INTO v_doctor FROM public.academic_category_payments a
    WHERE a.scope_type = 'PRESUPUESTADA_GLOBAL' AND a.category = 'DOCTOR' AND a.is_active = true
    LIMIT 1;
  ELSE
    v_can_manage := public.is_platform_superadmin()
      OR public.has_platform_permission('salary.manage')
      OR public.can_access_entity(p_entity_id, 'salary.manage');

    SELECT a.amount INTO v_master FROM public.academic_category_payments a
    WHERE a.scope_type = 'EMPRESARIAL_ENTITY' AND a.organization_entity_id = p_entity_id
      AND a.category = 'MASTER' AND a.is_active = true
    LIMIT 1;

    SELECT a.amount INTO v_doctor FROM public.academic_category_payments a
    WHERE a.scope_type = 'EMPRESARIAL_ENTITY' AND a.organization_entity_id = p_entity_id
      AND a.category = 'DOCTOR' AND a.is_active = true
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'entity_id', p_entity_id,
    'scope', v_scope,
    'regime', v_regime,
    'currency_code', 'CUP',
    'master_amount', v_master,
    'doctor_amount', v_doctor,
    'master_configured', v_master IS NOT NULL,
    'doctor_configured', v_doctor IS NOT NULL,
    'configured', (v_master IS NOT NULL OR v_doctor IS NOT NULL),
    'can_view', true,
    'can_manage', v_can_manage
  );
END $$;

-- 11. Guardado del importe de una categoría.
--     p_amount = NULL deja la categoría explícitamente NO CONFIGURADA.
--     p_amount = 0 es un valor válido y se conserva como 0.
CREATE OR REPLACE FUNCTION public.save_academic_category_payment(
  p_entity_id uuid,
  p_category text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_scope text;
  v_cat text;
  v_regime text;
  v_tenant uuid;
  v_id uuid;
  v_currency constant text := 'CUP';
  v_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_cat := upper(btrim(coalesce(p_category, '')));
  IF v_cat NOT IN ('MASTER', 'DOCTOR') THEN
    RAISE EXCEPTION 'La categoría académica no es válida (use MASTER o DOCTOR)';
  END IF;

  IF p_amount IS NOT NULL AND (p_amount < 0 OR p_amount <> p_amount) THEN
    RAISE EXCEPTION 'El importe debe ser un número mayor o igual que 0';
  END IF;

  v_amount := CASE WHEN p_amount IS NULL THEN NULL ELSE round(p_amount, 2) END;

  v_scope := public.resolve_academic_payment_scope(p_entity_id);
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'La entidad no existe o no está activa';
  END IF;

  IF v_scope = 'PRESUPUESTADA_GLOBAL' THEN
    IF NOT (public.is_platform_superadmin() OR public.has_platform_permission('salary.manage')) THEN
      RAISE EXCEPTION 'Solo un administrador autorizado de SiteCorp puede configurar el pago por categoría académica de la escala presupuestada';
    END IF;
  ELSE
    IF NOT (public.is_platform_superadmin()
            OR public.has_platform_permission('salary.manage')
            OR public.can_access_entity(p_entity_id, 'salary.manage')) THEN
      RAISE EXCEPTION 'No tiene permiso para gestionar la configuración salarial de esta entidad';
    END IF;
  END IF;

  SELECT regime_id, tenant_id INTO v_regime, v_tenant
  FROM public.organization_entities
  WHERE id = p_entity_id;

  IF v_scope = 'PRESUPUESTADA_GLOBAL' THEN
    SELECT a.id INTO v_id FROM public.academic_category_payments a
    WHERE a.scope_type = 'PRESUPUESTADA_GLOBAL' AND a.category = v_cat;

    IF v_id IS NULL THEN
      INSERT INTO public.academic_category_payments (
        scope_type, organization_entity_id, tenant_id, regime_id,
        category, amount, currency_code, is_active, created_by
      ) VALUES (
        'PRESUPUESTADA_GLOBAL', NULL, NULL, 'PRESUPUESTADA',
        v_cat, v_amount, v_currency, true, auth.uid()
      ) RETURNING id INTO v_id;
    ELSE
      UPDATE public.academic_category_payments
      SET amount = v_amount, currency_code = v_currency, is_active = true, updated_at = now()
      WHERE id = v_id;
    END IF;
  ELSE
    SELECT a.id INTO v_id FROM public.academic_category_payments a
    WHERE a.scope_type = 'EMPRESARIAL_ENTITY'
      AND a.organization_entity_id = p_entity_id
      AND a.category = v_cat;

    IF v_id IS NULL THEN
      INSERT INTO public.academic_category_payments (
        scope_type, organization_entity_id, tenant_id, regime_id,
        category, amount, currency_code, is_active, created_by
      ) VALUES (
        'EMPRESARIAL_ENTITY', p_entity_id, v_tenant,
        coalesce(nullif(btrim(coalesce(v_regime, '')), ''), 'EMPRESARIAL'),
        v_cat, v_amount, v_currency, true, auth.uid()
      ) RETURNING id INTO v_id;
    ELSE
      UPDATE public.academic_category_payments
      SET tenant_id = v_tenant, amount = v_amount, currency_code = v_currency,
          is_active = true, updated_at = now()
      WHERE id = v_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_amount IS NULL THEN 'UNCONFIGURED' ELSE 'SAVED' END,
    'payment_id', v_id,
    'entity_id', p_entity_id,
    'category', v_cat,
    'amount', v_amount,
    'scope', v_scope
  );
END $$;
