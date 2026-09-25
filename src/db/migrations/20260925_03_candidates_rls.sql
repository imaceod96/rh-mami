-- 20260925_03_candidates_rls.sql
-- RLS policies for public.candidates
--
-- Versioned audit record of SQL applied directly to the connected Supabase database.
-- The Supabase-managed migrations directory is externally controlled and is not edited manually.
--
-- SELECT: is_platform_superadmin() OR can_access_entity(organization_entity_id, 'candidates.view') OR can_access_entity(organization_entity_id, 'candidates.manage')
-- INSERT: is_platform_superadmin() OR can_access_entity(organization_entity_id, 'candidates.manage')
-- UPDATE: same as INSERT
-- DELETE: NOT allowed (candidates are archived instead)

-- ============================================================================
-- RLS Policies for public.candidates
-- ============================================================================

-- SELECT policy
CREATE POLICY "candidates_select_access" ON public.candidates
  FOR SELECT TO authenticated
  USING (
    public.is_platform_superadmin()
    OR public.can_access_entity(organization_entity_id, 'candidates.view')
    OR public.can_access_entity(organization_entity_id, 'candidates.manage')
  );

-- INSERT policy
CREATE POLICY "candidates_insert_access" ON public.candidates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_superadmin()
    OR public.can_access_entity(organization_entity_id, 'candidates.manage')
  );

-- UPDATE policy
CREATE POLICY "candidates_update_access" ON public.candidates
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_superadmin()
    OR public.can_access_entity(organization_entity_id, 'candidates.manage')
  )
  WITH CHECK (
    public.is_platform_superadmin()
    OR public.can_access_entity(organization_entity_id, 'candidates.manage')
  );

-- NO DELETE policy - candidates are archived via status change