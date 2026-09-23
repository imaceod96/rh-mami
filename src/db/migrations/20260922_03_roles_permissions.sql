-- 20260922_03_roles_permissions.sql
-- Phase 4.2B roles and permissions migration.
--
-- This file is the versioned audit record of SQL applied directly to the
-- connected Supabase database through the Dyad SQL console. The Supabase-managed
-- migrations directory is externally controlled and is not edited manually.

-- ============================================================================
-- 1. Duplicate-name protection
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_roles_name_normalized
  ON public.platform_roles (lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_roles_tenant_name_normalized
  ON public.tenant_roles (tenant_id, lower(btrim(name)));

-- ============================================================================
-- 2. Missing organization role-management capabilities
-- ============================================================================
INSERT INTO public.tenant_permissions (code, description)
VALUES
  ('roles.view', 'View organization roles'),
  ('roles.manage', 'Create, edit, and assign organization role permissions')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 3. Atomic platform role save
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

-- ============================================================================
-- 4. Atomic organization role save
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_tenant_role(
  p_role_id uuid,
  p_tenant_id uuid,
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
  v_existing_role public.tenant_roles%ROWTYPE;
  v_selected_count integer;
  v_catalog_count integer;
  v_authorized_count integer;
  v_is_platform_manager boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_platform_manager := public.has_platform_permission('tenant_roles.manage');

  IF NOT (
    public.is_platform_superadmin()
    OR v_is_platform_manager
    OR public.can_use_tenant_permission(p_tenant_id, 'roles.manage')
  ) THEN
    RAISE EXCEPTION 'Permission denied: roles.manage or tenant_roles.manage is required';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Organization workspace is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Organization workspace was not found';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Role name is required';
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
  FROM public.tenant_permissions
  WHERE id = ANY(v_permission_ids);

  IF v_catalog_count <> v_selected_count THEN
    RAISE EXCEPTION 'One or more organization permissions are invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_roles existing
    WHERE existing.tenant_id = p_tenant_id
      AND lower(btrim(existing.name)) = lower(v_name)
      AND (p_role_id IS NULL OR existing.id <> p_role_id)
  ) THEN
    RAISE EXCEPTION 'An organization role with this name already exists in this workspace'
      USING ERRCODE = '23505';
  END IF;

  -- A workspace role manager may only grant capabilities they currently have.
  IF NOT public.is_platform_superadmin() AND NOT v_is_platform_manager THEN
    SELECT count(*) INTO v_authorized_count
    FROM public.tenant_permissions selected
    WHERE selected.id = ANY(v_permission_ids)
      AND public.can_use_tenant_permission(p_tenant_id, selected.code);

    IF v_authorized_count <> v_selected_count THEN
      RAISE EXCEPTION 'You may only assign organization permissions that you currently have';
    END IF;
  END IF;

  IF p_role_id IS NULL THEN
    INSERT INTO public.tenant_roles (
      tenant_id, name, description, is_system_role, is_active
    )
    VALUES (
      p_tenant_id, v_name, v_description, false, COALESCE(p_is_active, true)
    )
    RETURNING id INTO v_role_id;
  ELSE
    SELECT * INTO v_existing_role
    FROM public.tenant_roles
    WHERE id = p_role_id
      AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Organization role was not found in this workspace';
    END IF;

    v_role_id := v_existing_role.id;

    IF v_existing_role.is_system_role THEN
      IF v_name <> v_existing_role.name THEN
        RAISE EXCEPTION 'System role names cannot be changed';
      END IF;

      IF COALESCE(p_is_active, true) <> COALESCE(v_existing_role.is_active, true) THEN
        RAISE EXCEPTION 'System role activation status cannot be changed';
      END IF;
    END IF;

    UPDATE public.tenant_roles
    SET name = v_name,
        description = v_description,
        is_active = COALESCE(p_is_active, true)
    WHERE id = v_role_id;
  END IF;

  DELETE FROM public.tenant_role_permissions
  WHERE tenant_role_id = v_role_id
    AND tenant_permission_id <> ALL(v_permission_ids);

  INSERT INTO public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
  SELECT v_role_id, tp.id
  FROM public.tenant_permissions tp
  WHERE tp.id = ANY(v_permission_ids)
  ON CONFLICT DO NOTHING;

  RETURN v_role_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_tenant_role(uuid, uuid, text, text, boolean, uuid[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_tenant_role(uuid, uuid, text, text, boolean, uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_tenant_role(uuid, uuid, text, text, boolean, uuid[])
  TO service_role;

-- ============================================================================
-- 5. Database-level reserved/system role protection
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_reserved_platform_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF OLD.name IS DISTINCT FROM 'SuperAdmin' OR COALESCE(OLD.is_system_role, false) = false THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'The reserved SuperAdmin role cannot be deleted';
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'The reserved SuperAdmin role name cannot be changed';
  END IF;

  IF NEW.is_system_role IS DISTINCT FROM OLD.is_system_role THEN
    RAISE EXCEPTION 'The reserved SuperAdmin role cannot lose system protection';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'The reserved SuperAdmin role cannot be deactivated';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS platform_roles_protect_reserved
  ON public.platform_roles;
CREATE TRIGGER platform_roles_protect_reserved
BEFORE UPDATE OR DELETE ON public.platform_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_reserved_platform_role();

CREATE OR REPLACE FUNCTION public.protect_system_tenant_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(OLD.is_system_role, false) = false THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'System organization roles cannot be deleted';
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'System organization role names cannot be changed';
  END IF;

  IF NEW.is_system_role IS DISTINCT FROM OLD.is_system_role THEN
    RAISE EXCEPTION 'System organization roles cannot lose system protection';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'System organization roles cannot be deactivated';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tenant_roles_protect_system
  ON public.tenant_roles;
CREATE TRIGGER tenant_roles_protect_system
BEFORE UPDATE OR DELETE ON public.tenant_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_system_tenant_role();

-- ============================================================================
-- 6. Role visibility for authorized non-SuperAdmin role administrators
-- ============================================================================
DROP POLICY IF EXISTS platform_role_permissions_select
  ON public.platform_role_permissions;

CREATE POLICY platform_role_permissions_select
ON public.platform_role_permissions
FOR SELECT
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('platform_roles.view')
);

DROP POLICY IF EXISTS platform_roles_select_managers
  ON public.platform_roles;

CREATE POLICY platform_roles_select_managers
ON public.platform_roles
FOR SELECT
TO authenticated
USING (public.has_platform_permission('platform_roles.view'));
