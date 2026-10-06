-- Permiso aislado para el flujo de carga inicial de trabajadores.
INSERT INTO public.tenant_permissions (code, description)
VALUES ('workers.initial_import', 'Carga inicial y migración de trabajadores')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
SELECT tr.id, tp.id
FROM public.tenant_roles tr
JOIN public.tenant_permissions tp ON tp.code = 'workers.initial_import'
WHERE tr.organization_entity_id IS NOT NULL
  AND tr.is_system_role = true
  AND tr.is_active = true
ON CONFLICT (tenant_role_id, tenant_permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.grant_initial_import_permission_to_system_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.code = 'workers.initial_import' THEN
    INSERT INTO public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
    SELECT tr.id, NEW.id
    FROM public.tenant_roles tr
    WHERE tr.organization_entity_id IS NOT NULL
      AND tr.is_system_role = true
      AND tr.is_active = true
    ON CONFLICT (tenant_role_id, tenant_permission_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_system_tenant_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_system boolean;
  v_role_tenant uuid;
  v_permission_code text;
BEGIN
  SELECT COALESCE(tr.is_system_role, false), tr.tenant_id
    INTO v_is_system, v_role_tenant
  FROM public.tenant_roles tr
  WHERE tr.id = COALESCE(NEW.tenant_role_id, OLD.tenant_role_id);

  IF COALESCE(v_is_system, false) THEN
    IF TG_OP = 'DELETE'
       AND public.workspace_deletion_target() IS NOT NULL
       AND public.workspace_deletion_target() = v_role_tenant THEN
      RETURN OLD;
    END IF;

    SELECT tp.code INTO v_permission_code
    FROM public.tenant_permissions tp
    WHERE tp.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_permission_id ELSE NEW.tenant_permission_id END;

    IF v_permission_code = 'workers.initial_import'
       AND TG_OP = 'DELETE'
       AND NEW.tenant_permission_id IS NULL THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'System organization role permissions cannot be reduced or changed';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_permission_initial_import_grant ON public.tenant_permissions;
CREATE TRIGGER tenant_permission_initial_import_grant
AFTER INSERT ON public.tenant_permissions
FOR EACH ROW EXECUTE FUNCTION public.grant_initial_import_permission_to_system_roles();
