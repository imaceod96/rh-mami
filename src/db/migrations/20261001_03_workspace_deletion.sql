-- ============================================================================
-- Eliminación definitiva de un Workspace (tenant de organización)
-- ----------------------------------------------------------------------------
-- Causa REAL del fallo reproducido (no una FK):
--
--   DELETE FROM public.tenants WHERE id = <workspace>
--   ERROR:  P0001: System organization roles cannot be deleted
--   CONTEXT: PL/pgSQL function protect_system_tenant_role() line 11 at RAISE
--
-- El borrado del tenant NO falla por foreign keys: prácticamente todas las FK
-- que apuntan a `tenants` y a `organization_entities` son ON DELETE CASCADE.
-- Falla porque el tenant arrastra sus `tenant_roles` y las guardas
-- `protect_system_tenant_role()` / `protect_system_tenant_role_permissions()`
-- prohíben borrar (o vaciar) roles internos de sistema.
--
-- Corrección (sin debilitar la seguridad):
--   1. Las guardas siguen vigentes para cualquier borrado ordinario; solo se
--      permiten durante la eliminación controlada de un workspace completo, y
--      únicamente para los roles del tenant marcado en la transacción
--      (`app.workspace_deletion`), fijado por `delete_workspace()`.
--   2. `delete_workspace()` centraliza la operación: autoriza (auth.uid() +
--      permiso de plataforma `tenants.delete` / SuperAdmin), exige confirmación
--      por nombre, recoge los objetos de Storage ANTES de borrar, ejecuta los
--      borrados explícitos que las FK no cubren (candidatos, accesos y roles) y
--      elimina el tenant dentro de la misma transacción (ROLLBACK total si algo
--      falla).
--   3. Datos globales (catálogos, escala PRESUPUESTADA_GLOBAL, usuario
--      compartido, roles de plataforma) quedan intactos.
-- ============================================================================

-- 1) Marca de eliminación de workspace (transacción local) --------------------

CREATE OR REPLACE FUNCTION public.workspace_deletion_target()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN coalesce(current_setting('app.workspace_deletion', true), '')
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN current_setting('app.workspace_deletion', true)::uuid
    ELSE NULL
  END;
$function$;

-- 2) Guarda de roles de sistema: permite el borrado SOLO con la marca del
--    tenant que se está eliminando. El resto de protecciones no cambia. ------

CREATE OR REPLACE FUNCTION public.protect_system_tenant_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.is_system_role, false) = false THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Eliminación definitiva del workspace propietario
  IF TG_OP = 'DELETE' THEN
    IF public.workspace_deletion_target() IS NOT NULL
       AND public.workspace_deletion_target() = OLD.tenant_id THEN
      RETURN OLD;
    END IF;

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

  IF NEW.organization_entity_id IS DISTINCT FROM OLD.organization_entity_id THEN
    RAISE EXCEPTION 'System organization roles cannot change their entity ownership';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Guarda de permisos de roles de sistema: misma excepción controlada ------

CREATE OR REPLACE FUNCTION public.protect_system_tenant_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_system boolean;
  v_role_tenant uuid;
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

    RAISE EXCEPTION 'System organization role permissions cannot be reduced or changed';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) Resumen previo (solo lectura) para la confirmación de la interfaz --------

CREATE OR REPLACE FUNCTION public.workspace_deletion_summary(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_platform_superadmin() OR public.has_platform_permission('tenants.delete')) THEN
    RAISE EXCEPTION 'No tiene permiso para consultar la eliminación de workspaces'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El workspace no existe o ya fue eliminado' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant.id,
    'tenant_name', v_tenant.name,
    'entities', (SELECT count(*) FROM public.organization_entities WHERE tenant_id = p_tenant_id),
    'workers', (SELECT count(*) FROM public.workers WHERE tenant_id = p_tenant_id),
    'positions', (
      SELECT count(*) FROM public.organization_positions p
      JOIN public.organization_entities e ON e.id = p.organization_entity_id
      WHERE e.tenant_id = p_tenant_id
    ),
    'candidates', (SELECT count(*) FROM public.candidates WHERE tenant_id = p_tenant_id),
    'contracts', (
      SELECT count(*) FROM public.employment_contracts c
      JOIN public.organization_entities e ON e.id = c.organization_entity_id
      WHERE e.tenant_id = p_tenant_id
    ),
    'addendums', (
      SELECT count(*) FROM public.contract_addendums a
      JOIN public.organization_entities e ON e.id = a.organization_entity_id
      WHERE e.tenant_id = p_tenant_id
    ),
    'worker_documents', (
      SELECT count(*) FROM public.worker_documents d
      JOIN public.workers w ON w.id = d.worker_id
      WHERE w.tenant_id = p_tenant_id
    ),
    'candidate_documents', (
      SELECT count(*) FROM public.candidate_documents cd
      JOIN public.candidates c ON c.id = cd.candidate_id
      WHERE c.tenant_id = p_tenant_id
    ),
    'document_templates', (
      SELECT count(*) FROM public.document_templates t
      JOIN public.organization_entities e ON e.id = t.organization_entity_id
      WHERE e.tenant_id = p_tenant_id
    ),
    'roles', (SELECT count(*) FROM public.tenant_roles WHERE tenant_id = p_tenant_id),
    'memberships', (SELECT count(*) FROM public.tenant_memberships WHERE tenant_id = p_tenant_id),
    'invitations', (SELECT count(*) FROM public.tenant_invitations WHERE tenant_id = p_tenant_id)
  );
END;
$function$;

-- 5) Operación central de eliminación definitiva -----------------------------

CREATE OR REPLACE FUNCTION public.delete_workspace(p_tenant_id uuid, p_confirmation_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_entity_ids uuid[];
  v_worker_ids uuid[];
  v_candidate_ids uuid[];
  v_document_objects text[] := ARRAY[]::text[];
  v_template_objects text[] := ARRAY[]::text[];
  v_summary jsonb;
  v_new_assignment_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  -- Autorización real en backend: permiso global de plataforma, nunca el botón.
  IF NOT (public.is_platform_superadmin() OR public.has_platform_permission('tenants.delete')) THEN
    RAISE EXCEPTION 'No tiene permiso para eliminar workspaces' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El workspace no existe o ya fue eliminado' USING ERRCODE = 'P0002';
  END IF;

  IF btrim(coalesce(p_confirmation_name, '')) IS DISTINCT FROM v_tenant.name THEN
    RAISE EXCEPTION 'El nombre de confirmación no coincide con el del workspace'
      USING ERRCODE = '22023';
  END IF;

  -- Serializa eliminaciones concurrentes del mismo workspace
  PERFORM pg_advisory_xact_lock(hashtextextended('delete_workspace:' || v_tenant.id::text, 0));

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_entity_ids FROM public.organization_entities WHERE tenant_id = p_tenant_id;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_worker_ids FROM public.workers WHERE tenant_id = p_tenant_id;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_candidate_ids FROM public.candidates WHERE tenant_id = p_tenant_id;

  -- Objetos privados de Storage que pertenecen EXCLUSIVAMENTE a este workspace.
  -- Se recogen antes del borrado (después las filas ya no permiten resolver la
  -- propiedad) y se devuelven para que la limpieza sea exacta, nunca por prefijo
  -- ambiguo.
  SELECT coalesce(array_agg(d.storage_path), ARRAY[]::text[])
    INTO v_document_objects
  FROM public.worker_documents d
  WHERE d.worker_id = ANY(v_worker_ids)
    AND d.storage_path IS NOT NULL
    AND d.storage_path <> 'pending';

  SELECT coalesce(v_document_objects || array_agg(cd.storage_path), v_document_objects)
    INTO v_document_objects
  FROM public.candidate_documents cd
  WHERE cd.candidate_id = ANY(v_candidate_ids)
    AND cd.storage_path IS NOT NULL;

  SELECT coalesce(array_agg(path), ARRAY[]::text[])
    INTO v_template_objects
  FROM (
    SELECT v.original_file_path AS path
    FROM public.document_template_versions v
    WHERE v.organization_entity_id = ANY(v_entity_ids)
      AND v.original_file_path IS NOT NULL
    UNION
    SELECT v.configured_file_path AS path
    FROM public.document_template_versions v
    WHERE v.organization_entity_id = ANY(v_entity_ids)
      AND v.configured_file_path IS NOT NULL
  ) files;

  v_summary := public.workspace_deletion_summary(p_tenant_id);

  -- 1) Accesos y roles internos del workspace (incluye los roles del sistema de
  --    las entidades del workspace, protegidos salvo en esta operación).
  DELETE FROM public.entity_user_access
  WHERE organization_entity_id = ANY(v_entity_ids);

  DELETE FROM public.tenant_invitations
  WHERE tenant_id = p_tenant_id;

  DELETE FROM public.tenant_user_roles
  WHERE tenant_membership_id IN (
    SELECT id FROM public.tenant_memberships WHERE tenant_id = p_tenant_id
  );

  PERFORM set_config('app.workspace_deletion', p_tenant_id::text, true);

  DELETE FROM public.tenant_role_permissions
  WHERE tenant_role_id IN (
    SELECT id FROM public.tenant_roles WHERE tenant_id = p_tenant_id
  );

  DELETE FROM public.tenant_roles WHERE tenant_id = p_tenant_id;

  -- 2) Candidatos: `candidates` NO tiene FK hacia `organization_entities` ni hacia
  --    `tenants` (solo un trigger de coherencia), por lo que el CASCADE del
  --    tenant NO los alcanzaría y quedarían huérfanos. Se borran explícitamente
  --    (sus hijos caen por CASCADE desde `candidates`).
  DELETE FROM public.candidates WHERE tenant_id = p_tenant_id;

  -- 3) El tenant arrastra el resto de datos propios (entidades, áreas, cargos,
  --    puestos, plantilla, asignaciones, movimientos, contratos, anexos,
  --    documentos, plantillas y escalas empresariales) por FK ON DELETE CASCADE.
  DELETE FROM public.tenants WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'status', 'DELETED',
    'tenant_id', v_tenant.id,
    'tenant_name', v_tenant.name,
    'summary', v_summary,
    'storage', jsonb_build_object(
      'documents', to_jsonb(v_document_objects),
      'document_templates', to_jsonb(v_template_objects),
      'worker_ids', to_jsonb(v_worker_ids),
      'candidate_ids', to_jsonb(v_candidate_ids),
      'entity_ids', to_jsonb(v_entity_ids)
    )
  );
END;
$function$;

-- 6) Superficie de ejecución -------------------------------------------------
-- Solo usuarios autenticados (además del rol de servicio). La autorización real
-- se comprueba dentro de las funciones; el privilegio de ejecución es la primera
-- barrera.

REVOKE EXECUTE ON FUNCTION public.delete_workspace(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_workspace(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.workspace_deletion_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.workspace_deletion_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_workspace(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_deletion_summary(uuid) TO authenticated, service_role;

-- Hallazgo de auditoría (NO modificado aquí por quedar fuera del alcance de esta
-- corrección): la tabla `public.candidates` tiene políticas definidas pero
-- `relrowsecurity = false`, por lo que sus políticas no se aplican. Se documenta
-- para una corrección posterior específica de candidatos.
