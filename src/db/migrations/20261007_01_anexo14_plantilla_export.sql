-- ANEXO 14 — «REGISTRO DE TRABAJADORES / a) Registro de principales datos»
--
-- Se sustituye la consulta de la exportación existente de Plantilla
-- («Plantilla → Descargar Plantilla»). NO se crea una segunda exportación:
-- `entity_staffing_export` sigue siendo la ÚNICA fuente del Excel.
--
-- La función mantiene el comportamiento anterior de construcción
-- (Área → Cargo → Puesto/capacidad autorizada → trabajador con Assignment ACTUAL
-- válido), expandiendo cada Puesto en `authorized_quantity` capacidades
-- (`generate_series`, con `greatest(authorized_quantity, ocupados)` para no perder
-- nunca un trabajador). Las capacidades sin trabajador quedan con los datos
-- personales vacíos: representan las VACANTES de la plantilla.
--
-- Cambios de columnas devueltas:
--   * `salary`      → ahora es SIEMPRE la escala del grupo salarial resuelta con la
--                     fuente central (`resolve_salary_scale_for_entity` +
--                     `resolve_salary_group_value`), no el salario individual del
--                     trabajador: el Anexo es estructural y las vacantes también
--                     muestran su escala.
--   * `cla_amount`  → condiciones laborales anormales del Cargo
--                     (`has_abnormal_conditions` + `abnormal_conditions_amount`).
--   * `academic_amount`/`academic_category` → resolver central de pago por
--                     categoría académica (`resolve_academic_category_payment_for_flags`).
--                     Doctor prevalece sobre Máster; sin Máster/Doctor → NULL.
--   * `service_start` → `workers.employment_start_date` (fuente de verdad de la
--                     antigüedad). Los años/meses se calculan en el cliente hasta la
--                     fecha de generación del Anexo.
--   * `preparation_level` → nivel de preparación del TRABAJADOR: único dato real
--                     almacenado en su ficha (`workers.education_level_id` →
--                     `education_levels.name`). SiteCorp no almacena niveles de
--                     preparación por trabajador; el nivel requerido vive en el Cargo.
--   * `gender_code` → `male`/`female` del catálogo presentado como M/F.
--   * Se eliminan las columnas que el modelo del Anexo 14 no utiliza
--     (color de piel, estado civil, nivel escolar como código, etc.).
--
-- No depende de ningún período de Prenómina (no usa noches trabajadas ni snapshots).

DROP FUNCTION IF EXISTS public.entity_staffing_export(uuid);

CREATE OR REPLACE FUNCTION public.entity_staffing_export(p_entity_id uuid)
 RETURNS TABLE(
  area_name text,
  job_name text,
  position_name text,
  occupational_category text,
  worker_name text,
  gender_code text,
  identification text,
  preparation_level text,
  salary_group_sequence integer,
  salary numeric,
  cla_amount numeric,
  academic_amount numeric,
  academic_category text,
  service_start date
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.can_access_entity(p_entity_id, 'workers.view')
     and not public.can_access_entity(p_entity_id, 'workers.manage') then
    raise exception 'No tiene permiso para exportar la plantilla de esta entidad';
  end if;

  return query
  with occ as (
    select
      p.id as position_id,
      w.id as worker_id,
      nullif(btrim(concat_ws(' ', w.first_name, w.first_surname, w.second_surname)), '') as worker_name,
      w.identification,
      case
        when g.code = 'male' then 'M'
        when g.code = 'female' then 'F'
        else g.code
      end as gender_code,
      el.name as preparation_level,
      w.employment_start_date,
      ac.res->>'category' as academic_category,
      case
        when ac.res->>'category' is null then null
        else (ac.res->>'amount')::numeric
      end as academic_amount,
      row_number() over (
        partition by p.id
        order by w.first_surname nulls last, w.second_surname nulls last,
                 w.first_name nulls last, w.id
      ) as rn
    from public.organization_positions p
    join public.worker_position_assignments a
      on a.position_id = p.id
     and a.is_current = true
     and a.end_date is null
    join public.workers w
      on w.id = a.worker_id
     and w.employment_status = 'active'
    left join public.genders g          on g.id  = w.gender_id
    left join public.education_levels el on el.id = w.education_level_id
    left join lateral (
      select public.resolve_academic_category_payment_for_flags(
        p_entity_id,
        coalesce(w.has_masters_degree, false),
        coalesce(w.has_doctorate_degree, false)
      ) as res
    ) ac on true
    where p.organization_entity_id = p_entity_id
      and p.is_active = true
  ),
  occ_count as (
    select position_id, count(*)::int as c from occ group by position_id
  ),
  applicable_scale as (
    select public.resolve_salary_scale_for_entity(p_entity_id) as scale_id
  )
  select
    a.name  as area_name,
    j.name  as job_name,
    p.name  as position_name,
    oc.name as occupational_category,
    o.worker_name,
    o.gender_code,
    o.identification,
    o.preparation_level,
    sg.sequence_number as salary_group_sequence,
    case
      when sg.salary_scale_id is not null
           and sg.salary_scale_id = (select scale_id from applicable_scale)
        then (select v.amount from public.resolve_salary_group_value(sg.id) v)
      else null
    end as salary,
    case
      when coalesce(j.has_abnormal_conditions, false) then j.abnormal_conditions_amount
      else null
    end as cla_amount,
    o.academic_amount,
    o.academic_category,
    o.employment_start_date as service_start
  from public.organization_positions p
  join public.organization_jobs j on j.id = p.job_id
  left join public.organization_areas a on a.id = j.area_id
  left join public.occupational_categories oc on oc.id = j.occupational_category_id
  left join public.salary_groups sg on sg.id = j.salary_group_id
  left join occ_count cc on cc.position_id = p.id
  cross join lateral generate_series(
    1, greatest(coalesce(p.authorized_quantity, 0), coalesce(cc.c, 0))
  ) as i
  left join occ o on o.position_id = p.id and o.rn = i
  where p.organization_entity_id = p_entity_id
    and p.is_active = true
  order by
    coalesce(a.hierarchy_order, 2147483647), a.name,
    coalesce(j.hierarchy_order, 2147483647), j.name,
    coalesce(p.position_order, 2147483647), p.name,
    (o.worker_id is null),
    o.worker_name,
    p.id, i;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.entity_staffing_export(uuid) TO authenticated;
