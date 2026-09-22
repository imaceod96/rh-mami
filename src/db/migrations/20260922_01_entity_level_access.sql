-- 20260922_01_entity_level_access.sql
-- Entity-level SiteCorp account access migration.
--
-- IMPORTANT:
-- This file is the versioned audit record of SQL applied directly to the
-- connected Supabase database through the Dyad SQL console. The Supabase-managed
-- migrations directory is externally controlled and is not edited manually.
--
-- Tenants remain independent organizational workspaces. Organization entities
-- represent Business Group -> Company -> UEB levels. SiteCorp account access is
-- granted through entity_user_access.

-- ============================================================================
-- 1. Reuse and extend organization_entities
-- ============================================================================
ALTER TABLE public.organization_entities
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_sitecorp_account boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_is_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_code text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text;

UPDATE public.organization_entities
SET is_active = COALESCE(is_active, (status = 'active'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_entities_tenant_account_code
  ON public.organization_entities (tenant_id, account_code)
  WHERE account_code IS NOT NULL;

ALTER TABLE public.organization_entities
  DROP CONSTRAINT IF EXISTS organization_entities_sitecorp_account_check;

ALTER TABLE public.organization_entities
  ADD CONSTRAINT organization_entities_sitecorp_account_check
  CHECK (
    (
      is_sitecorp_account = true
      AND account_code IS NOT NULL
      AND btrim(account_code) <> ''
    )
    OR (
      COALESCE(is_sitecorp_account, false) = false
      AND account_code IS NULL
      AND COALESCE(account_is_active, false) = false
    )
  );

-- ============================================================================
-- 2. Enforce the organizational hierarchy and prevent cycles
-- ============================================================================
CREATE OR REPLACE FUNCTION public.organization_entity_hierarchy_is_valid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  parent_type text;
  parent_tenant uuid;
  walker uuid;
BEGIN
  IF NEW.entity_type NOT IN ('business_group', 'company', 'ueb') THEN
    RAISE EXCEPTION 'Invalid organization entity type' USING ERRCODE = '23514';
  END IF;

  IF NEW.entity_type = 'business_group' THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Business group must not have a parent' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NULL THEN
    RAISE EXCEPTION 'Company and UEB must have a parent' USING ERRCODE = '23514';
  END IF;

  SELECT entity_type, tenant_id
    INTO parent_type, parent_tenant
  FROM public.organization_entities
  WHERE id = NEW.parent_id;

  IF parent_type IS NULL THEN
    RAISE EXCEPTION 'Parent organization entity was not found' USING ERRCODE = '23514';
  END IF;

  IF parent_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Organization entity parent must belong to the same tenant'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.entity_type = 'company' AND parent_type <> 'business_group' THEN
    RAISE EXCEPTION 'Company parent must be a business group' USING ERRCODE = '23514';
  END IF;

  IF NEW.entity_type = 'ueb' AND parent_type <> 'company' THEN
    RAISE EXCEPTION 'UEB parent must be a company' USING ERRCODE = '23514';
  END IF;

  walker := NEW.parent_id;
  WHILE walker IS NOT NULL LOOP
    IF walker = NEW.id THEN
      RAISE EXCEPTION 'Organization hierarchy cycle is not allowed' USING ERRCODE = '23514';
    END IF;
    SELECT parent_id INTO walker
    FROM public.organization_entities
    WHERE id = walker;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS organization_entities_hierarchy_is_valid
  ON public.organization_entities;
CREATE TRIGGER organization_entities_hierarchy_is_valid
BEFORE INSERT OR UPDATE OF parent_id, tenant_id, entity_type
ON public.organization_entities
FOR EACH ROW EXECUTE FUNCTION public.organization_entity_hierarchy_is_valid();

-- ============================================================================
-- 3. Entity-level user access
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.entity_user_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_membership_id uuid NOT NULL
    REFERENCES public.tenant_memberships(id) ON DELETE CASCADE,
  organization_entity_id uuid NOT NULL
    REFERENCES public.organization_entities(id) ON DELETE CASCADE,
  tenant_role_id uuid NOT NULL
    REFERENCES public.tenant_roles(id) ON DELETE RESTRICT,
  access_scope text NOT NULL DEFAULT 'SELF',
  is_active boolean DEFAULT true,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT entity_user_access_scope_check
    CHECK (access_scope = ANY (ARRAY['SELF'::text, 'SELF_AND_DESCENDANTS'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_user_access_membership_entity_role
  ON public.entity_user_access (tenant_membership_id, organization_entity_id, tenant_role_id);

CREATE OR REPLACE FUNCTION public.entity_user_access_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  membership_tenant uuid;
  entity_tenant uuid;
  role_tenant uuid;
BEGIN
  SELECT tenant_id INTO membership_tenant
  FROM public.tenant_memberships
  WHERE id = NEW.tenant_membership_id;

  SELECT tenant_id INTO entity_tenant
  FROM public.organization_entities
  WHERE id = NEW.organization_entity_id;

  SELECT tenant_id INTO role_tenant
  FROM public.tenant_roles
  WHERE id = NEW.tenant_role_id;

  IF membership_tenant IS NULL OR entity_tenant IS NULL OR role_tenant IS NULL THEN
    RAISE EXCEPTION 'Entity access references must exist' USING ERRCODE = '23514';
  END IF;

  IF membership_tenant <> entity_tenant OR membership_tenant <> role_tenant THEN
    RAISE EXCEPTION 'Entity access membership, entity, and role must belong to the same tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS entity_user_access_same_tenant
  ON public.entity_user_access;
CREATE TRIGGER entity_user_access_same_tenant
BEFORE INSERT OR UPDATE OF tenant_membership_id, organization_entity_id, tenant_role_id
ON public.entity_user_access
FOR EACH ROW EXECUTE FUNCTION public.entity_user_access_same_tenant();

DROP TRIGGER IF EXISTS entity_user_access_updated_at
  ON public.entity_user_access;
CREATE TRIGGER entity_user_access_updated_at
BEFORE UPDATE ON public.entity_user_access
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.entity_user_access ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.entity_user_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.entity_user_access TO service_role;

-- ============================================================================
-- 4. Extend tenant_invitations without duplicating invitation infrastructure
-- ============================================================================
ALTER TABLE public.tenant_invitations
  ADD COLUMN IF NOT EXISTS organization_entity_id uuid
    REFERENCES public.organization_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_scope text DEFAULT 'SELF';

ALTER TABLE public.tenant_invitations
  DROP CONSTRAINT IF EXISTS tenant_invitations_access_scope_check;

ALTER TABLE public.tenant_invitations
  ADD CONSTRAINT tenant_invitations_access_scope_check
  CHECK (access_scope = ANY (ARRAY['SELF'::text, 'SELF_AND_DESCENDANTS'::text]));

CREATE OR REPLACE FUNCTION public.tenant_invitation_entity_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  entity_tenant uuid;
  role_tenant uuid;
BEGIN
  IF NEW.access_scope IS NULL THEN
    NEW.access_scope := 'SELF';
  END IF;

  IF NEW.organization_entity_id IS NOT NULL THEN
    SELECT tenant_id INTO entity_tenant
    FROM public.organization_entities
    WHERE id = NEW.organization_entity_id;

    IF entity_tenant IS NULL OR entity_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Invitation organization entity must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_role_id IS NOT NULL THEN
    SELECT tenant_id INTO role_tenant
    FROM public.tenant_roles
    WHERE id = NEW.tenant_role_id;

    IF role_tenant IS NULL OR role_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Invitation tenant role must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tenant_invitations_entity_same_tenant
  ON public.tenant_invitations;
CREATE TRIGGER tenant_invitations_entity_same_tenant
BEFORE INSERT OR UPDATE OF tenant_id, organization_entity_id, tenant_role_id, access_scope
ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public.tenant_invitation_entity_same_tenant();

-- ============================================================================
-- 5. Descendants, entity authorization, and account status
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_entity_descendant(
  ancestor_id uuid,
  descendant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    WITH RECURSIVE tree AS (
      SELECT id, parent_id
      FROM public.organization_entities
      WHERE parent_id = ancestor_id
      UNION ALL
      SELECT child.id, child.parent_id
      FROM public.organization_entities child
      JOIN tree ON child.parent_id = tree.id
    )
    SELECT 1 FROM tree WHERE id = descendant_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_entity(
  target_entity_id uuid,
  permission_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  target_record public.organization_entities%ROWTYPE;
  assigned_record public.organization_entities%ROWTYPE;
  assignment public.entity_user_access%ROWTYPE;
  has_permission boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_platform_user_active() THEN
    RETURN false;
  END IF;

  IF public.is_platform_superadmin() THEN
    RETURN true;
  END IF;

  SELECT * INTO target_record
  FROM public.organization_entities
  WHERE id = target_entity_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(target_record.is_active, true) = false THEN
    RETURN false;
  END IF;

  IF COALESCE(target_record.is_sitecorp_account, false) = true
     AND COALESCE(target_record.account_is_active, false) = false THEN
    RETURN false;
  END IF;

  FOR assignment IN
    SELECT eua.*
    FROM public.entity_user_access eua
    JOIN public.tenant_memberships tm ON tm.id = eua.tenant_membership_id
    JOIN public.tenant_roles tr ON tr.id = eua.tenant_role_id
    JOIN public.organization_entities assigned ON assigned.id = eua.organization_entity_id
    WHERE tm.user_id = auth.uid()
      AND tm.is_active = true
      AND eua.is_active = true
      AND tr.is_active = true
      AND COALESCE(assigned.is_active, true) = true
      AND tm.tenant_id = target_record.tenant_id
      AND assigned.tenant_id = target_record.tenant_id
  LOOP
    SELECT * INTO assigned_record
    FROM public.organization_entities
    WHERE id = assignment.organization_entity_id;

    IF COALESCE(assigned_record.is_sitecorp_account, false) = true
       AND COALESCE(assigned_record.account_is_active, false) = false THEN
      CONTINUE;
    END IF;

    IF assignment.access_scope = 'SELF'
       AND assignment.organization_entity_id <> target_entity_id THEN
      CONTINUE;
    END IF;

    IF assignment.access_scope = 'SELF_AND_DESCENDANTS'
       AND assignment.organization_entity_id <> target_entity_id
       AND NOT public.is_entity_descendant(
             assignment.organization_entity_id,
             target_entity_id
           ) THEN
      CONTINUE;
    END IF;

    IF permission_code IS NULL OR btrim(permission_code) = '' THEN
      RETURN true;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_role_permissions trp
      JOIN public.tenant_permissions tp ON tp.id = trp.tenant_permission_id
      WHERE trp.tenant_role_id = assignment.tenant_role_id
        AND tp.code = permission_code
    ) INTO has_permission;

    IF has_permission THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_view_entity(target_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $function$
  SELECT public.is_platform_superadmin()
      OR public.has_platform_permission('organizations.view_all')
      OR public.has_platform_permission('organizations.manage_all')
      OR public.can_access_entity(target_entity_id, NULL)
      OR public.can_access_entity(target_entity_id, 'organization.view')
      OR public.can_access_entity(target_entity_id, 'organization.manage');
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_entity(target_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $function$
  SELECT public.is_platform_superadmin()
      OR public.has_platform_permission('organizations.manage_all')
      OR public.can_access_entity(target_entity_id, 'organization.manage');
$function$;

-- ============================================================================
-- 6. Tenant-scoped permission and user-management helpers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.can_use_tenant_permission(
  target_tenant_id uuid,
  permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $function$
  SELECT public.is_platform_superadmin()
      OR public.has_platform_permission('organizations.manage_all')
      OR public.has_platform_permission('users.manage_all')
      OR EXISTS (
        SELECT 1
        FROM public.tenant_memberships tm
        JOIN public.tenant_user_roles tur ON tur.tenant_membership_id = tm.id
        JOIN public.tenant_roles tr ON tr.id = tur.tenant_role_id
        JOIN public.tenant_role_permissions trp ON trp.tenant_role_id = tr.id
        JOIN public.tenant_permissions tp ON tp.id = trp.tenant_permission_id
        WHERE tm.user_id = auth.uid()
          AND tm.tenant_id = target_tenant_id
          AND tm.is_active = true
          AND tr.tenant_id = target_tenant_id
          AND tr.is_active = true
          AND tp.code = permission_code
      );
$function$;

CREATE OR REPLACE FUNCTION public.can_invite_to_tenant(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $function$
  SELECT public.is_platform_superadmin()
      OR public.has_platform_permission('users.invite')
      OR public.has_platform_permission('users.manage_all')
      OR public.can_use_tenant_permission(target_tenant_id, 'users.invite');
$function$;

CREATE OR REPLACE FUNCTION public.can_view_platform_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $function$
  SELECT public.is_platform_superadmin()
      OR public.has_platform_permission('users.view_all')
      OR public.has_platform_permission('users.manage_all')
      OR EXISTS (
        SELECT 1
        FROM public.tenant_memberships target_tm
        WHERE target_tm.user_id = target_user_id
          AND target_tm.is_active = true
          AND public.can_use_tenant_permission(target_tm.tenant_id, 'users.view')
      );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_platform_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $function$
  SELECT public.is_platform_superadmin()
      OR public.has_platform_permission('users.manage_all')
      OR EXISTS (
        SELECT 1
        FROM public.tenant_memberships target_tm
        WHERE target_tm.user_id = target_user_id
          AND target_tm.is_active = true
          AND public.can_use_tenant_permission(target_tm.tenant_id, 'users.manage')
      );
$function$;

-- ============================================================================
-- 7. Invitation acceptance creates membership and entity-only access
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  invitation public.tenant_invitations%ROWTYPE;
  membership_id uuid;
  current_user_id uuid;
  current_email text;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO current_email
  FROM auth.users
  WHERE id = current_user_id;

  SELECT * INTO invitation
  FROM public.tenant_invitations
  WHERE id = invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation was not found';
  END IF;

  IF invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending';
  END IF;

  IF invitation.expires_at IS NOT NULL AND invitation.expires_at < now() THEN
    UPDATE public.tenant_invitations
    SET status = 'expired'
    WHERE id = invitation.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  IF lower(invitation.email) <> lower(COALESCE(current_email, '')) THEN
    RAISE EXCEPTION 'Invitation email does not match the signed-in user';
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, is_active)
  VALUES (invitation.tenant_id, current_user_id, true)
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET is_active = true, updated_at = now()
  RETURNING id INTO membership_id;

  IF invitation.organization_entity_id IS NOT NULL AND invitation.tenant_role_id IS NOT NULL THEN
    INSERT INTO public.entity_user_access (
      tenant_membership_id,
      organization_entity_id,
      tenant_role_id,
      access_scope,
      is_active,
      assigned_by
    )
    VALUES (
      membership_id,
      invitation.organization_entity_id,
      invitation.tenant_role_id,
      COALESCE(invitation.access_scope, 'SELF'),
      true,
      invitation.invited_by
    )
    ON CONFLICT (tenant_membership_id, organization_entity_id, tenant_role_id)
    DO UPDATE SET
      access_scope = EXCLUDED.access_scope,
      is_active = true,
      updated_at = now();
  ELSIF invitation.tenant_role_id IS NOT NULL THEN
    INSERT INTO public.tenant_user_roles (tenant_membership_id, tenant_role_id, assigned_by)
    VALUES (membership_id, invitation.tenant_role_id, invitation.invited_by)
    ON CONFLICT (tenant_membership_id, tenant_role_id) DO NOTHING;
  END IF;

  UPDATE public.tenant_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = invitation.id;

  RETURN membership_id;
END;
$function$;

-- ============================================================================
-- 8. Direct and inherited entity access listing
-- ============================================================================
CREATE OR REPLACE FUNCTION public.list_entity_user_access(target_entity_id uuid)
RETURNS TABLE (
  access_id uuid,
  tenant_membership_id uuid,
  user_id uuid,
  full_name text,
  username text,
  profile_is_active boolean,
  tenant_role_id uuid,
  role_name text,
  source_entity_id uuid,
  source_entity_name text,
  access_scope text,
  is_direct boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $function$
  WITH authorized AS (
    SELECT public.is_platform_superadmin()
        OR public.has_platform_permission('users.view_all')
        OR public.has_platform_permission('users.manage_all')
        OR public.can_access_entity(target_entity_id, 'users.view')
        OR public.can_access_entity(target_entity_id, 'users.manage') AS allowed
  )
  SELECT
    eua.id,
    eua.tenant_membership_id,
    tm.user_id,
    p.full_name,
    p.username,
    COALESCE(p.is_active, true),
    eua.tenant_role_id,
    tr.name,
    source.id,
    source.name,
    eua.access_scope,
    source.id = target_entity_id
  FROM public.entity_user_access eua
  JOIN public.tenant_memberships tm ON tm.id = eua.tenant_membership_id
  LEFT JOIN public.profiles p ON p.id = tm.user_id
  JOIN public.tenant_roles tr ON tr.id = eua.tenant_role_id
  JOIN public.organization_entities source ON source.id = eua.organization_entity_id
  CROSS JOIN authorized
  WHERE authorized.allowed
    AND eua.is_active = true
    AND tm.is_active = true
    AND tr.is_active = true
    AND COALESCE(source.is_active, true) = true
    AND (
      source.id = target_entity_id
      OR (
        eua.access_scope = 'SELF_AND_DESCENDANTS'
        AND public.is_entity_descendant(source.id, target_entity_id)
      )
    );
$function$;

-- ============================================================================
-- 9. Entity-aware organization RLS
-- ============================================================================
DROP POLICY IF EXISTS organization_entities_select_policy
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_select_tenant
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_select_superadmin
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_insert_policy
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_insert_tenant
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_update_policy
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_update_tenant
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_delete_policy
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_delete_tenant
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_select_access
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_insert_access
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_update_access
  ON public.organization_entities;
DROP POLICY IF EXISTS organization_entities_delete_access
  ON public.organization_entities;

CREATE POLICY organization_entities_select_access
ON public.organization_entities
FOR SELECT
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('organizations.view_all')
  OR public.has_platform_permission('organizations.manage_all')
  OR public.can_view_entity(id)
);

CREATE POLICY organization_entities_insert_access
ON public.organization_entities
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_platform_superadmin()
  OR public.has_platform_permission('organizations.manage_all')
  OR (
    entity_type = 'business_group'
    AND parent_id IS NULL
    AND public.can_use_tenant_permission(tenant_id, 'organization.manage')
  )
  OR (
    parent_id IS NOT NULL
    AND public.can_access_entity(parent_id, 'organization.manage')
  )
);

CREATE POLICY organization_entities_update_access
ON public.organization_entities
FOR UPDATE
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('organizations.manage_all')
  OR public.can_access_entity(id, 'organization.manage')
)
WITH CHECK (
  public.is_platform_superadmin()
  OR public.has_platform_permission('organizations.manage_all')
  OR public.can_access_entity(id, 'organization.manage')
);

CREATE POLICY organization_entities_delete_access
ON public.organization_entities
FOR DELETE
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('organizations.manage_all')
  OR public.can_access_entity(id, 'organization.manage')
);

-- ============================================================================
-- 10. Entity access RLS
-- ============================================================================
DROP POLICY IF EXISTS entity_user_access_select ON public.entity_user_access;
DROP POLICY IF EXISTS entity_user_access_insert ON public.entity_user_access;
DROP POLICY IF EXISTS entity_user_access_update ON public.entity_user_access;
DROP POLICY IF EXISTS entity_user_access_delete ON public.entity_user_access;

CREATE POLICY entity_user_access_select
ON public.entity_user_access
FOR SELECT
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.view_all')
  OR public.has_platform_permission('users.manage_all')
  OR public.can_view_entity(organization_entity_id)
  OR EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.id = tenant_membership_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY entity_user_access_insert
ON public.entity_user_access
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.manage_all')
  OR public.can_access_entity(organization_entity_id, 'users.manage')
);

CREATE POLICY entity_user_access_update
ON public.entity_user_access
FOR UPDATE
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.manage_all')
  OR public.can_access_entity(organization_entity_id, 'users.manage')
)
WITH CHECK (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.manage_all')
  OR public.can_access_entity(organization_entity_id, 'users.manage')
);

CREATE POLICY entity_user_access_delete
ON public.entity_user_access
FOR DELETE
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.manage_all')
  OR public.can_access_entity(organization_entity_id, 'users.manage')
);

-- ============================================================================
-- 11. Entity-aware invitation RLS
-- ============================================================================
DROP POLICY IF EXISTS tenant_invitations_select ON public.tenant_invitations;
DROP POLICY IF EXISTS tenant_invitations_insert ON public.tenant_invitations;
DROP POLICY IF EXISTS tenant_invitations_update ON public.tenant_invitations;
DROP POLICY IF EXISTS tenant_invitations_delete ON public.tenant_invitations;

CREATE POLICY tenant_invitations_select
ON public.tenant_invitations
FOR SELECT
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.view_all')
  OR public.has_platform_permission('users.manage_all')
  OR public.can_use_tenant_permission(tenant_id, 'users.view')
  OR public.can_use_tenant_permission(tenant_id, 'users.invite')
  OR (
    organization_entity_id IS NOT NULL
    AND public.can_access_entity(organization_entity_id, 'users.invite')
  )
);

CREATE POLICY tenant_invitations_insert
ON public.tenant_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.invite')
  OR public.has_platform_permission('users.manage_all')
  OR (
    organization_entity_id IS NULL
    AND public.can_invite_to_tenant(tenant_id)
  )
  OR (
    organization_entity_id IS NOT NULL
    AND tenant_role_id IS NOT NULL
    AND public.can_access_entity(organization_entity_id, 'users.invite')
  )
);

CREATE POLICY tenant_invitations_update
ON public.tenant_invitations
FOR UPDATE
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.manage_all')
  OR (
    organization_entity_id IS NULL
    AND public.can_invite_to_tenant(tenant_id)
  )
  OR (
    organization_entity_id IS NOT NULL
    AND public.can_access_entity(organization_entity_id, 'users.invite')
  )
)
WITH CHECK (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.manage_all')
  OR (
    organization_entity_id IS NULL
    AND public.can_invite_to_tenant(tenant_id)
  )
  OR (
    organization_entity_id IS NOT NULL
    AND public.can_access_entity(organization_entity_id, 'users.invite')
  )
);

CREATE POLICY tenant_invitations_delete
ON public.tenant_invitations
FOR DELETE
TO authenticated
USING (
  public.is_platform_superadmin()
  OR public.has_platform_permission('users.manage_all')
  OR (
    organization_entity_id IS NULL
    AND public.can_invite_to_tenant(tenant_id)
  )
  OR (
    organization_entity_id IS NOT NULL
    AND public.can_access_entity(organization_entity_id, 'users.invite')
  )
);

-- ============================================================================
-- 12. Authorized profile and membership visibility
-- ============================================================================
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (public.can_view_platform_user(id));

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.can_manage_platform_user(id))
WITH CHECK (public.can_manage_platform_user(id));

DROP POLICY IF EXISTS memberships_select_authorized
  ON public.tenant_memberships;
CREATE POLICY memberships_select_authorized
ON public.tenant_memberships
FOR SELECT
TO authenticated
USING (
  public.has_platform_permission('users.view_all')
  OR public.has_platform_permission('users.manage_all')
  OR public.can_use_tenant_permission(tenant_id, 'users.view')
);

-- ============================================================================
-- 13. Function grants
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.can_access_entity(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_entity(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_entity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_entity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_entity_descendant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_entity_descendant(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_use_tenant_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_tenant_permission(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_invite_to_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_invite_to_tenant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_platform_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_platform_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_platform_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_platform_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_entity_user_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_entity_user_access(uuid) TO service_role;
