-- ============================================================================
-- FASE 19 — EXPORTACIÓN DE LA PLANTILLA COMPLETA A EXCEL (.xlsx)
-- Registro de auditoría de la migración incremental aplicada en BD.
--
-- NO es un archivo de migración de Supabase (no vive en supabase/migrations/).
-- Se conserva como evidencia del cambio real ejecutado contra la base de datos.
--
-- DECISIONES DE DISEÑO (auditadas contra el schema REAL):
--   · La plantilla NO es una tabla: se DERIVA de la arquitectura existente
--     Entidad → Área → Cargo → Puesto(organization_positions) → Assignment.
--   · Un Puesto representa `authorized_quantity` plazas. La exportación expande
--     cada Puesto en `authorized_quantity` filas; las plazas sin trabajador
--     quedan como filas normales con los datos personales vacíos (§8/§32/§34/§95).
--   · Ocupación ACTUAL = `worker_position_assignments` con is_current = true,
--     end_date IS NULL y trabajador con employment_status = 'active' (§36/§37).
--   · Si por datos históricos hubiera más asignaciones activas que plazas
--     autorizadas, se generan `greatest(authorized_quantity, ocupadas)` filas
--     para NO ocultar trabajadores (§35). Caso reportado en el informe.
--   · Orden organizativo REAL reutilizado (NO se inventa prioridad):
--       organization_areas.hierarchy_order → organization_jobs.hierarchy_order
--       → organization_positions.position_order (§26/§27/§97). Nulos al final.
--   · Catálogos globales reales para las siglas:
--       genders.code · skin_colors.code · education_levels.code · marital_statuses.code
--     Categoría ocupacional = occupational_categories.name (§13/§17-§20/§61).
--   · Salario:
--       fila OCUPADA  → worker_last_recorded_salary(worker) = condición
--                       contractual/formalizada actual (histórico salarial +
--                       respaldo snapshot de contrato). NO el valor maestro (§22/§78).
--       fila VACÍA    → Grupo → escala aplicable → valor vigente, y SOLO si el
--                       grupo pertenece a la escala aplicable de la entidad.
--                       Sin fallback EMPRESARIAL → PRESUPUESTADA (§23/§24/§81/§82).
--     El salario se devuelve NUMÉRICO (no texto) (§25/§59).
--   · SEGURIDAD: función SECURITY DEFINER con autorización backend explícita
--     (`can_access_entity(...,'workers.view'|'workers.manage')`, mismo permiso que
--     la pantalla de Plantilla). No se debilita ningún permiso existente (§41/§42/§43).
--     No se crea un permiso nuevo para el Excel (§41).
-- ============================================================================

create or replace function public.entity_staffing_export(p_entity_id uuid)
returns table (
  area_name text,
  job_name text,
  occupational_category text,
  position_name text,
  worker_name text,
  identification text,
  gender_code text,
  skin_color_code text,
  education_level_code text,
  marital_status_code text,
  salary_group_sequence integer,
  salary numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
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
      g.code  as gender_code,
      sc.code as skin_color_code,
      el.code as education_level_code,
      ms.code as marital_status_code,
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
    left join public.skin_colors sc     on sc.id = w.skin_color_id
    left join public.education_levels el on el.id = w.education_level_id
    left join public.marital_statuses ms on ms.id = w.marital_status_id
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
    oc.name as occupational_category,
    p.name  as position_name,
    o.worker_name,
    o.identification,
    o.gender_code,
    o.skin_color_code,
    o.education_level_code,
    o.marital_status_code,
    sg.sequence_number as salary_group_sequence,
    case
      when o.worker_id is not null then public.worker_last_recorded_salary(o.worker_id)
      when sg.salary_scale_id is not null
           and sg.salary_scale_id = (select scale_id from applicable_scale)
        then (select v.amount from public.resolve_salary_group_value(sg.id) v)
      else null
    end as salary
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
    (o.worker_id is null),  -- ocupados primero, vacantes al final (§29/§30/§75)
    o.worker_name,
    p.id, i;
end;
$function$;
