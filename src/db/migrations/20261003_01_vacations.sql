-- ============================================================================
-- FASE 18 — VACACIONES, DEVENGO AUTOMÁTICO, SALDO E HISTORIAL
-- Registro de auditoría de la migración incremental aplicada en BD.
--
-- NO es un archivo de migración de Supabase (no vive en supabase/migrations/).
-- Se conserva como evidencia del cambio real ejecutado contra la base de datos.
--
-- DECISIONES DE DISEÑO (auditadas contra el schema REAL):
--   · El horario laboral del Puesto YA está estructurado y normalizado en
--     `position_schedule_segments` (un registro por día de la semana + rango).
--     Los "días laborables" de un Puesto = DISTINCT day_of_week de sus segmentos.
--     No se interpreta texto libre ni se asume lunes-viernes globalmente (§4/§89/§90).
--   · La posición que ocupaba un trabajador en una fecha se reconstruye con
--     `worker_position_assignments` (start_date/end_date). Un cambio de Puesto
--     a mitad de mes se resuelve por fecha (§11/§12/§93).
--   · La fecha de alta canónica = primera assignment; fallback `workers.hire_date`.
--     No se introduce una segunda fecha de alta (§8/§59).
--   · El devengo es un LEDGER de movimientos (`worker_vacation_movements`), no una
--     cifra manual. El saldo = SUM(amount) (§14/§17/§161).
--   · Derecho anual de referencia = 24; máximo acumulable = 24 (§3/§18).
--   · Consumo = días naturales − domingos del período (los sábados SÍ consumen) (§39/§42).
--   · El saldo inicial de trabajadores históricos = movimiento INITIAL_BALANCE con
--     fecha de corte; el cálculo automático comienza el mes siguiente al corte (§61/§62/§64).
--
-- IDEMPOTENCIA:
--   · UNIQUE (worker_id, accrual_year, accrual_month) WHERE movement_type='ACCRUAL'
--   · UNIQUE (worker_id, request_id) WHERE request_id IS NOT NULL
-- CONCURRENCIA: pg_advisory_xact_lock por trabajador en devengo y consumo (§96).
-- RLS: ambas tablas con SELECT gobernado por `can_access_entity(...,'vacations.view'|'vacations.manage')`.
--      La ESCRITURA se realiza SIEMPRE por RPC SECURITY DEFINER con validación backend
--      (no hay políticas INSERT/UPDATE/DELETE para `authenticated`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CATÁLOGO DE PERMISOS INTERNOS (auto-otorgados al rol Administrador de cada
--    entidad SiteCorp por el trigger `tenant_permissions_autogrant_system`).
-- ---------------------------------------------------------------------------
insert into public.tenant_permissions (code, description) values
  ('vacations.view','Ver vacaciones de la entidad'),
  ('vacations.manage','Gestionar vacaciones de la entidad')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------------
create table public.worker_vacations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_entity_id uuid not null references public.organization_entities(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  natural_days integer not null,
  sundays_count integer not null default 0,
  charged_days numeric(10,4) not null,
  status text not null default 'SCHEDULED',
  notes text,
  request_id uuid,
  created_by uuid,
  cancelled_by uuid,
  cancelled_at timestamp with time zone,
  cancel_reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint worker_vacations_dates_check check (end_date >= start_date),
  constraint worker_vacations_natural_check check (natural_days between 1 and 15),
  constraint worker_vacations_charged_check check (charged_days >= 0),
  constraint worker_vacations_status_check check (status in ('SCHEDULED','TAKEN','CANCELLED'))
);

create table public.worker_vacation_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_entity_id uuid not null references public.organization_entities(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  movement_type text not null,
  amount numeric(10,4) not null,
  calculated_amount numeric(10,4),
  effective_date date not null,
  accrual_year integer,
  accrual_month integer,
  working_days_month integer,
  working_days_year integer,
  position_id uuid references public.organization_positions(id) on delete set null,
  schedule_weekdays integer[],
  vacation_id uuid references public.worker_vacations(id) on delete set null,
  description text,
  reason text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  constraint worker_vacation_movements_type_check check (movement_type in ('ACCRUAL','VACATION_USAGE','ADJUSTMENT','INITIAL_BALANCE','REVERSAL'))
);

create unique index uq_worker_vacation_accrual on public.worker_vacation_movements (worker_id, accrual_year, accrual_month) where movement_type = 'ACCRUAL';
create unique index uq_worker_vacations_request on public.worker_vacations (worker_id, request_id) where request_id is not null;
create index idx_worker_vacation_movements_worker on public.worker_vacation_movements (worker_id, effective_date, created_at);
create index idx_worker_vacation_movements_entity on public.worker_vacation_movements (organization_entity_id);
create index idx_worker_vacations_worker on public.worker_vacations (worker_id, start_date);
create index idx_worker_vacations_entity on public.worker_vacations (organization_entity_id, status);

alter table public.worker_vacations enable row level security;
alter table public.worker_vacation_movements enable row level security;
grant select on table public.worker_vacations to authenticated;
grant select on table public.worker_vacation_movements to authenticated;
grant select, insert, update, delete on table public.worker_vacations to service_role;
grant select, insert, update, delete on table public.worker_vacation_movements to service_role;

create policy worker_vacations_select on public.worker_vacations for select to authenticated
  using (public.can_access_entity(organization_entity_id, 'vacations.view') or public.can_access_entity(organization_entity_id, 'vacations.manage'));
create policy worker_vacation_movements_select on public.worker_vacation_movements for select to authenticated
  using (public.can_access_entity(organization_entity_id, 'vacations.view') or public.can_access_entity(organization_entity_id, 'vacations.manage'));

-- ---------------------------------------------------------------------------
-- 3. MOTOR (resumen; definiciones completas aplicadas en BD)
-- ---------------------------------------------------------------------------
--   position_working_weekdays(position_id)              → integer[] (días ISO del horario)
--   worker_position_on(worker_id, date)                 → position_id vigente en esa fecha
--   worker_vacation_accrual_start/end(worker_id)        → ventana de empleo (corte/alta → baja)
--   worker_vacation_is_employed_on(worker_id, date)     → boolean
--   worker_vacation_weekdays_on(worker_id, date)        → días laborables aplicables
--   vacation_count_working_days(worker_id, from, to, require_employment) → int
--   vacation_target_annual(worker_id, year)             → derecho anual PRORRATEADO
--   calculate_worker_vacation_accrual(worker_id, y, m)  → jsonb (CALCULAR; no escribe)
--   vacation_post_accrual_internal(...)                 → INSERT idempotente (owner-only, EXECUTE revocado)
--   post_worker_vacation_accrual(...)                   → wrapper con permiso vacations.manage
--   run_worker_vacation_catchup(worker_id)              → contabiliza meses cerrados faltantes (idempotente)
--   register_worker_vacation(...)                       → período + VACATION_USAGE (transaccional)
--   cancel_worker_vacation(...)                         → CANCELLED + REVERSAL (transaccional)
--   adjust_worker_vacation_balance(...)                 → ADJUSTMENT auditable
--   set_worker_vacation_opening_balance(...)            → INITIAL_BALANCE + fecha de corte
--   worker_vacation_summary(worker_id)                  → jsonb (read model)
--   entity_vacation_overview(entity_id)                 → setof (lista + KPIs; ejecuta catch-up idempotente)
--
-- APROXIMACIÓN DE DEVENGO:
--   mes ≠ cierre:  calculated = round(24 · días_laborables_empleado_mes / días_laborables_año, 4)
--   mes de cierre (último mes con actividad del año):
--                  calculated = round(derecho_anual_prorrateado − Σ calculados previos del año, 4)
--   acreditado = round(least(calculated, greatest(0, 24 − saldo_actual)), 4)
--   El mes de cierre absorbe el error de redondeo → un trabajador de año completo y
--   horario estable devenga EXACTAMENTE 24; uno de alta parcial queda correctamente
--   prorrateado (§7/§9/§94/§95).
-- ============================================================================
