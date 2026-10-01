-- ============================================================================
-- FASE: INTEGRIDAD OBLIGATORIA DE LOS DATOS CONTRACTUALES
-- Registro de auditoría de la migración incremental aplicada en BD.
--
-- NO es un archivo de migración de Supabase (no vive en supabase/migrations/).
-- Se conserva como evidencia del cambio real ejecutado contra la base de datos.
--
-- OBJETIVO
--   Garantizar que un contrato sólo pueda crearse/formalizarse cuando TODOS los
--   datos que alimentan la documentación existan y provengan de su fuente real
--   (Entidad · Representantes · Candidato · Trabajador · Cargo · Puesto ·
--   Contrato). No se duplican datos, no se inventan valores y no se crean
--   registros parciales.
--
-- FUENTE DE VERDAD ÚNICA
--   Una capa central de funciones SQL (`validate_*_contract_readiness`) devuelve
--   un resultado estructurado `{ ready, missing:[{code,label,source,sourceId,
--   section}] }` que reutilizan tanto el frontend (checklist de preparación)
--   como las RPC de contratación/formalización (bloqueo real en backend).
--
-- CRITERIO DE OBLIGATORIEDAD (§7/§14)
--   · Un campo de Cargo es obligatorio sólo si alimenta una variable documental
--     registrada. Por eso: categoría ocupacional y grupo salarial = obligatorios;
--     `required_profession_or_trade` y `work_content` siguen OPCIONALES porque
--     no alimentan ninguna variable registrada.
--   · El lugar de trabajo, la jornada y el horario viven en el PUESTO (no se
--     duplican en el Cargo).
--   · `Año de la Revolución` se conserva como texto, nunca se calcula, migra ni
--     valida por fórmula (§22).
--
-- ORDEN SEGURO
--   1) columnas de snapshot  2) funciones de readiness  3) mensaje humano
--   4) reemplazo de RPC existentes (snapshots y bloqueos)  5) permisos
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. SNAPSHOTS HISTÓRICOS DE JORNADA (§42)
--    La jornada contractual se congela en el contrato al formalizarlo. Se
--    añaden las columnas que faltaban para que el documento histórico NO lea
--    nunca el Puesto actual.
-- ---------------------------------------------------------------------------
alter table public.employment_contracts
  add column if not exists daily_hours_snapshot numeric,
  add column if not exists weekly_hours_snapshot numeric,
  add column if not exists monthly_hours_snapshot numeric,
  add column if not exists break_minutes_snapshot integer;


-- ---------------------------------------------------------------------------
-- 2. CAPA CENTRAL DE READINESS (nuevas funciones)
--    Todas exigen `auth.uid()` y verifican `can_access_entity` con los permisos
--    ya existentes (no se crean permisos ni roles nuevos).
-- ---------------------------------------------------------------------------

create or replace function public.validate_job_contract_readiness(p_job_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $$
declare
  v_job public.organization_jobs%rowtype;
  v_missing jsonb := '[]'::jsonb;
  v_section text := 'Cargo';
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  select * into v_job from public.organization_jobs where id = p_job_id;
  if not found then
    return jsonb_build_object('ready', false, 'missing', jsonb_build_array(
      jsonb_build_object('code','job','label','Cargo','source','job','sourceId',p_job_id,'section',v_section)));
  end if;

  if not (public.can_access_entity(v_job.organization_entity_id,'staffing.view')
          or public.can_access_entity(v_job.organization_entity_id,'staffing.manage')
          or public.can_access_entity(v_job.organization_entity_id,'workers.view')
          or public.can_access_entity(v_job.organization_entity_id,'workers.manage')) then
    raise exception 'No tiene permiso para consultar este cargo';
  end if;

  if nullif(btrim(coalesce(v_job.name,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','job.name','label','Nombre del cargo','source','job','sourceId',p_job_id,'section',v_section);
  end if;
  if v_job.area_id is null then
    v_missing := v_missing || jsonb_build_object('code','job.area','label','Área','source','job','sourceId',p_job_id,'section',v_section);
  end if;
  if v_job.occupational_category_id is null then
    v_missing := v_missing || jsonb_build_object('code','job.occupational_category','label','Categoría ocupacional','source','job','sourceId',p_job_id,'section',v_section);
  end if;
  if v_job.salary_group_id is null then
    v_missing := v_missing || jsonb_build_object('code','job.salary_group','label','Grupo salarial','source','job','sourceId',p_job_id,'section',v_section);
  end if;

  return jsonb_build_object('ready', jsonb_array_length(v_missing) = 0, 'missing', v_missing);
end $$;


create or replace function public.validate_position_contract_readiness(p_position_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $$
declare
  v_pos public.organization_positions%rowtype;
  v_missing jsonb := '[]'::jsonb;
  v_section text := 'Puesto';
  v_job jsonb;
  v_has_schedule boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  select * into v_pos from public.organization_positions where id = p_position_id;
  if not found then
    return jsonb_build_object('ready', false, 'missing', jsonb_build_array(
      jsonb_build_object('code','position','label','Puesto','source','position','sourceId',p_position_id,'section',v_section)));
  end if;

  if not (public.can_access_entity(v_pos.organization_entity_id,'staffing.view')
          or public.can_access_entity(v_pos.organization_entity_id,'staffing.manage')
          or public.can_access_entity(v_pos.organization_entity_id,'workers.view')
          or public.can_access_entity(v_pos.organization_entity_id,'workers.manage')) then
    raise exception 'No tiene permiso para consultar este puesto';
  end if;

  -- El Puesto incluye la readiness del Cargo (categoría, grupo, área).
  v_job := public.validate_job_contract_readiness(v_pos.job_id);
  v_missing := v_missing || (v_job->'missing');

  if nullif(btrim(coalesce(v_pos.name,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','position.name','label','Nombre del puesto','source','position','sourceId',p_position_id,'section',v_section);
  end if;
  if v_pos.authorized_quantity is null or v_pos.authorized_quantity < 1 then
    v_missing := v_missing || jsonb_build_object('code','position.authorized_quantity','label','Cantidad autorizada','source','position','sourceId',p_position_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_pos.work_location,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','position.work_location','label','Lugar de trabajo','source','position','sourceId',p_position_id,'section',v_section);
  end if;
  if v_pos.daily_hours is null then
    v_missing := v_missing || jsonb_build_object('code','schedule.daily_hours','label','Horas diarias','source','position','sourceId',p_position_id,'section',v_section);
  end if;
  if v_pos.weekly_hours is null then
    v_missing := v_missing || jsonb_build_object('code','schedule.weekly_hours','label','Horas semanales','source','position','sourceId',p_position_id,'section',v_section);
  end if;
  if v_pos.monthly_hours is null then
    v_missing := v_missing || jsonb_build_object('code','schedule.monthly_hours','label','Horas mensuales','source','position','sourceId',p_position_id,'section',v_section);
  end if;
  if v_pos.break_minutes is null then
    v_missing := v_missing || jsonb_build_object('code','schedule.break','label','Descanso','source','position','sourceId',p_position_id,'section',v_section);
  end if;

  v_has_schedule := exists (select 1 from public.position_schedule_segments s where s.position_id = p_position_id)
                    or nullif(btrim(coalesce(v_pos.schedule_notes,'')),'') is not null;
  if not v_has_schedule then
    v_missing := v_missing || jsonb_build_object('code','schedule.text','label','Horario','source','position','sourceId',p_position_id,'section',v_section);
  end if;

  return jsonb_build_object('ready', jsonb_array_length(v_missing) = 0, 'missing', v_missing);
end $$;


create or replace function public.validate_candidate_contract_readiness(p_candidate_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $$
declare
  v_c public.candidates%rowtype;
  v_missing jsonb := '[]'::jsonb;
  v_section text := 'Candidato';
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  select * into v_c from public.candidates where id = p_candidate_id;
  if not found then
    return jsonb_build_object('ready', false, 'missing', jsonb_build_array(
      jsonb_build_object('code','candidate','label','Candidato','source','candidate','sourceId',p_candidate_id,'section',v_section)));
  end if;

  if not (public.can_access_entity(v_c.organization_entity_id,'candidates.view')
          or public.can_access_entity(v_c.organization_entity_id,'candidates.manage')
          or public.can_access_entity(v_c.organization_entity_id,'workers.manage')) then
    raise exception 'No tiene permiso para consultar este candidato';
  end if;

  if nullif(btrim(coalesce(v_c.first_name,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','candidate.first_name','label','Nombre','source','candidate','sourceId',p_candidate_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_c.first_surname,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','candidate.first_surname','label','Primer apellido','source','candidate','sourceId',p_candidate_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_c.identification,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','candidate.identification','label','Carné de identidad','source','candidate','sourceId',p_candidate_id,'section',v_section);
  end if;
  if v_c.birth_date is null then
    v_missing := v_missing || jsonb_build_object('code','candidate.birth_date','label','Fecha de nacimiento','source','candidate','sourceId',p_candidate_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_c.profession_or_trade,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','candidate.profession','label','Profesión u oficio','source','candidate','sourceId',p_candidate_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_c.address,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','candidate.address','label','Dirección particular','source','candidate','sourceId',p_candidate_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_c.province,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','candidate.province','label','Provincia','source','candidate','sourceId',p_candidate_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_c.municipality,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','candidate.municipality','label','Municipio','source','candidate','sourceId',p_candidate_id,'section',v_section);
  end if;

  return jsonb_build_object('ready', jsonb_array_length(v_missing) = 0, 'missing', v_missing);
end $$;


create or replace function public.validate_worker_contract_readiness(p_worker_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $$
declare
  v_w public.workers%rowtype;
  v_missing jsonb := '[]'::jsonb;
  v_section text := 'Trabajador';
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  select * into v_w from public.workers where id = p_worker_id;
  if not found then
    return jsonb_build_object('ready', false, 'missing', jsonb_build_array(
      jsonb_build_object('code','worker','label','Trabajador','source','worker','sourceId',p_worker_id,'section',v_section)));
  end if;

  if not (public.can_access_entity(v_w.organization_entity_id,'workers.view')
          or public.can_access_entity(v_w.organization_entity_id,'workers.manage')) then
    raise exception 'No tiene permiso para consultar este trabajador';
  end if;

  if nullif(btrim(concat_ws(' ', coalesce(v_w.first_name,''), coalesce(v_w.first_surname,''))),'') is null then
    v_missing := v_missing || jsonb_build_object('code','worker.full_name','label','Nombre completo','source','worker','sourceId',p_worker_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_w.identification,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','worker.identification','label','Carné de identidad','source','worker','sourceId',p_worker_id,'section',v_section);
  end if;
  if v_w.birth_date is null then
    v_missing := v_missing || jsonb_build_object('code','worker.birth_date','label','Fecha de nacimiento','source','worker','sourceId',p_worker_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_w.profession_or_trade,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','worker.profession','label','Profesión u oficio','source','worker','sourceId',p_worker_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_w.address,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','worker.address','label','Dirección particular','source','worker','sourceId',p_worker_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_w.province,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','worker.province','label','Provincia','source','worker','sourceId',p_worker_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_w.municipality,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','worker.municipality','label','Municipio','source','worker','sourceId',p_worker_id,'section',v_section);
  end if;

  return jsonb_build_object('ready', jsonb_array_length(v_missing) = 0, 'missing', v_missing);
end $$;


create or replace function public.validate_entity_contract_readiness(p_entity_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $$
declare
  v_e public.organization_entities%rowtype;
  v_missing jsonb := '[]'::jsonb;
  v_section text := 'Entidad';
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  select * into v_e from public.organization_entities where id = p_entity_id;
  if not found then
    return jsonb_build_object('ready', false, 'missing', jsonb_build_array(
      jsonb_build_object('code','entity','label','Entidad','source','entity','sourceId',p_entity_id,'section',v_section)));
  end if;

  if not (public.can_access_entity(p_entity_id,'contract_data.view')
          or public.can_access_entity(p_entity_id,'contract_data.manage')
          or public.can_access_entity(p_entity_id,'workers.view')
          or public.can_access_entity(p_entity_id,'workers.manage')) then
    raise exception 'No tiene permiso para consultar los datos contractuales de esta entidad';
  end if;

  if nullif(btrim(coalesce(v_e.name,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','entity.name','label','Nombre de la entidad','source','entity','sourceId',p_entity_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_e.organism,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','entity.organism','label','Organismo al que pertenece','source','entity','sourceId',p_entity_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_e.branch,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','entity.branch','label','Rama','source','entity','sourceId',p_entity_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_e.labor_identification_code,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','entity.labor_code','label','Código de identificación laboral','source','entity','sourceId',p_entity_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_e.address,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','entity.address','label','Dirección de la entidad','source','entity','sourceId',p_entity_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_e.province,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','entity.province','label','Provincia de la entidad','source','entity','sourceId',p_entity_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_e.municipality,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','entity.municipality','label','Municipio de la entidad','source','entity','sourceId',p_entity_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_e.revolution_year,'')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','entity.revolution_year','label','Año de la Revolución','source','entity','sourceId',p_entity_id,'section',v_section);
  end if;

  return jsonb_build_object('ready', jsonb_array_length(v_missing) = 0, 'missing', v_missing);
end $$;


create or replace function public.validate_employment_contract_readiness(p_contract_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $$
declare
  v_contract public.employment_contracts%rowtype;
  v_data jsonb;
  v_type_code text;
  v_missing jsonb := '[]'::jsonb;
  v_section text := 'Contrato';
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  select * into v_contract from public.employment_contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ready', false, 'missing', jsonb_build_array(
      jsonb_build_object('code','contract','label','Contrato','source','contract','sourceId',p_contract_id,'section',v_section)));
  end if;

  if not (public.can_access_entity(v_contract.organization_entity_id,'workers.view')
          or public.can_access_entity(v_contract.organization_entity_id,'workers.manage')) then
    raise exception 'No tiene permiso para consultar este contrato';
  end if;

  -- Se valida sobre el resolutor documental (variable documental -> dato real):
  -- una sola fuente de verdad para el contrato.
  v_data := public.get_contract_document_data(p_contract_id);
  v_type_code := v_data->'contract'->>'type_code';

  if v_type_code is null then
    v_missing := v_missing || jsonb_build_object('code','contract.type','label','Tipo de contrato','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if (v_data->'contract'->>'start_date') is null then
    v_missing := v_missing || jsonb_build_object('code','contract.start_date','label','Fecha de inicio','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if (v_data->'contract'->>'signature_date') is null then
    v_missing := v_missing || jsonb_build_object('code','contract.signature_date','label','Fecha de firma','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_data->'contract'->>'signature_place','')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','contract.signature_place','label','Lugar de firma','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_data->'contract'->>'payment_method','')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','contract.payment_method','label','Forma de pago','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_data->'contract'->>'payment_schedule','')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','contract.payment_schedule','label','Día / momento de pago','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_data->'representative'->>'name','')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','representative.name','label','Representante de la entidad','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_data->'representative'->>'position','')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','representative.position','label','Cargo del representante','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if (v_data->'compensation'->>'base_salary') is null then
    v_missing := v_missing || jsonb_build_object('code','compensation.base_salary','label','Salario de escala','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if nullif(btrim(coalesce(v_data->'compensation'->>'currency','')),'') is null then
    v_missing := v_missing || jsonb_build_object('code','compensation.currency','label','Moneda','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;
  if (v_data->'compensation'->>'total') is null then
    v_missing := v_missing || jsonb_build_object('code','compensation.total','label','Total contractual','source','contract','sourceId',p_contract_id,'section',v_section);
  end if;

  if v_type_code = 'DETERMINADO' then
    if (v_data->'contract'->>'end_date') is null then
      v_missing := v_missing || jsonb_build_object('code','contract.end_date','label','Fecha de fin (contrato determinado)','source','contract','sourceId',p_contract_id,'section',v_section);
    elsif (v_data->'contract'->>'start_date') is not null
          and (v_data->'contract'->>'end_date')::date <= (v_data->'contract'->>'start_date')::date then
      v_missing := v_missing || jsonb_build_object('code','contract.end_date_order','label','Fecha de fin posterior al inicio','source','contract','sourceId',p_contract_id,'section',v_section);
    end if;
  end if;

  return jsonb_build_object('ready', jsonb_array_length(v_missing) = 0, 'missing', v_missing);
end $$;


-- Orquestador para la contratación: recibe la persona (trabajador en
-- reincorporación o candidato en alta nueva) + puesto + condiciones de firma.
create or replace function public.validate_hiring_readiness(
  p_candidate_id uuid default null,
  p_worker_id uuid default null,
  p_position_id uuid default null,
  p_signature_date date default null,
  p_contract_type_id uuid default null,
  p_signature_place text default null,
  p_payment_method_id uuid default null,
  p_representative_assignment_id uuid default null,
  p_contract_start_date date default null,
  p_contract_end_date date default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $$
declare
  v_missing jsonb := '[]'::jsonb;
  v_sections jsonb;
  v_pos public.organization_positions%rowtype;
  v_entity_id uuid;
  v_card jsonb;
  v_pending jsonb;
  v_item text;
  v_section text;
  v_type_code text;
  v_start date;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  -- Puesto: resuelve la entidad y valida estructura del puesto (incluye cargo)
  if p_position_id is not null then
    select * into v_pos from public.organization_positions where id = p_position_id;
    if found then
      v_entity_id := v_pos.organization_entity_id;
      v_card := public.validate_position_contract_readiness(p_position_id);
      v_missing := v_missing || (v_card->'missing');
    else
      v_missing := v_missing || jsonb_build_object('code','position','label','Puesto','source','position','sourceId',p_position_id,'section','Puesto');
    end if;
  else
    v_missing := v_missing || jsonb_build_object('code','position','label','Puesto','source','position','sourceId',null,'section','Puesto');
  end if;

  -- Datos personales: el trabajador es la fuente de verdad en reincorporaciones
  if p_worker_id is not null then
    v_card := public.validate_worker_contract_readiness(p_worker_id);
    v_missing := v_missing || (v_card->'missing');
  elsif p_candidate_id is not null then
    v_card := public.validate_candidate_contract_readiness(p_candidate_id);
    v_missing := v_missing || (v_card->'missing');
  end if;

  -- Entidad contractual
  if v_entity_id is not null then
    v_card := public.validate_entity_contract_readiness(v_entity_id);
    v_missing := v_missing || (v_card->'missing');
  end if;

  -- Condiciones contractuales (escala salarial, firma, pago, representante vigente)
  if v_entity_id is not null then
    v_pending := public.pending_contract_formalization(
      v_entity_id, p_position_id, p_signature_date, p_signature_place,
      p_payment_method_id, p_representative_assignment_id
    );
    for v_item in select jsonb_array_elements_text(coalesce(v_pending->'blocking','[]'::jsonb))
    loop
      v_section := case
        when v_item ilike '%representante%' then 'Representante'
        when v_item ilike '%Entidad%' then 'Entidad'
        else 'Contrato'
      end;
      v_missing := v_missing || jsonb_build_object(
        'code','contract.pending','label',v_item,'source','contract','sourceId',null,'section',v_section);
    end loop;
  end if;

  -- Tipo de contrato / fechas
  if p_contract_type_id is null then
    v_missing := v_missing || jsonb_build_object('code','contract.type','label','Tipo de contrato','source','contract','sourceId',null,'section','Contrato');
  else
    select code into v_type_code from public.employment_contract_types where id = p_contract_type_id and is_active = true;
    if v_type_code is null then
      v_missing := v_missing || jsonb_build_object('code','contract.type','label','Tipo de contrato válido','source','contract','sourceId',null,'section','Contrato');
    end if;
  end if;

  v_start := coalesce(p_contract_start_date, p_signature_date);
  if v_start is null then
    v_missing := v_missing || jsonb_build_object('code','contract.start_date','label','Fecha de inicio','source','contract','sourceId',null,'section','Contrato');
  end if;

  if v_type_code = 'DETERMINADO' then
    if p_contract_end_date is null then
      v_missing := v_missing || jsonb_build_object('code','contract.end_date','label','Fecha de fin (contrato determinado)','source','contract','sourceId',null,'section','Contrato');
    elsif v_start is not null and p_contract_end_date <= v_start then
      v_missing := v_missing || jsonb_build_object('code','contract.end_date_order','label','Fecha de fin posterior al inicio','source','contract','sourceId',null,'section','Contrato');
    end if;
  elsif p_contract_end_date is not null and v_start is not null and p_contract_end_date <= v_start then
    v_missing := v_missing || jsonb_build_object('code','contract.end_date_order','label','Fecha de fin posterior al inicio','source','contract','sourceId',null,'section','Contrato');
  end if;

  -- Agrupar por sección (orden contractual)
  select coalesce(jsonb_agg(sec order by ord), '[]'::jsonb) into v_sections
  from (
    select s as label, o as ord,
           jsonb_build_object(
             'key', s,
             'label', s,
             'ready', not exists (select 1 from jsonb_array_elements(v_missing) e where e->>'section' = s),
             'missing', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_missing) e where e->>'section' = s), '[]'::jsonb)
           ) as sec
    from (values ('Entidad',1),('Representante',2),('Candidato',3),('Trabajador',4),('Cargo',5),('Puesto',6),('Contrato',7)) as t(s,o)
  ) q;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_missing) = 0,
    'missing', v_missing,
    'sections', v_sections
  );
end $$;


-- ---------------------------------------------------------------------------
-- 3. MENSAJE HUMANO (§38)
--    Convierte los datos faltantes en un mensaje claro y accionable que el
--    usuario ve al intentar contratar/formalizar (bloqueo en backend).
-- ---------------------------------------------------------------------------
create or replace function public.format_contract_readiness_message(
  p_missing jsonb,
  p_title text default 'No se puede realizar la contratación.'
)
returns text
language plpgsql
immutable
set search_path to 'public', 'auth'
as $$
declare
  v_out text := '';
  v_sec text;
  v_label text;
begin
  if p_missing is null or jsonb_typeof(p_missing) <> 'array' or jsonb_array_length(p_missing) = 0 then
    return null;
  end if;

  v_out := p_title || E'\n\nFalta completar:';

  foreach v_sec in array array['Candidato','Trabajador','Entidad','Representante','Cargo','Puesto','Contrato']
  loop
    if exists (select 1 from jsonb_array_elements(p_missing) e where e->>'section' = v_sec) then
      v_out := v_out || E'\n\n' || v_sec;
      for v_label in
        select distinct e->>'label' from jsonb_array_elements(p_missing) e
        where e->>'section' = v_sec and coalesce(e->>'label','') <> ''
        order by 1
      loop
        v_out := v_out || E'\n• ' || v_label;
      end loop;
    end if;
  end loop;

  return v_out;
end $$;


-- ---------------------------------------------------------------------------
-- 4. SNAPSHOTS: resolver documental sólo desde el contrato (§42)
--    `capture_contract_structure_snapshot` ahora congela también la profesión
--    y las horas/descanso; `contract_formalized_conditions` deja de leer el
--    Puesto actual y usa EXCLUSIVAMENTE los snapshots del contrato.
--    Cambiar un Puesto después de firmar no altera documentos anteriores.
-- ---------------------------------------------------------------------------
create or replace function public.capture_contract_structure_snapshot(
  p_contract_id uuid,
  p_reference_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_contract public.employment_contracts%rowtype;
  v_position public.organization_positions%rowtype;
  v_job public.organization_jobs%rowtype;
  v_area public.organization_areas%rowtype;
  v_worker public.workers%rowtype;
  v_category text;
  v_jornada text;
  v_schedule text;
begin
  if p_contract_id is null then return null; end if;

  select * into v_contract from public.employment_contracts where id = p_contract_id for update;
  if not found then raise exception 'Contrato no encontrado'; end if;

  if not public.can_access_entity(v_contract.organization_entity_id, 'workers.manage') then
    raise exception 'No tiene permiso para gestionar contratos de esta entidad';
  end if;

  -- Los snapshots son históricos: se capturan una sola vez y no se recalculan
  if v_contract.structure_captured_at is not null then
    return v_contract.id;
  end if;

  select * into v_worker from public.workers where id = v_contract.worker_id;

  select p.* into v_position
  from public.worker_position_assignments a
  join public.organization_positions p on p.id = a.position_id
  where a.id = v_contract.assignment_id;

  if v_position.id is not null then
    select * into v_job from public.organization_jobs where id = v_position.job_id;
    if v_job.area_id is not null then
      select * into v_area from public.organization_areas where id = v_job.area_id;
    end if;
    if v_job.occupational_category_id is not null then
      select name into v_category from public.occupational_categories where id = v_job.occupational_category_id;
    end if;
  end if;

  v_jornada := concat_ws(' · ',
    case when v_position.daily_hours is not null then public.format_hours_text(v_position.daily_hours) || ' h/día' end,
    case when v_position.weekly_hours is not null then public.format_hours_text(v_position.weekly_hours) || ' h/semana' end,
    case when v_position.monthly_hours is not null then public.format_hours_text(v_position.monthly_hours) || ' h/mes' end,
    case when v_position.break_minutes is not null then 'descanso ' || v_position.break_minutes || ' min' end
  );

  v_schedule := coalesce(
    public.format_position_schedule_text(v_position.id),
    nullif(btrim(coalesce(v_position.schedule_notes, '')), '')
  );

  update public.employment_contracts set
    area_name_snapshot = nullif(btrim(coalesce(v_area.name, '')), ''),
    job_name_snapshot = nullif(btrim(coalesce(v_job.name, '')), ''),
    occupational_category_snapshot = nullif(btrim(coalesce(v_category, '')), ''),
    position_name_snapshot = nullif(btrim(coalesce(v_position.name, '')), ''),
    position_code_snapshot = nullif(btrim(coalesce(v_position.code, '')), ''),
    work_location_snapshot = nullif(btrim(coalesce(v_position.work_location, '')), ''),
    work_jornada_snapshot = nullif(v_jornada, ''),
    work_schedule_snapshot = nullif(v_schedule, ''),
    daily_hours_snapshot = v_position.daily_hours,
    weekly_hours_snapshot = v_position.weekly_hours,
    monthly_hours_snapshot = v_position.monthly_hours,
    break_minutes_snapshot = v_position.break_minutes,
    profession_or_trade_snapshot = nullif(btrim(coalesce(v_worker.profession_or_trade, '')), ''),
    structure_captured_at = now(),
    updated_at = now()
  where id = p_contract_id;

  return v_contract.id;
end $$;

-- `contract_formalized_conditions` (resolutor documental): la base de datos
-- contractual se toma SIEMPRE de las columnas snapshot
--   area_name_snapshot, job_name_snapshot, position_name_snapshot,
--   position_code_snapshot, occupational_category_snapshot,
--   work_location_snapshot, work_jornada_snapshot, work_schedule_snapshot,
--   daily_hours_snapshot, weekly_hours_snapshot, monthly_hours_snapshot,
--   break_minutes_snapshot
-- y NUNCA de lecturas en vivo de organization_positions/organization_jobs.
-- Los anexos formalizados sobreescriben esos valores por su propio histórico.


-- ---------------------------------------------------------------------------
-- 5. BLOQUEOS EN LAS RPC DE ESCRITURA (backend = fuente de verdad)
--    Se agregan comprobaciones ANTES de crear/actualizar cualquier registro.
--    Un error lanza y toda la transacción se revierte (atomicidad §27).
-- ---------------------------------------------------------------------------

-- 5.1 save_position_with_schedule: exige cargo completo (readiness) y puesto
--     completo (lugar de trabajo, jornada > 0 y horario). Bloque añadido:
--
--   v_jobcard := public.validate_job_contract_readiness(p_job_id);
--   if not (v_jobcard->>'ready')::boolean then
--     raise exception '%', public.format_contract_readiness_message(
--       v_jobcard->'missing', 'No se puede guardar el puesto porque el cargo está incompleto.');
--   end if;
--   -- luego: work_location obligatorio, daily/weekly/monthly_hours > 0,
--   -- break_minutes no nulo, y horario (segmentos o schedule_notes) obligatorio.

-- 5.2 apply_contract_conditions: al formalizar (p_signature_date no nulo) valida
--     estructura del puesto y datos personales del trabajador. Bloque añadido:
--
--   v_struct := public.validate_position_contract_readiness(v_position_id);
--   v_person := public.validate_worker_contract_readiness(v_contract.worker_id);
--   v_all_missing := coalesce(v_struct->'missing','[]'::jsonb) || coalesce(v_person->'missing','[]'::jsonb);
--   if jsonb_array_length(v_all_missing) > 0 then
--     raise exception '%', public.format_contract_readiness_message(
--       v_all_missing, 'No se puede formalizar el contrato.');
--   end if;

-- 5.3 create_worker_with_position: exige puesto/cargo completo + datos
--     personales indispensables (nacimiento, profesión, dirección, provincia,
--     municipio) para trabajadores creados directamente. Bloque añadido:
--
--   v_poscard := public.validate_position_contract_readiness(p_position_id);
--   v_all_missing := coalesce(v_poscard->'missing','[]'::jsonb) || v_person_missing;
--   if jsonb_array_length(v_all_missing) > 0 then
--     raise exception '%', public.format_contract_readiness_message(
--       v_all_missing, 'No se puede crear el trabajador: faltan datos contractuales obligatorios.');
--   end if;

-- 5.4 hire_candidate: puerta central ANTES de crear cualquier registro (alta
--     nueva o reincorporación). Bloque añadido:
--
--   v_person_worker := v_candidate.worker_id;
--   if v_person_worker is not null and not exists (
--     select 1 from public.workers w where w.id = v_person_worker
--   ) then v_person_worker := null; end if;
--
--   v_readiness := public.validate_hiring_readiness(
--     case when v_person_worker is null then p_candidate_id else null end,
--     v_person_worker, p_position_id, p_signature_date, p_contract_type_id,
--     p_signature_place, p_payment_method_id, p_representative_assignment_id,
--     coalesce(p_contract_start_date, p_hire_date), p_contract_end_date
--   );
--   if not (v_readiness->>'ready')::boolean then
--     v_msg := public.format_contract_readiness_message(v_readiness->'missing');
--     raise exception '%', coalesce(v_msg, 'No se puede realizar la contratación: faltan datos obligatorios.');
--   end if;

-- 5.5 reincorporate_worker: mismo criterio para la vía directa de reincorporación
--     (diálogo de trabajador), no sólo cuando la invoca hire_candidate:
--
--   v_readiness := public.validate_hiring_readiness(
--     null, p_worker_id, p_new_position_id, p_signature_date, p_contract_type_id,
--     p_signature_place, p_payment_method_id, p_representative_assignment_id,
--     v_contract_start, p_contract_end_date
--   );
--   if not (v_readiness->>'ready')::boolean then
--     v_msg := public.format_contract_readiness_message(v_readiness->'missing');
--     raise exception '%', coalesce(v_msg, 'No se puede reincorporar: faltan datos obligatorios.');
--   end if;


-- ---------------------------------------------------------------------------
-- 6. BACKFILL ÚNICO DE SNAPSHOTS ESTRUCTURALES FALTANTES
--    Los contratos históricos sin snapshot estructural recibieron una única
--    captura desde su puesto vigente en ese momento. NUNCA se sobrescribió un
--    snapshot ya existente (no se reescribe historia). Los 9 contratos sin
--    fecha de firma no formalizados se conservan tal cual (§52: se podrán
--    consultar, pero deberán completarse antes de formalizarse).
-- ---------------------------------------------------------------------------
update public.employment_contracts ec
set area_name_snapshot = coalesce(ec.area_name_snapshot, a.name),
    job_name_snapshot = coalesce(ec.job_name_snapshot, j.name),
    position_name_snapshot = coalesce(ec.position_name_snapshot, p.name),
    position_code_snapshot = coalesce(ec.position_code_snapshot, p.code),
    work_location_snapshot = coalesce(ec.work_location_snapshot, nullif(btrim(coalesce(p.work_location,'')),'')),
    work_jornada_snapshot = coalesce(ec.work_jornada_snapshot, nullif(concat_ws(' · ',
      case when p.daily_hours is not null then public.format_hours_text(p.daily_hours) || ' h/día' end,
      case when p.weekly_hours is not null then public.format_hours_text(p.weekly_hours) || ' h/semana' end,
      case when p.monthly_hours is not null then public.format_hours_text(p.monthly_hours) || ' h/mes' end,
      case when p.break_minutes is not null then 'descanso ' || p.break_minutes || ' min' end), '')),
    work_schedule_snapshot = coalesce(ec.work_schedule_snapshot, nullif(coalesce(
      public.format_position_schedule_text(p.id),
      nullif(btrim(coalesce(p.schedule_notes,'')),'')), '')),
    daily_hours_snapshot = coalesce(ec.daily_hours_snapshot, p.daily_hours),
    weekly_hours_snapshot = coalesce(ec.weekly_hours_snapshot, p.weekly_hours),
    monthly_hours_snapshot = coalesce(ec.monthly_hours_snapshot, p.monthly_hours),
    break_minutes_snapshot = coalesce(ec.break_minutes_snapshot, p.break_minutes)
from public.worker_position_assignments a
join public.organization_positions p on p.id = a.position_id
left join public.organization_jobs j on j.id = p.job_id
left join public.organization_areas a2 on a2.id = j.area_id
where a.id = ec.assignment_id
  and ec.structure_captured_at is not null;


-- ---------------------------------------------------------------------------
-- 7. PERMISOS DE LAS FUNCIONES (mínimo privilegio)
--    Los validadores son para usuarios autenticados; nada de acceso anónimo.
--    Se conserva la capacidad de invocarlos desde las RPC SECURITY DEFINER.
-- ---------------------------------------------------------------------------
grant execute on function public.validate_job_contract_readiness(uuid) to authenticated;
grant execute on function public.validate_position_contract_readiness(uuid) to authenticated;
grant execute on function public.validate_candidate_contract_readiness(uuid) to authenticated;
grant execute on function public.validate_worker_contract_readiness(uuid) to authenticated;
grant execute on function public.validate_entity_contract_readiness(uuid) to authenticated;
grant execute on function public.validate_employment_contract_readiness(uuid) to authenticated;
grant execute on function public.validate_hiring_readiness(uuid,uuid,uuid,date,uuid,text,uuid,uuid,date,date) to authenticated;
grant execute on function public.format_contract_readiness_message(jsonb, text) to authenticated;

revoke execute on function public.validate_job_contract_readiness(uuid) from public, anon;
revoke execute on function public.validate_position_contract_readiness(uuid) from public, anon;
revoke execute on function public.validate_candidate_contract_readiness(uuid) from public, anon;
revoke execute on function public.validate_worker_contract_readiness(uuid) from public, anon;
revoke execute on function public.validate_entity_contract_readiness(uuid) from public, anon;
revoke execute on function public.validate_employment_contract_readiness(uuid) from public, anon;
revoke execute on function public.validate_hiring_readiness(uuid,uuid,uuid,date,uuid,text,uuid,uuid,date,date) from public, anon;
