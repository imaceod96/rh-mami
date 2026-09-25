-- 20260925_01_is_platform_user.sql
-- Version is_platform_user() as a database migration.
--
-- This file is the versioned audit record of SQL applied directly to the
-- connected Supabase database through the Dyad SQL console. The Supabase-managed
-- migrations directory is externally controlled and is not edited manually.
--
-- Returns TRUE when the authenticated user has at least ONE active Platform
-- Role assigned through platform_user_roles -> platform_roles (is_active).
-- SuperAdmin naturally satisfies this (holds an active platform role) and is
-- additionally OR-ed client-side in AuthContext.
--
-- NOTE: is_platform_user_active() is intentionally NOT used — it only checks
-- profiles.is_active and does not prove the user holds a Platform Role.
--
-- Idempotent: CREATE OR REPLACE re-asserts the intended current definition.

-- ============================================================================
-- Function: public.is_platform_user()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_platform_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_user_roles pur
    JOIN public.platform_roles pr
      ON pr.id = pur.platform_role_id
    WHERE pur.user_id = auth.uid()
      AND pr.is_active = true
  );
$$;

-- ============================================================================
-- Execute grants
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.is_platform_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_user() TO service_role;
