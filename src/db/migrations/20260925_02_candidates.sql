-- 20260925_02_candidates.sql
-- Create public.candidates table for entity candidate management.
--
-- Versioned audit record of SQL applied directly to the connected Supabase database.
-- The Supabase-managed migrations directory is externally controlled and is not edited manually.
--
-- Fields:
--   id uuid PK
--   tenant_id uuid NOT NULL → tenants(id)
--   organization_entity_id uuid NOT NULL → organization_entities(id)
--   first_name text NOT NULL
--   first_surname text NOT NULL
--   second_surname text nullable
--   identification text NOT NULL
--   birth_date date nullable
--   gender_id → genders(id) nullable
--   marital_status_id → marital_statuses(id) nullable
--   phone text nullable
--   email text nullable
--   address text nullable
--   municipality text nullable
--   province text nullable
--   education_level_id → education_levels(id) nullable
--   specialty text nullable
--   status text NOT NULL DEFAULT 'active' (active | archived)
--   created_at timestamptz default now()
--   updated_at timestamptz default now()
--
-- Indexes: tenant_id, organization_entity_id, identification, status
-- RLS: enabled, no policies yet
-- Updated trigger: handle_updated_at()
-- Tenant consistency: tenant_id and organization_entity_id must belong to the same tenant

-- ============================================================================
-- Table: public.candidates
-- ============================================================================
CREATE TABLE public.candidates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  organization_entity_id uuid NOT NULL,
  first_name text NOT NULL,
  first_surname text NOT NULL,
  second_surname text,
  identification text NOT NULL,
  birth_date date,
  gender_id uuid,
  marital_status_id uuid,
  phone text,
  email text,
  address text,
  municipality text,
  province text,
  education_level_id uuid,
  specialty text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT candidates_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT candidates_tenant_entity_same_tenant CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_entities oe
      WHERE oe.id = organization_entity_id AND oe.tenant_id = tenant_id
    )
  )
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX idx_candidates_tenant_id ON public.candidates (tenant_id);
CREATE INDEX idx_candidates_organization_entity_id ON public.candidates (organization_entity_id);
CREATE INDEX idx_candidates_identification ON public.candidates (identification);
CREATE INDEX idx_candidates_status ON public.candidates (status);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Updated at trigger
-- ============================================================================
CREATE TRIGGER candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO service_role;
