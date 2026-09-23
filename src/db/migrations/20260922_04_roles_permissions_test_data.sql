-- 20260922_04_roles_permissions_test_data.sql
-- Versioned audit record of Phase 4.2B functional test data.
--
-- These records were created/updated through the atomic save RPCs while running
-- as the existing Platform SuperAdmin. No auth user, tenant, or system role was
-- recreated.

-- ============================================================================
-- 1. Restricted platform test role
-- ============================================================================
INSERT INTO public.platform_roles (name, description, is_system_role, is_active)
SELECT 'Platform Test', 'Test platform role', false, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.platform_roles existing
  WHERE lower(btrim(existing.name)) = 'platform test'
);

UPDATE public.platform_roles
SET description = 'Test platform role'
WHERE lower(btrim(name)) = 'platform test'
  AND is_system_role = false;

INSERT INTO public.platform_role_permissions (platform_role_id, platform_permission_id)
SELECT role.id, permission.id
FROM public.platform_roles role
JOIN public.platform_permissions permission ON permission.code IN (
  'organizations.view_all',
  'users.view_all'
)
WHERE lower(btrim(role.name)) = 'platform test'
  AND role.is_system_role = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.platform_role_permissions existing
    WHERE existing.platform_role_id = role.id
      AND existing.platform_permission_id = permission.id
  );

DELETE FROM public.platform_role_permissions prp
USING public.platform_roles role
WHERE prp.platform_role_id = role.id
  AND lower(btrim(role.name)) = 'platform test'
  AND role.is_system_role = false
  AND prp.platform_permission_id NOT IN (
    SELECT id FROM public.platform_permissions
    WHERE code IN ('organizations.view_all', 'users.view_all')
  );

-- ============================================================================
-- 2. Existing test member assignment
-- ============================================================================
INSERT INTO public.platform_user_roles (user_id, platform_role_id, assigned_by)
SELECT member.id, role.id, admin_user.id
FROM public.profiles member
JOIN public.profiles admin_user ON admin_user.username = 'admin'
JOIN public.platform_roles role ON lower(btrim(role.name)) = 'platform test'
WHERE member.username = 'isael'
ON CONFLICT (user_id, platform_role_id) DO NOTHING;

-- ============================================================================
-- 3. Organization test role in Tenant A
-- ============================================================================
INSERT INTO public.tenant_roles (tenant_id, name, description, is_system_role, is_active)
SELECT tenant.id, 'RRHH Test', 'Test organization role for human resources', false, true
FROM public.tenants tenant
WHERE tenant.code = 'TENANT-A'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_roles existing
    WHERE existing.tenant_id = tenant.id
      AND lower(btrim(existing.name)) = 'rrhh test'
  );

UPDATE public.tenant_roles
SET description = 'Test organization role for human resources'
WHERE tenant_id = (SELECT id FROM public.tenants WHERE code = 'TENANT-A')
  AND lower(btrim(name)) = 'rrhh test'
  AND is_system_role = false;

INSERT INTO public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
SELECT role.id, permission.id
FROM public.tenant_roles role
JOIN public.tenants tenant ON tenant.id = role.tenant_id AND tenant.code = 'TENANT-A'
JOIN public.tenant_permissions permission ON permission.code IN (
  'organization.view',
  'organization.manage',
  'users.view',
  'users.manage',
  'users.invite',
  'candidates.view',
  'staffing.view',
  'roles.view'
)
WHERE lower(btrim(role.name)) = 'rrhh test'
  AND role.is_system_role = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_role_permissions existing
    WHERE existing.tenant_role_id = role.id
      AND existing.tenant_permission_id = permission.id
  );

DELETE FROM public.tenant_role_permissions trp
USING public.tenant_roles role
JOIN public.tenants tenant ON tenant.id = role.tenant_id AND tenant.code = 'TENANT-A'
WHERE trp.tenant_role_id = role.id
  AND lower(btrim(role.name)) = 'rrhh test'
  AND role.is_system_role = false
  AND trp.tenant_permission_id NOT IN (
    SELECT id FROM public.tenant_permissions
    WHERE code IN (
      'organization.view',
      'organization.manage',
      'users.view',
      'users.manage',
      'users.invite',
      'candidates.view',
      'staffing.view',
      'roles.view'
    )
  );
