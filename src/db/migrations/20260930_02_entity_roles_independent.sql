-- ============================================================================
-- FASE: ROLES Y PERMISOS INTERNOS INDEPENDIENTES POR ENTIDAD
-- Registro de auditoría de la migración incremental aplicada en BD.
--
-- NO es un archivo de migración de Supabase (no vive en supabase/migrations/).
-- Se conserva como evidencia del cambio real ejecutado contra la base de datos.
--
-- DECISIÓN DE MODELO (auditada antes de migrar):
--   Se EVOLUCIONA `tenant_roles` en lugar de crear `entity_roles`:
--     · `tenant_roles.organization_entity_id` ya existía (FK a organization_entities);
--     · los 7 roles legacy conservan id, nombre, descripción y permisos;
--     · `entity_user_access.tenant_role_id` ya apuntaba a `tenant_roles`;
--     · crear tablas nuevas obligaría a duplicar asignaciones y políticas.
--   La pertenencia a UNA entidad pasa a ser OBLIGATORIA para los roles internos.
--
-- ORDEN SEGURO: catálogo → mapeo legacy → roles por entidad → Administradores →
-- autorización (can_access_entity) → triggers → RPC → RLS → Storage.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. CATÁLOGO GLOBAL DE PERMISOS INTERNOS (definición global, rol por entidad)
--    Se añaden los 13 permisos que faltaban para cubrir los módulos internos.
-- ---------------------------------------------------------------------------
insert into public.tenant_permissions (code, description) values
  ('contracts.view','Ver contratos de la entidad'),
  ('contracts.manage','Gestionar y formalizar contratos de la entidad'),
  ('contract_addendums.view','Ver anexos contractuales de la entidad'),
  ('contract_addendums.manage','Gestionar anexos contractuales de la entidad'),
  ('worker_documents.view','Ver documentos de trabajadores'),
  ('worker_documents.manage','Subir y administrar documentos de trabajadores'),
  ('contract_data.view','Ver datos contractuales de la entidad'),
  ('contract_data.manage','Gestionar datos contractuales de la entidad'),
  ('representatives.view','Ver representantes autorizados de la entidad'),
  ('representatives.manage','Gestionar representantes autorizados de la entidad'),
  ('document_templates.view','Ver plantillas documentales Word (.doc y .docx)'),
  ('document_templates.manage','Administrar plantillas documentales Word (.doc y .docx)'),
  ('contract_alerts.view','Ver alertas de vencimiento contractual')
on conflict (code) do nothing;


-- ---------------------------------------------------------------------------
-- 2. MAPEO LEGACY → NORMALIZADO, preservando el acceso efectivo
--    (areas.* → staffing.*, workers.* → contratos/anexos/documentos,
--     organization.* → datos contractuales/representantes/plantillas)
--    Se COPIA antes de retirar: ninguna asignación se pierde.
-- ---------------------------------------------------------------------------
insert into public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
select distinct trp.tenant_role_id, tgt.id
from public.tenant_role_permissions trp
join public.tenant_permissions src on src.id = trp.tenant_permission_id
join (values
  ('areas.view','staffing.view'),
  ('areas.manage','staffing.manage'),
  ('workers.view','contracts.view'),
  ('workers.view','contract_addendums.view'),
  ('workers.view','worker_documents.view'),
  ('workers.view','contract_alerts.view'),
  ('workers.manage','contracts.manage'),
  ('workers.manage','contract_addendums.manage'),
  ('workers.manage','worker_documents.manage'),
  ('organization.view','contract_data.view'),
  ('organization.view','representatives.view'),
  ('organization.view','document_templates.view'),
  ('organization.view','contract_alerts.view'),
  ('organization.manage','contract_data.manage'),
  ('organization.manage','representatives.manage'),
  ('organization.manage','document_templates.manage'),
  ('candidates.manage','representatives.view'),
  ('hiring.view','representatives.view')
) as map(source_code, target_code) on map.source_code = src.code
join public.tenant_permissions tgt on tgt.code = map.target_code
on conflict (tenant_role_id, tenant_permission_id) do nothing;


-- ---------------------------------------------------------------------------
-- 3. UNICIDAD DE NOMBRE DE ROL: pasa de (tenant, nombre) a (entidad, nombre)
--    para que dos entidades del mismo workspace puedan tener «RRHH» cada una.
-- ---------------------------------------------------------------------------
drop index if exists public.uq_tenant_roles_tenant_name_normalized;

create unique index uq_tenant_roles_entity_name_normalized
  on public.tenant_roles (organization_entity_id, lower(btrim(name)))
  where organization_entity_id is not null;

create unique index uq_tenant_roles_legacy_tenant_name_normalized
  on public.tenant_roles (tenant_id, lower(btrim(name)))
  where organization_entity_id is null;


-- ---------------------------------------------------------------------------
-- 4. ROL ADMINISTRADOR AUTOMÁTICO POR ENTIDAD SITECORP
--    system + protected + activo + TODOS los permisos internos.
--    Sólo un rol automático: el resto los crea el administrador de la entidad.
-- ---------------------------------------------------------------------------
insert into public.tenant_roles (tenant_id, organization_entity_id, name, description, is_system_role, is_active)
select oe.tenant_id, oe.id, 'Administrador',
       'Rol del sistema con todos los permisos internos de esta entidad', true, true
from public.organization_entities oe
where oe.is_sitecorp_account = true
  and not exists (
    select 1 from public.tenant_roles tr
    where tr.organization_entity_id = oe.id and lower(btrim(tr.name)) = 'administrador'
  );

insert into public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
select tr.id, tp.id
from public.tenant_roles tr
cross join public.tenant_permissions tp
where tr.is_system_role = true
  and tr.organization_entity_id is not null
  and tr.name = 'Administrador'
  and tp.code !~ '(^areas\.|^jobs\.|^tenant_roles\.|_global$|_empresarial$)'
on conflict (tenant_role_id, tenant_permission_id) do nothing;


-- ---------------------------------------------------------------------------
-- 5. PROTECCIÓN DEL ROL DEL SISTEMA
--    · no eliminable, no renombrable, no desactivable, no cambiable de entidad;
--    · sus PERMISOS tampoco pueden reducirse ni modificarse (trigger nuevo).
-- ---------------------------------------------------------------------------
create or replace function public.protect_system_tenant_role()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if coalesce(old.is_system_role, false) = false then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'System organization roles cannot be deleted';
  end if;
  if new.name is distinct from old.name then
    raise exception 'System organization role names cannot be changed';
  end if;
  if new.is_system_role is distinct from old.is_system_role then
    raise exception 'System organization roles cannot lose system protection';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'System organization roles cannot be deactivated';
  end if;
  if new.organization_entity_id is distinct from old.organization_entity_id then
    raise exception 'System organization roles cannot change their entity ownership';
  end if;
  return new;
end;
$function$;

create or replace function public.protect_system_tenant_role_permissions()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_is_system boolean;
begin
  select coalesce(tr.is_system_role, false) into v_is_system
  from public.tenant_roles tr
  where tr.id = coalesce(new.tenant_role_id, old.tenant_role_id);

  if coalesce(v_is_system, false) then
    raise exception 'System organization role permissions cannot be reduced or changed';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists tenant_role_permissions_protect_system on public.tenant_role_permissions;
create trigger tenant_role_permissions_protect_system
before delete or update on public.tenant_role_permissions
for each row execute function public.protect_system_tenant_role_permissions();


-- ---------------------------------------------------------------------------
-- 6. NUEVOS PERMISOS FUTUROS: se otorgan automáticamente a los roles system
--    Administrador de todas las entidades SiteCorp (sin edición manual).
-- ---------------------------------------------------------------------------
create or replace function public.grant_tenant_permission_to_system_roles()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.code ~ '(^areas\.|^jobs\.|^tenant_roles\.|_global$|_empresarial$)' then
    return new;
  end if;

  insert into public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
  select tr.id, new.id
  from public.tenant_roles tr
  where coalesce(tr.is_system_role, false) = true
    and tr.organization_entity_id is not null
    and coalesce(tr.is_active, true) = true
  on conflict (tenant_role_id, tenant_permission_id) do nothing;

  return new;
end;
$function$;

create trigger tenant_permissions_autogrant_system
after insert on public.tenant_permissions
for each row execute function public.grant_tenant_permission_to_system_roles();


-- ---------------------------------------------------------------------------
-- 7. ENTIDAD NUEVA / ACTIVADA COMO SITECORP → Administrador garantizado
-- ---------------------------------------------------------------------------
create or replace function public.ensure_entity_administrator_role()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role_id uuid;
begin
  if coalesce(new.is_sitecorp_account, false) = false then
    return new;
  end if;

  select tr.id into v_role_id
  from public.tenant_roles tr
  where tr.organization_entity_id = new.id and lower(btrim(tr.name)) = 'administrador'
  limit 1;

  if v_role_id is null then
    insert into public.tenant_roles (
      tenant_id, organization_entity_id, name, description, is_system_role, is_active
    ) values (
      new.tenant_id, new.id, 'Administrador',
      'Rol del sistema con todos los permisos internos de esta entidad', true, true
    ) returning id into v_role_id;
  end if;

  insert into public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
  select v_role_id, tp.id
  from public.tenant_permissions tp
  where tp.code !~ '(^areas\.|^jobs\.|^tenant_roles\.|_global$|_empresarial$)'
  on conflict (tenant_role_id, tenant_permission_id) do nothing;

  return new;
end;
$function$;

create trigger organization_entities_ensure_administrator
after insert or update of is_sitecorp_account, tenant_id on public.organization_entities
for each row execute function public.ensure_entity_administrator_role();


-- ---------------------------------------------------------------------------
-- 8. AUTORIZACIÓN CENTRAL `can_access_entity`
--    El rol debe PERTENECER a la entidad del acceso (rol por entidad), no sólo
--    al workspace. Jerarquía y scope (SELF / SELF_AND_DESCENDANTS) intactos.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_entity(target_entity_id uuid, permission_code text default null)
returns boolean language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  target_record public.organization_entities%ROWTYPE;
  assigned_record public.organization_entities%ROWTYPE;
  assignment public.entity_user_access%ROWTYPE;
  has_permission boolean;
begin
  if auth.uid() is null then return false; end if;
  if not public.is_platform_user_active() then return false; end if;
  if public.is_platform_superadmin() then return true; end if;

  select * into target_record from public.organization_entities where id = target_entity_id;
  if not found then return false; end if;
  if coalesce(target_record.is_active, true) = false then return false; end if;
  if coalesce(target_record.is_sitecorp_account, false) = true
     and coalesce(target_record.account_is_active, false) = false then
    return false;
  end if;

  for assignment in
    select eua.*
    from public.entity_user_access eua
    join public.tenant_memberships tm on tm.id = eua.tenant_membership_id
    join public.tenant_roles tr on tr.id = eua.tenant_role_id
    join public.organization_entities assigned on assigned.id = eua.organization_entity_id
    where tm.user_id = auth.uid()
      and tm.is_active = true
      and eua.is_active = true
      and tr.is_active = true
      and coalesce(assigned.is_active, true) = true
      and tm.tenant_id = target_record.tenant_id
      and assigned.tenant_id = target_record.tenant_id
      and tr.tenant_id = target_record.tenant_id
      and tr.organization_entity_id is not null
      and tr.organization_entity_id = eua.organization_entity_id
  loop
    select * into assigned_record from public.organization_entities where id = assignment.organization_entity_id;

    if coalesce(assigned_record.is_sitecorp_account, false) = true
       and coalesce(assigned_record.account_is_active, false) = false then
      continue;
    end if;

    if assignment.access_scope = 'SELF' and assignment.organization_entity_id <> target_entity_id then
      continue;
    end if;

    if assignment.access_scope = 'SELF_AND_DESCENDANTS'
       and assignment.organization_entity_id <> target_entity_id
       and not public.is_entity_descendant(assignment.organization_entity_id, target_entity_id) then
      continue;
    end if;

    if permission_code is null or btrim(permission_code) = '' then return true; end if;

    select exists (
      select 1 from public.tenant_role_permissions trp
      join public.tenant_permissions tp on tp.id = trp.tenant_permission_id
      where trp.tenant_role_id = assignment.tenant_role_id and tp.code = permission_code
    ) into has_permission;

    if has_permission then return true; end if;
  end loop;

  return false;
end;
$function$;

-- Permisos internos efectivos del usuario en una entidad (para menú/UI y RLS).
create or replace function public.list_entity_permissions(target_entity_id uuid)
returns table(permission_code text)
language sql stable security definer set search_path to 'public','auth' as $function$
  with authorized as (
    select public.is_platform_user_active()
       and (public.is_platform_superadmin() or public.can_access_entity(target_entity_id, null)) as allowed
  ),
  catalog as (
    select tp.code from public.tenant_permissions tp
    where tp.code !~ '(^areas\.|^jobs\.|^tenant_roles\.|_global$|_empresarial$)'
  )
  select catalog.code from catalog cross join authorized
  where authorized.allowed
    and (public.is_platform_superadmin() or public.can_access_entity(target_entity_id, catalog.code));
$function$;


-- ---------------------------------------------------------------------------
-- 9. INTEGRIDAD: el rol asignado/ invitado DEBE ser de la entidad
-- ---------------------------------------------------------------------------
create or replace function public.entity_user_access_same_tenant()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  membership_tenant uuid;
  entity_tenant uuid;
  role_tenant uuid;
  role_entity uuid;
begin
  select tenant_id into membership_tenant from public.tenant_memberships where id = new.tenant_membership_id;
  select tenant_id into entity_tenant from public.organization_entities where id = new.organization_entity_id;
  select tenant_id, organization_entity_id into role_tenant, role_entity from public.tenant_roles where id = new.tenant_role_id;

  if membership_tenant is null or entity_tenant is null or role_tenant is null then
    raise exception 'Entity access references must exist' using errcode = '23514';
  end if;

  if membership_tenant <> entity_tenant or membership_tenant <> role_tenant then
    raise exception 'Entity access membership, entity, and role must belong to the same tenant' using errcode = '23514';
  end if;

  if role_entity is null or role_entity <> new.organization_entity_id then
    raise exception 'The role must belong to the same organization entity as the access' using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace function public.tenant_invitation_role_entity()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.organization_entity_id is null then return new; end if;

  if new.tenant_role_id is null then
    raise exception 'Entity invitations require an organization role' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.tenant_roles tr
    where tr.id = new.tenant_role_id and tr.organization_entity_id = new.organization_entity_id
  ) then
    raise exception 'The invitation role must belong to the invited organization entity' using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger tenant_invitations_role_entity
before insert or update of tenant_role_id, organization_entity_id on public.tenant_invitations
for each row execute function public.tenant_invitation_role_entity();


-- ---------------------------------------------------------------------------
-- 10. ADMINISTRACIÓN DE ROLES EN EL ÁMBITO DE LA ENTIDAD
--     Sustituye a `save_tenant_role` (basado en tenant/workspace y en el permiso
--     de plataforma `tenant_roles.manage`, ya retirado). NO se vuelve a otorgar
--     `tenant_roles.manage` como permiso global.
-- ---------------------------------------------------------------------------
create or replace function public.save_entity_role(
  p_entity_id uuid, p_role_id uuid, p_name text, p_description text,
  p_is_active boolean, p_permission_ids uuid[]
) returns uuid language plpgsql security definer set search_path to 'public','auth' as $function$
declare
  v_role_id uuid;
  v_tenant_id uuid;
  v_name text := btrim(p_name);
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_permission_ids uuid[];
  v_existing public.tenant_roles%ROWTYPE;
  v_selected integer;
  v_valid integer;
  v_authorized integer;
  v_is_super boolean := public.is_platform_superadmin();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_entity_id is null then raise exception 'Organization entity is required'; end if;

  select tenant_id into v_tenant_id from public.organization_entities where id = p_entity_id;
  if not found then raise exception 'Organization entity was not found'; end if;

  if not (v_is_super or public.can_access_entity(p_entity_id, 'roles.manage')) then
    raise exception 'Permission denied: roles.manage is required in this entity';
  end if;

  if v_name is null or v_name = '' then raise exception 'Role name is required'; end if;

  select array(
    select distinct candidate_id from unnest(coalesce(p_permission_ids, array[]::uuid[])) as candidate_id
    where candidate_id is not null
  ) into v_permission_ids;
  if v_permission_ids is null then v_permission_ids := array[]::uuid[]; end if;

  v_selected := coalesce(cardinality(v_permission_ids), 0);

  select count(*) into v_valid
  from public.tenant_permissions tp
  where tp.id = any(v_permission_ids)
    and tp.code !~ '(^areas\.|^jobs\.|^tenant_roles\.|_global$|_empresarial$)';

  if v_valid <> v_selected then
    raise exception 'One or more selected permissions are not internal entity permissions';
  end if;

  if exists (
    select 1 from public.tenant_roles existing
    where existing.organization_entity_id = p_entity_id
      and lower(btrim(existing.name)) = lower(v_name)
      and (p_role_id is null or existing.id <> p_role_id)
  ) then
    raise exception 'A role with this name already exists in this entity' using errcode = '23505';
  end if;

  if not v_is_super then
    select count(*) into v_authorized
    from public.tenant_permissions tp
    where tp.id = any(v_permission_ids)
      and public.can_access_entity(p_entity_id, tp.code);

    if v_authorized <> v_selected then
      raise exception 'You may only assign internal permissions that you currently have in this entity';
    end if;
  end if;

  if p_role_id is null then
    insert into public.tenant_roles (tenant_id, organization_entity_id, name, description, is_system_role, is_active)
    values (v_tenant_id, p_entity_id, v_name, v_description, false, coalesce(p_is_active, true))
    returning id into v_role_id;
  else
    select * into v_existing from public.tenant_roles
    where id = p_role_id and organization_entity_id = p_entity_id for update;
    if not found then raise exception 'Role was not found in this entity'; end if;

    v_role_id := v_existing.id;

    if coalesce(v_existing.is_system_role, false) then
      raise exception 'The system role Administrador is protected and cannot be modified';
    end if;

    update public.tenant_roles
    set name = v_name, description = v_description, is_active = coalesce(p_is_active, true)
    where id = v_role_id;
  end if;

  delete from public.tenant_role_permissions
  where tenant_role_id = v_role_id and tenant_permission_id <> all(v_permission_ids);

  insert into public.tenant_role_permissions (tenant_role_id, tenant_permission_id)
  select v_role_id, tp.id from public.tenant_permissions tp where tp.id = any(v_permission_ids)
  on conflict (tenant_role_id, tenant_permission_id) do nothing;

  return v_role_id;
end;
$function$;

create or replace function public.delete_entity_role(p_role_id uuid)
returns void language plpgsql security definer set search_path to 'public','auth' as $function$
declare
  v_role public.tenant_roles%ROWTYPE;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_role from public.tenant_roles where id = p_role_id;
  if not found then raise exception 'Role was not found'; end if;
  if v_role.organization_entity_id is null then raise exception 'Only entity roles can be deleted'; end if;

  if not (public.is_platform_superadmin()
          or public.can_access_entity(v_role.organization_entity_id, 'roles.manage')) then
    raise exception 'Permission denied: roles.manage is required in this entity';
  end if;

  if coalesce(v_role.is_system_role, false) then
    raise exception 'The system role Administrador is protected and cannot be deleted';
  end if;

  if exists (select 1 from public.entity_user_access eua where eua.tenant_role_id = p_role_id)
     or exists (select 1 from public.tenant_user_roles tur where tur.tenant_role_id = p_role_id)
     or exists (select 1 from public.tenant_invitations ti where ti.tenant_role_id = p_role_id) then
    raise exception 'A role assigned to users or invitations cannot be deleted';
  end if;

  delete from public.tenant_role_permissions where tenant_role_id = p_role_id;
  delete from public.tenant_roles where id = p_role_id;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 11. DATOS CONTRACTUALES: dejan de depender de organization.manage
--     Se guardan por RPC que exige `contract_data.manage` en la entidad.
--     El «Año de la Revolución» se conserva como texto (nunca calculado).
-- ---------------------------------------------------------------------------
create or replace function public.save_entity_contract_data(
  p_entity_id uuid, p_organism text, p_branch text, p_labor_identification_code text,
  p_address text, p_province text, p_municipality text, p_revolution_year text
) returns void language plpgsql security definer set search_path to 'public','auth' as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if p_entity_id is null or not exists (select 1 from public.organization_entities where id = p_entity_id) then
    raise exception 'Organization entity was not found';
  end if;

  if not (public.is_platform_superadmin()
          or public.has_platform_permission('organizations.manage_all')
          or public.can_access_entity(p_entity_id, 'contract_data.manage')) then
    raise exception 'Permission denied: contract_data.manage is required in this entity';
  end if;

  update public.organization_entities
  set organism = nullif(btrim(coalesce(p_organism, '')), ''),
      branch = nullif(btrim(coalesce(p_branch, '')), ''),
      labor_identification_code = nullif(btrim(coalesce(p_labor_identification_code, '')), ''),
      address = nullif(btrim(coalesce(p_address, '')), ''),
      province = nullif(btrim(coalesce(p_province, '')), ''),
      municipality = nullif(btrim(coalesce(p_municipality, '')), ''),
      revolution_year = nullif(coalesce(p_revolution_year, ''), '')
  where id = p_entity_id;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 12. RLS: cada módulo pasa a usar SU permiso interno
--     contratos / anexos / documentos de trabajador / plantillas documentales /
--     representantes. Se conservan cláusulas de compatibilidad con workers.*
--     para no retirar acceso legítimo (p. ej. contratos desde el expediente).
-- ---------------------------------------------------------------------------
-- employment_contracts → contracts.view / contracts.manage
-- employment_contract_compensation_components → contracts.* (o workers.*)
-- contract_addendums + employment_contract_addendum_changes → contract_addendums.*
-- worker_documents → worker_documents.*
-- document_templates + document_template_versions → document_templates.*
-- organization_representative_positions / _assignments → representatives.*
--   (ver definiciones completas aplicadas en BD; mismas cláusulas de compatibilidad)

-- Visibilidad de roles: sólo los roles de entidades accesibles (o los propios
-- del workspace para roles legacy sin entidad).
-- profiles / tenant_memberships: el administrador de una entidad puede ver a los
-- usuarios que comparten esa entidad (helper can_view_entity_user).

create or replace function public.can_view_entity_user(target_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public','auth' as $function$
  select public.is_platform_superadmin()
      or public.has_platform_permission('users.view_all')
      or public.has_platform_permission('users.manage_all')
      or exists (
        select 1
        from public.entity_user_access mine
        join public.tenant_memberships my_tm on my_tm.id = mine.tenant_membership_id
        where my_tm.user_id = auth.uid()
          and my_tm.is_active = true
          and mine.is_active = true
          and mine.organization_entity_id is not null
          and (public.can_access_entity(mine.organization_entity_id, 'users.view')
            or public.can_access_entity(mine.organization_entity_id, 'users.manage'))
          and exists (
            select 1
            from public.entity_user_access theirs
            join public.tenant_memberships their_tm on their_tm.id = theirs.tenant_membership_id
            where theirs.organization_entity_id = mine.organization_entity_id
              and theirs.is_active = true
              and their_tm.user_id = target_user_id
          )
      );
$function$;


-- ---------------------------------------------------------------------------
-- 13. STORAGE (buckets privados; sólo URL firmadas)
--     · `documents`: documentos de trabajador → worker_documents.*/workers.*/contracts.*
--       documentos de candidato → candidates.*  (helper candidate_storage_object_entity)
--     · `document-templates`: plantillas .doc/.docx → document_templates.* (+ contracts.*)
--     El límite de subida de 10 MB se mantiene.
-- ---------------------------------------------------------------------------
create or replace function public.candidate_storage_object_entity(object_name text)
returns uuid language plpgsql stable security definer set search_path to 'public','storage','auth' as $function$
declare
  parts text[];
  cid uuid;
  eid uuid;
begin
  parts := storage.foldername(object_name);
  if parts is not null and array_length(parts, 1) >= 2 and parts[1] = 'candidates' then
    begin cid := parts[2]::uuid; exception when others then return null; end;
    return (select c.organization_entity_id from public.candidates c where c.id = cid);
  end if;

  if object_name ~ '^candidate_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' then
    begin cid := substring(object_name from 11 for 36)::uuid; exception when others then cid := null; end;
    if cid is not null then
      return (select c.organization_entity_id from public.candidates c where c.id = cid);
    end if;
  end if;

  select c.organization_entity_id into eid
  from public.candidate_documents cd
  join public.candidates c on c.id = cd.candidate_id
  where cd.storage_path = object_name
  limit 1;

  return eid;
end;
$function$;