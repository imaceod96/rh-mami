-- 20260930_01_platform_permissions_normalization.sql
-- Normalización de permisos GLOBALES de la plataforma SiteCorp.
--
-- Alcance: EXCLUSIVAMENTE el NIVEL 1 (Plataforma SiteCorp / Administración global).
-- NO reorganiza permisos internos de las entidades (fase posterior).
--
-- This file is the versioned audit record of SQL applied directly to the
-- connected Supabase database through the Dyad SQL console. The Supabase-managed
-- migrations directory is external and is not edited manually.
--
-- Objetivo:
--   Administración global → Roles y permisos administra EXCLUSIVAMENTE
--   platform_roles / platform_permissions, con el catálogo de plataforma
--   explícito en la base de datos (no sólo oculto en el frontend).
--
-- No se destruye ningún dato: no se borran permisos, roles ni asignaciones.
-- tenant_roles.* queda RETIRADO (no expuesto en el gestor global) pero la fila
-- permanece para no romper históricos ni asignaciones existentes.

-- ============================================================================
-- 0. Corrección de un defecto latente: platform_permissions y tenant_permissions
--    tienen un trigger BEFORE UPDATE que asigna NEW.updated_at, pero la columna
--    no existía (cualquier UPDATE fallaba). Se añade la columna que el trigger
--    espera. Cambio no destructivo.
-- ============================================================================
ALTER TABLE public.platform_permissions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tenant_permissions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ============================================================================
-- 1. Catálogo de plataforma explícito (metadatos no destructivos)
-- ============================================================================
ALTER TABLE public.platform_permissions
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS is_platform_scope boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

-- ============================================================================
-- 2. Catálogo canónico de permisos de PLATAFORMA (grupos visibles)
--    CLIENTES / WORKSPACES · ORGANIZACIONES · USUARIOS ·
--    ROLES Y PERMISOS · INFORMES · CONFIGURACIÓN
-- ============================================================================
UPDATE public.platform_permissions pp
SET is_platform_scope = true,
    category = v.category,
    retired_at = NULL
FROM (VALUES
  ('tenants.view', 'CLIENTES / WORKSPACES'),
  ('tenants.create', 'CLIENTES / WORKSPACES'),
  ('tenants.edit', 'CLIENTES / WORKSPACES'),
  ('tenants.activate', 'CLIENTES / WORKSPACES'),
  ('tenants.deactivate', 'CLIENTES / WORKSPACES'),
  ('tenants.delete', 'CLIENTES / WORKSPACES'),
  ('tenants.enter', 'CLIENTES / WORKSPACES'),
  ('organizations.view_all', 'ORGANIZACIONES'),
  ('organizations.manage_all', 'ORGANIZACIONES'),
  ('organizations.delete', 'ORGANIZACIONES'),
  ('users.view_all', 'USUARIOS'),
  ('users.manage_all', 'USUARIOS'),
  ('users.invite', 'USUARIOS'),
  ('platform_roles.view', 'ROLES Y PERMISOS'),
  ('platform_roles.manage', 'ROLES Y PERMISOS'),
  ('reports.cross_tenant', 'INFORMES'),
  ('platform_settings.view', 'CONFIGURACIÓN'),
  ('platform_settings.manage', 'CONFIGURACIÓN'),
  -- La escala salarial presupuestada GLOBAL es una función de configuración de
  -- la plataforma. Sus permisos siguen operativos (salary_scales RLS los usa),
  -- por lo que se conservan disponibles en el gestor global bajo CONFIGURACIÓN.
  ('salary.view', 'CONFIGURACIÓN'),
  ('salary.manage', 'CONFIGURACIÓN')
) AS v(code, category)
WHERE pp.code = v.code;

-- ============================================================================
-- 3. Retirada de la administración de roles de entidad desde el gestor global
--    (los datos NO se borran: la infraestructura tenant_* sigue intacta)
-- ============================================================================
UPDATE public.platform_permissions
SET is_platform_scope = false,
    category = NULL,
    retired_at = now()
WHERE code IN ('tenant_roles.view', 'tenant_roles.manage');

-- ============================================================================
-- 4. El resto de permisos deja de pertenecer al catálogo de plataforma
--    (jobs.*, salary.*_global, salary.*_empresarial y cualquier otro legado).
--    No se eliminan: quedan preservados para fases posteriores.
-- ============================================================================
UPDATE public.platform_permissions
SET is_platform_scope = false,
    category = NULL
WHERE code NOT IN (
  'tenants.view', 'tenants.create', 'tenants.edit', 'tenants.activate',
  'tenants.deactivate', 'tenants.delete', 'tenants.enter',
  'organizations.view_all', 'organizations.manage_all', 'organizations.delete',
  'users.view_all', 'users.manage_all', 'users.invite',
  'platform_roles.view', 'platform_roles.manage',
  'reports.cross_tenant',
  'platform_settings.view', 'platform_settings.manage',
  'salary.view', 'salary.manage'
)
AND retired_at IS NULL;

-- ============================================================================
-- 5. save_platform_role: sólo se pueden ASIGNAR permisos de plataforma.
--    Se conservan las asignaciones heredadas que ya tuviera el rol (no se
--    puede ampliarlas), preservando roles existentes sin pérdida de datos.
--    El resto de protecciones (SuperAdmin reservado, sistema, no escalación)
--    se mantienen íntegras.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_platform_role(
  p_role_id uuid,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_permission_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_role_id uuid;
  v_name text := btrim(p_name);
  v_description text := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_permission_ids uuid[];
  v_existing_role public.platform_roles%ROWTYPE;
  v_selected_count integer;
  v_catalog_count integer;
  v_authorized_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.is_platform_superadmin()
    OR public.has_platform_permission('platform_roles.manage')
  ) THEN
    RAISE EXCEPTION 'Permission denied: platform_roles.manage is required';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Role name is required';
  END IF;

  IF p_role_id IS NULL AND lower(v_name) = 'superadmin' THEN
    RAISE EXCEPTION 'SuperAdmin is a reserved system role name';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT selected_permission_id
    FROM unnest(COALESCE(p_permission_ids, ARRAY[]::uuid[])) AS selected_permission_id
    WHERE selected_permission_id IS NOT NULL
  ) INTO v_permission_ids;

  IF v_permission_ids IS NULL THEN
    v_permission_ids := ARRAY[]::uuid[];
  END IF;

  v_selected_count := COALESCE(cardinality(v_permission_ids), 0);

  SELECT count(*) INTO v_catalog_count
  FROM public.platform_permissions
  WHERE id = ANY(v_permission_ids);

  IF v_catalog_count <> v_selected_count THEN
    RAISE EXCEPTION 'One or more platform permissions are invalid';
  END IF;

  -- Normalización de plataforma: un rol de plataforma sólo puede recibir
  -- permisos del catálogo de plataforma (is_platform_scope). Las asignaciones
  -- heredadas que ya tuviera el rol se conservan, pero no se pueden ampliar.
  IF v_selected_count > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_permission_ids) AS selected_permission_id
      JOIN public.platform_permissions pp ON pp.id = selected_permission_id
      WHERE COALESCE(pp.is_platform_scope, false) = false
        AND (
          p_role_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.platform_role_permissions existing
            WHERE existing.platform_role_id = p_role_id
              AND existing.platform_permission_id = selected_permission_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'Only platform permissions can be assigned to platform roles';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.platform_roles existing
    WHERE lower(btrim(existing.name)) = lower(v_name)
      AND (p_role_id IS NULL OR existing.id <> p_role_id)
  ) THEN
    RAISE EXCEPTION 'A platform role with this name already exists'
      USING ERRCODE = '23505';
  END IF;

  -- Prevent a non-SuperAdmin role manager from granting permissions they do
  -- not currently possess.
  IF NOT public.is_platform_superadmin() THEN
    SELECT count(DISTINCT prp.platform_permission_id) INTO v_authorized_count
    FROM public.platform_user_roles pur
    JOIN public.platform_roles pr ON pr.id = pur.platform_role_id
    JOIN public.platform_role_permissions prp ON prp.platform_role_id = pr.id
    WHERE pur.user_id = auth.uid()
      AND pr.is_active = true
      AND prp.platform_permission_id = ANY(v_permission_ids);

    IF v_authorized_count <> v_selected_count THEN
      RAISE EXCEPTION 'You may only assign platform permissions that you currently have';
    END IF;
  END IF;

  IF p_role_id IS NULL THEN
    INSERT INTO public.platform_roles (name, description, is_system_role, is_active)
    VALUES (v_name, v_description, false, COALESCE(p_is_active, true))
    RETURNING id INTO v_role_id;
  ELSE
    SELECT * INTO v_existing_role
    FROM public.platform_roles
    WHERE id = p_role_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Platform role was not found';
    END IF;

    v_role_id := v_existing_role.id;

    IF v_existing_role.is_system_role THEN
      IF v_name <> v_existing_role.name THEN
        RAISE EXCEPTION 'System role names cannot be changed';
      END IF;

      IF COALESCE(p_is_active, true) <> COALESCE(v_existing_role.is_active, true) THEN
        RAISE EXCEPTION 'System role activation status cannot be changed';
      END IF;

      IF v_existing_role.name = 'SuperAdmin' THEN
        IF EXISTS (
          WITH selected_permissions AS (
            SELECT unnest(v_permission_ids) AS permission_id
          ),
          current_permissions AS (
            SELECT platform_permission_id AS permission_id
            FROM public.platform_role_permissions
            WHERE platform_role_id = v_role_id
          )
          SELECT 1
          FROM (
            (SELECT permission_id FROM selected_permissions
             EXCEPT
             SELECT permission_id FROM current_permissions)
            UNION ALL
            (SELECT permission_id FROM current_permissions
             EXCEPT
             SELECT permission_id FROM selected_permissions)
          ) AS changed_permissions
        ) THEN
          RAISE EXCEPTION 'SuperAdmin permissions cannot be reduced or changed';
        END IF;
      END IF;
    END IF;

    UPDATE public.platform_roles
    SET name = v_name,
        description = v_description,
        is_active = COALESCE(p_is_active, true)
    WHERE id = v_role_id;
  END IF;

  DELETE FROM public.platform_role_permissions
  WHERE platform_role_id = v_role_id
    AND platform_permission_id <> ALL(v_permission_ids);

  INSERT INTO public.platform_role_permissions (platform_role_id, platform_permission_id)
  SELECT v_role_id, pp.id
  FROM public.platform_permissions pp
  WHERE pp.id = ANY(v_permission_ids)
  ON CONFLICT DO NOTHING;

  RETURN v_role_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_platform_role(uuid, text, text, boolean, uuid[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_platform_role(uuid, text, text, boolean, uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_role(uuid, text, text, boolean, uuid[])
  TO service_role;
