-- ============================================================================
-- FASE 19 — LICENCIAS / CERTIFICADOS MÉDICOS
-- Registro de auditoría de la migración incremental aplicada en BD.
--
-- NO es un archivo de migración de Supabase (no vive en supabase/migrations/).
-- Se conserva como evidencia del cambio real ejecutado contra la base de datos.
--
-- DECISIONES DE DISEÑO (auditadas contra el schema REAL):
--   · Cada certificado es un EVENTO registrado en el historial del trabajador.
--   · NO hay saldo, devengo, acumulación mensual, máximo anual (§2/§82).
--   · La cantidad de días se introduce explícitamente, NO se calcula de fechas (§7).
--   · El total anual se deriva de SUM(days) WHERE year(start_date) = selectedYear (§46).
--   · El documento es obligatorio y se almacena en storage privado (§11/§14).
--   · RLS: SELECT gobernado por can_access_entity(...,'medical_certificates.view'|'manage').
--   · La ESCRITURA se realiza SIEMPRE por RPC SECURITY DEFINER con validación backend.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CATÁLOGO DE PERMISOS INTERNOS (auto-otorgados al rol Administrador de cada
--    entidad SiteCorp por el trigger `tenant_permissions_autogrant_system`).
-- ---------------------------------------------------------------------------
insert into public.tenant_permissions (code, description) values
  ('medical_certificates.view','Ver certificados médicos de la entidad'),
  ('medical_certificates.manage','Gestionar certificados médicos de la entidad')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. TABLA
-- ---------------------------------------------------------------------------
create table public.worker_medical_certificates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_entity_id uuid not null references public.organization_entities(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  start_date date not null,
  return_date date not null,
  days integer not null,
  document_id uuid references public.worker_documents(id) on delete set null,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint worker_medical_certificates_days_check check (days > 0),
  constraint worker_medical_certificates_dates_check check (return_date > start_date)
);

create index idx_worker_medical_certificates_worker on public.worker_medical_certificates (worker_id, start_date);
create index idx_worker_medical_certificates_entity on public.worker_medical_certificates (organization_entity_id);

alter table public.worker_medical_certificates enable row level security;
grant select on table public.worker_medical_certificates to authenticated;
grant select, insert, update, delete on table public.worker_medical_certificates to service_role;

create policy worker_medical_certificates_select on public.worker_medical_certificates for select to authenticated
  using (public.can_access_entity(organization_entity_id, 'medical_certificates.view') or public.can_access_entity(organization_entity_id, 'medical_certificates.manage'));

-- ---------------------------------------------------------------------------
-- 3. RPCs (resumen; definiciones completas aplicadas en BD)
-- ---------------------------------------------------------------------------
--   create_worker_medical_certificate(...) → uuid (transaccional)
--   get_worker_medical_certificate(...)    → jsonb
--   list_worker_medical_certificates(...)  → setof (histórico + total anual)
--   update_worker_medical_certificate(...) → void (transaccional)
-- ============================================================================
