-- =============================================================================
-- Módulo de RESOLUCIONES — Cargo Especialista Principal (`is_principal_specialist`)
-- =============================================================================
-- Una persona que pasa a ocupar un Cargo marcado como Especialista Principal
-- formaliza su situación con una RESOLUCIÓN (documento sustitutivo del contrato).
-- El disparador es el EVENTO laboral (contratación de candidato o movimiento
-- formal de puesto) y el CARGO DESTINO, nunca el origen del trabajador.
--
-- Vincular a plantilla NO genera documentos (acción administrativa).
-- =============================================================================

-- 1) Tipo documental y catálogo de variables cortas r.* -----------------------
insert into public.document_types (id, name, sort_order)
values ('RESOLUTION', 'Resolución', 41)
on conflict (id) do nothing;

insert into public.document_variables (key, label, category, data_type, kind, document_types, description, sort_order) values
('r.nom','Resolución · Nombre completo','Resolución','text','SOURCE', array['RESOLUTION'],'Nombre y apellidos del trabajador.',200),
('r.car','Resolución · Cargo','Resolución','text','SOURCE', array['RESOLUTION'],'Cargo que pasa a ocupar el trabajador (Cargo destino).',201),
('r.ent','Resolución · Nombre de la entidad','Resolución','text','SOURCE', array['RESOLUTION'],'Entidad que emite la Resolución.',202),
('r.emp','Resolución · Empresa','Resolución','text','SOURCE', array['RESOLUTION'],'Empresa a la que pertenece la UEB (vacío si la entidad no es UEB).',203),
('r.sal','Resolución · Salario','Resolución','amount','SOURCE', array['RESOLUTION'],'Salario correspondiente al nuevo Cargo.',204),
('r.ge','Resolución · Grupo Escala','Resolución','text','SOURCE', array['RESOLUTION'],'Grupo Escala del nuevo Cargo (valor real, p. ej. XI).',205),
('r.fun','Resolución · Funciones / contenido de trabajo','Resolución','text','SOURCE', array['RESOLUTION'],'Funciones / contenido de trabajo del nuevo Cargo.',206),
('r.mun','Resolución · Municipio','Resolución','text','SOURCE', array['RESOLUTION'],'Municipio donde se firma (dirección contractual de la entidad).',207),
('r.dia','Resolución · Día de firma','Resolución','text','CALCULATED', array['RESOLUTION'],'Día de la fecha de Resolución.',208),
('r.mes','Resolución · Mes de firma','Resolución','text','CALCULATED', array['RESOLUTION'],'Mes de la fecha de Resolución en español.',209),
('r.ano','Resolución · Año de firma','Resolución','text','CALCULATED', array['RESOLUTION'],'Año de la fecha de Resolución.',210),
('r.rev','Resolución · Año de la Revolución','Resolución','text','SOURCE', array['RESOLUTION'],'Año de la Revolución configurado como texto en la información contractual.',211),
('r.rep','Resolución · Representante','Resolución','text','SOURCE', array['RESOLUTION'],'Persona a nombre de quien sale la Resolución.',212)
on conflict (key) do update set label=excluded.label, category=excluded.category, data_type=excluded.data_type, kind=excluded.kind, document_types=excluded.document_types, description=excluded.description, sort_order=excluded.sort_order;

-- 2) Fuente histórica (snapshot) de cada Resolución ---------------------------
create table if not exists public.worker_resolutions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  organization_entity_id uuid not null references public.organization_entities(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  assignment_id uuid references public.worker_position_assignments(id) on delete set null,
  position_id uuid references public.organization_positions(id) on delete set null,
  job_id uuid references public.organization_jobs(id) on delete set null,
  event_type text not null default 'HIRE',
  resolution_date date not null,
  worker_name_snapshot text,
  worker_identification_snapshot text,
  entity_name_snapshot text,
  parent_company_name_snapshot text,
  municipality_snapshot text,
  revolution_year_snapshot text,
  job_name_snapshot text,
  salary_group_sequence_snapshot integer,
  salary_amount_snapshot numeric,
  salary_currency_snapshot text,
  work_content_snapshot text,
  representative_assignment_id uuid,
  representative_name_snapshot text,
  representative_position_snapshot text,
  document_template_version_id uuid,
  worker_document_id uuid,
  status text not null default 'PENDING_TEMPLATE',
  generated_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_resolutions_worker_idx on public.worker_resolutions (worker_id, resolution_date desc);

grant select, insert, update, delete on table public.worker_resolutions to service_role;
grant select, insert, update, delete on table public.worker_resolutions to authenticated;

alter table public.worker_resolutions enable row level security;

create policy worker_resolutions_select on public.worker_resolutions for select to authenticated
using (public.can_access_entity(organization_entity_id, 'workers.view') or public.can_access_entity(organization_entity_id, 'workers.manage'));

create policy worker_resolutions_insert on public.worker_resolutions for insert to authenticated
with check (public.can_access_entity(organization_entity_id, 'workers.manage'));

create policy worker_resolutions_update on public.worker_resolutions for update to authenticated
using (public.can_access_entity(organization_entity_id, 'workers.manage'))
with check (public.can_access_entity(organization_entity_id, 'workers.manage'));

create policy worker_resolutions_delete on public.worker_resolutions for delete to authenticated
using (public.can_access_entity(organization_entity_id, 'workers.manage'));

create trigger worker_resolutions_updated_at before update on public.worker_resolutions
for each row execute function public.handle_updated_at();

-- 3) RPCs ---------------------------------------------------------------------
--   · resolution_worker_context(worker, position, date, representative) → contexto resuelto
--   · validate_resolution_readiness(candidate, worker, position, date, representative) → checklist
--   · create_worker_resolution(worker, assignment, position, date, representative, override, event)
--   · get_resolution_document_data(resolution_id) → datos documentales (variables r.*)
--   · begin_resolution_generation(resolution_id, template_version_id) → reserva worker_documents
--   · update_job_work_content(job_id, work_content) → funciones (fuente de verdad = Cargo)
--   (el cuerpo completo de cada función vive en la base de datos aplicada)
--
--   complete_document_generation se extendió para cerrar la Resolución cuando el
--   documento generado tiene document_source_type = 'RESOLUTION'.
--
--   hire_candidate: nuevo parámetro p_resolution_date. Si el Cargo destino es
--   Especialista Principal, crea worker + assignment SIN contrato y crea la
--   Resolución (nunca usa plantilla Contract).
--   change_worker_position: nuevos parámetros p_resolution_date. Si el Cargo
--   destino es Especialista Principal, omite el anexo y crea la Resolución.
