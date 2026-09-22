-- 20260922_02_entity_access_test_data.sql
-- Versioned audit record of the test hierarchy and access assignments applied to
-- the connected Supabase database through the Dyad SQL console.
--
-- Tenant A is reused. No tenant, auth user, platform role, or permission was
-- deleted or recreated.

-- ============================================================================
-- 1. Reusable tenant roles
-- ============================================================================
INSERT INTO public.tenant_roles (tenant_id, name, description, is_system_role, is_active)
SELECT t.id, role.name, role.description, false, true
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Viewer', 'Read-only access to assigned organization entities'),
    ('HR Manager', 'Manage users and organization data for assigned entities')
) AS role(name, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tenant_roles existing
  WHERE existing.tenant_id = t.id
    AND existing.name = role.name
);

-- ============================================================================
-- 2. Role permissions
-- ============================================================================
INSERT INTO public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
SELECT tr.id, tp.id
FROM public.tenant_roles tr
JOIN public.tenant_permissions tp ON (
  (
    tr.name = 'Viewer'
    AND tp.code IN (
      'organization.view',
      'users.view',
      'candidates.view',
      'hiring.view',
      'staffing.view',
      'reports.view'
    )
  )
  OR (
    tr.name = 'HR Manager'
    AND tp.code IN (
      'organization.view',
      'organization.manage',
      'users.view',
      'users.manage',
      'users.invite',
      'candidates.view',
      'candidates.manage',
      'hiring.view',
      'staffing.view',
      'staffing.manage'
    )
  )
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tenant_role_permissions existing
  WHERE existing.tenant_role_id = tr.id
    AND existing.tenant_permission_id = tp.id
);

-- ============================================================================
-- 3. Requested Tenant A hierarchy
-- ============================================================================
WITH tenant AS (
  SELECT id
  FROM public.tenants
  WHERE code = 'TENANT-A'
  LIMIT 1
), grupo AS (
  INSERT INTO public.organization_entities (
    tenant_id, parent_id, entity_type, name, code, regime_id, status, description,
    is_active, is_sitecorp_account, account_is_active, account_code
  )
  SELECT
    tenant.id, NULL, 'business_group', 'Grupo A', 'GRUPO-A', 'PRESUPUESTADA', 'active',
    'Grupo empresarial de prueba', true, true, true, 'CUENTA-GRUPO-A'
  FROM tenant
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.organization_entities existing
    WHERE existing.tenant_id = tenant.id
      AND existing.code = 'GRUPO-A'
  )
  RETURNING id
), empresa_a AS (
  INSERT INTO public.organization_entities (
    tenant_id, parent_id, entity_type, name, code, regime_id, status, description,
    address, municipality, province, postal_code,
    is_active, is_sitecorp_account, account_is_active, account_code
  )
  SELECT
    tenant.id,
    (SELECT id FROM public.organization_entities
      WHERE tenant_id = tenant.id AND code = 'GRUPO-A' LIMIT 1),
    'company', 'Empresa A', 'EMPRESA-A', 'EMPRESARIAL', 'active',
    'Empresa principal de prueba',
    'Calle Ejemplo 1', 'Municipio A', 'Provincia A', '00000',
    true, true, true, 'CUENTA-EMPRESA-A'
  FROM tenant
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.organization_entities existing
    WHERE existing.tenant_id = tenant.id
      AND existing.code = 'EMPRESA-A'
  )
  RETURNING id
), empresa_b AS (
  INSERT INTO public.organization_entities (
    tenant_id, parent_id, entity_type, name, code, regime_id, status, description,
    is_active, is_sitecorp_account, account_is_active, account_code
  )
  SELECT
    tenant.id,
    (SELECT id FROM public.organization_entities
      WHERE tenant_id = tenant.id AND code = 'GRUPO-A' LIMIT 1),
    'company', 'Empresa B', 'EMPRESA-B', 'EMPRESARIAL', 'active',
    'Empresa secundaria de prueba', true, false, false, NULL
  FROM tenant
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.organization_entities existing
    WHERE existing.tenant_id = tenant.id
      AND existing.code = 'EMPRESA-B'
  )
  RETURNING id
), ueb_a1 AS (
  INSERT INTO public.organization_entities (
    tenant_id, parent_id, entity_type, name, code, regime_id, status, description,
    is_active, is_sitecorp_account, account_is_active, account_code
  )
  SELECT
    tenant.id,
    (SELECT id FROM public.organization_entities
      WHERE tenant_id = tenant.id AND code = 'EMPRESA-A' LIMIT 1),
    'ueb', 'UEB A1', 'UEB-A1', 'PRESUPUESTADA', 'active',
    'Unidad empresarial base A1', true, true, true, 'CUENTA-UEB-A1'
  FROM tenant
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.organization_entities existing
    WHERE existing.tenant_id = tenant.id
      AND existing.code = 'UEB-A1'
  )
  RETURNING id
), ueb_a2 AS (
  INSERT INTO public.organization_entities (
    tenant_id, parent_id, entity_type, name, code, regime_id, status, description,
    is_active, is_sitecorp_account, account_is_active, account_code
  )
  SELECT
    tenant.id,
    (SELECT id FROM public.organization_entities
      WHERE tenant_id = tenant.id AND code = 'EMPRESA-A' LIMIT 1),
    'ueb', 'UEB A2', 'UEB-A2', 'PRESUPUESTADA', 'active',
    'Unidad empresarial base A2', true, false, false, NULL
  FROM tenant
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.organization_entities existing
    WHERE existing.tenant_id = tenant.id
      AND existing.code = 'UEB-A2'
  )
  RETURNING id
)
SELECT 'Tenant A organization hierarchy ready' AS result;

-- ============================================================================
-- 4. Access assignments for the existing non-SuperAdmin test member
-- ============================================================================
INSERT INTO public.entity_user_access (
  tenant_membership_id,
  organization_entity_id,
  tenant_role_id,
  access_scope,
  is_active,
  assigned_by
)
SELECT
  tm.id,
  entity.id,
  role.id,
  access.access_scope,
  true,
  admin_assignment.user_id
FROM public.tenant_memberships tm
JOIN public.tenants t ON t.id = tm.tenant_id AND t.code = 'TENANT-A'
JOIN public.profiles member ON member.id = tm.user_id AND member.username = 'isael'
JOIN public.organization_entities entity ON entity.tenant_id = tm.tenant_id
JOIN public.tenant_roles role ON role.tenant_id = tm.tenant_id
JOIN (VALUES
  ('GRUPO-A', 'Viewer', 'SELF'),
  ('EMPRESA-A', 'Viewer', 'SELF_AND_DESCENDANTS'),
  ('UEB-A1', 'HR Manager', 'SELF')
) AS access(entity_code, role_name, access_scope)
  ON access.entity_code = entity.code
 AND access.role_name = role.name
CROSS JOIN (
  SELECT pur.user_id
  FROM public.platform_user_roles pur
  JOIN public.platform_roles pr ON pr.id = pur.platform_role_id
  JOIN public.profiles admin ON admin.id = pur.user_id
  WHERE pr.name = 'SuperAdmin'
    AND pr.is_system_role = true
    AND admin.username = 'admin'
  LIMIT 1
) AS admin_assignment
WHERE NOT EXISTS (
  SELECT 1
  FROM public.entity_user_access existing
  WHERE existing.tenant_membership_id = tm.id
    AND existing.organization_entity_id = entity.id
    AND existing.tenant_role_id = role.id
);
