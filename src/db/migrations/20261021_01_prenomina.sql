-- ============================================================================
-- FASE 21 — PRENÓMINA (Fase 1): período mensual, salario escala, nocturnidad
-- Registro de auditoría de la migración incremental aplicada en BD.
--
-- NO es un archivo de migración de Supabase (no vive en supabase/migrations/).
-- Se conserva como evidencia del cambio real ejecutado contra la base de datos.
--
-- ALCANCE (Fase 1):
--   · Período por entidad + año + mes (idempotente, UNIQUE).
--   · Trabajadores ACTIVOS según el modelo actual (workers.employment_status +
--     worker_position_assignments actual → Puesto → Cargo → Grupo → Escala).
--   · Días trabajados (decimales), horas = días × jornada del Puesto.
--   · Salario escala: tarifa horaria = salario / 190.6 (divisor FIJO).
--   · Nocturnidad: tramos 19:00–23:00 (0,60/h) y 23:00–07:00 (1,15/h), con
--     solapamiento real y cruce de medianoche; varios registros por mes.
--   · Total trabajador = pago salario escala + total nocturnidad.
--   · Estados BORRADOR / CERRADA con cierre, reapertura y validación de cierre.
--
-- CLA queda EXPLÍCITAMENTE FUERA de esta fase (no se inventa su regla).
--
-- SNAPSHOT: cada registro mensual guarda cargo/puesto/grupo/escala/salario/jornada
-- utilizados, de modo que un cambio posterior de los datos maestros NO altera un
-- período histórico.
--
-- ESCRITURA: SIEMPRE por RPC SECURITY DEFINER con validación backend
-- (no hay políticas INSERT/UPDATE/DELETE para `authenticated`).
-- RLS: SELECT gobernado por can_access_entity(...,'prenomina.view'|'prenomina.manage').
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CATÁLOGO DE PERMISOS INTERNOS (auto-otorgados al rol Administrador por el
--    trigger `tenant_permissions_autogrant_system`).
-- ---------------------------------------------------------------------------
insert into public.tenant_permissions (code, description) values
  ('prenomina.view','Ver prenómina (períodos, cálculos y exportación)'),
  ('prenomina.manage','Gestionar prenómina (crear período, días, nocturnidad, cerrar/reabrir)')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------------
create table public.prenomina_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_entity_id uuid not null references public.organization_entities(id) on delete cascade,
  period_year integer not null,
  period_month integer not null,
  status text not null default 'BORRADOR',
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone,
  closed_by uuid,
  constraint prenomina_periods_month_check check (period_month between 1 and 12),
  constraint prenomina_periods_year_check check (period_year between 2000 and 2100),
  constraint prenomina_periods_status_check check (status in ('BORRADOR','CERRADA')),
  constraint prenomina_periods_entity_period_unique unique (organization_entity_id, period_year, period_month)
);

create table public.prenomina_worker_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.prenomina_periods(id) on delete cascade,
  organization_entity_id uuid not null references public.organization_entities(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  worker_name_snapshot text not null,
  identification_snapshot text,
  area_name_snapshot text,
  job_name_snapshot text,
  position_name_snapshot text,
  salary_group_id uuid references public.salary_groups(id) on delete set null,
  salary_group_sequence integer,
  salary_scale_id uuid references public.salary_scales(id) on delete set null,
  salary_scale_amount numeric(14,2),
  salary_currency text,
  workday_hours numeric(6,2),
  worked_days numeric(8,2) not null default 0,
  worked_hours numeric(12,4) not null default 0,
  hourly_scale_rate numeric(14,6) not null default 0,
  scale_salary_payment numeric(14,2) not null default 0,
  night_payment_19_23 numeric(14,2) not null default 0,
  night_payment_23_07 numeric(14,2) not null default 0,
  total_night_payment numeric(14,2) not null default 0,
  total_payment numeric(14,2) not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint prenomina_worker_entries_worked_days_check check (worked_days >= 0),
  constraint prenomina_worker_entries_salary_check check (salary_scale_amount is null or salary_scale_amount >= 0),
  constraint prenomina_worker_entries_workday_check check (workday_hours is null or workday_hours > 0),
  constraint prenomina_worker_entries_worked_hours_check check (worked_hours >= 0),
  constraint prenomina_worker_entries_payments_check check (
    scale_salary_payment >= 0 and night_payment_19_23 >= 0 and night_payment_23_07 >= 0
    and total_night_payment >= 0 and total_payment >= 0
  ),
  constraint prenomina_worker_entries_period_worker_unique unique (period_id, worker_id)
);

create table public.prenomina_night_entries (
  id uuid primary key default gen_random_uuid(),
  worker_entry_id uuid not null references public.prenomina_worker_entries(id) on delete cascade,
  organization_entity_id uuid not null references public.organization_entities(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  nights_worked integer not null,
  hours_19_23_per_night numeric(6,2) not null default 0,
  hours_23_07_per_night numeric(6,2) not null default 0,
  payment_19_23 numeric(14,2) not null default 0,
  payment_23_07 numeric(14,2) not null default 0,
  total_payment numeric(14,2) not null default 0,
  display_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint prenomina_night_entries_nights_check check (nights_worked > 0),
  constraint prenomina_night_entries_payments_check check (
    hours_19_23_per_night >= 0 and hours_23_07_per_night >= 0
    and payment_19_23 >= 0 and payment_23_07 >= 0 and total_payment >= 0
  )
);

create index idx_prenomina_periods_entity on public.prenomina_periods (organization_entity_id, period_year desc, period_month desc);
create index idx_prenomina_worker_entries_period on public.prenomina_worker_entries (period_id);
create index idx_prenomina_worker_entries_entity on public.prenomina_worker_entries (organization_entity_id);
create index idx_prenomina_night_entries_entry on public.prenomina_night_entries (worker_entry_id);

alter table public.prenomina_periods enable row level security;
alter table public.prenomina_worker_entries enable row level security;
alter table public.prenomina_night_entries enable row level security;
grant select on table public.prenomina_periods to authenticated;
grant select on table public.prenomina_worker_entries to authenticated;
grant select on table public.prenomina_night_entries to authenticated;
grant select, insert, update, delete on table public.prenomina_periods to service_role;
grant select, insert, update, delete on table public.prenomina_worker_entries to service_role;
grant select, insert, update, delete on table public.prenomina_night_entries to service_role;

create policy prenomina_periods_select on public.prenomina_periods for select to authenticated
  using (public.can_access_entity(organization_entity_id, 'prenomina.view') or public.can_access_entity(organization_entity_id, 'prenomina.manage'));
create policy prenomina_worker_entries_select on public.prenomina_worker_entries for select to authenticated
  using (public.can_access_entity(organization_entity_id, 'prenomina.view') or public.can_access_entity(organization_entity_id, 'prenomina.manage'));
create policy prenomina_night_entries_select on public.prenomina_night_entries for select to authenticated
  using (public.can_access_entity(organization_entity_id, 'prenomina.view') or public.can_access_entity(organization_entity_id, 'prenomina.manage'));

-- ---------------------------------------------------------------------------
-- 3. MOTOR (resumen; definiciones completas aplicadas en BD)
-- ---------------------------------------------------------------------------
--   prenomina_monthly_hours_divisor()      → 190.6 (FIJO, constante de dominio)
--   prenomina_night_rate_19_23()           → 0.60
--   prenomina_night_rate_23_07()           → 1.15
--   prenomina_night_overlap(start,end)     → (horas tramo 19–23, horas tramo 23–07)
--   prenomina_recalc_entry(entry_id)       → recalcula horas, tarifa, importes y total
--   prenomina_upsert_inputs(entry, días, salario, jornada) → valida y recalcula
--   prenomina_save_night(entry, night, inicio, fin, noches) → valida, calcula y recalcula
--   prenomina_delete_night(night)          → elimina y recalcula
--   prenomina_create_period(entidad, año, mes) → crea (idempotente) + carga trabajadores
--   prenomina_refresh_workers(period)      → refresca snapshots + añade activos faltantes
--   prenomina_close_period(period)         → valida (salario/jornada) y cierra
--   prenomina_reopen_period(period)        → reabre (BORRADOR)
-- ============================================================================