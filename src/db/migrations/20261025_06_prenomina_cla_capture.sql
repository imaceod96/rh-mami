-- ============================================================================
-- Corrección: CAPTURA MENSUAL DE CLA EN PRENÓMINA POR TRABAJADOR
-- ----------------------------------------------------------------------------
-- Causa real: la ventana mensual decidía mostrar CLA leyendo SOLO el snapshot
-- (cla_day_enabled / cla_night_enabled) de la entry, que se pobla al refrescar
-- trabajadores. Si el Cargo se configura con CLA después de crear el período y
-- no se pulsa "Actualizar trabajadores", el snapshot queda en false y la sección
-- no aparecía nunca.
--
-- Solución: la captura resuelve la configuración CLA del CARGO ACTUAL del
-- trabajador (Assignment/Puesto vigente) mediante un RPC autorizado con los
-- permisos de Prenómina (no requiere permisos de Plantilla). El período CERRADO
-- sigue usando el snapshot congelado.
-- ============================================================================

-- 1. Banderas de modalidad "utilizada" (por trabajador y mes).
--    Evita "datos ocultos": sin la bandera marcada, la modalidad no paga.
ALTER TABLE public.prenomina_worker_entries
  ADD COLUMN IF NOT EXISTS cla_day_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cla_night_used boolean NOT NULL DEFAULT false;

-- 2. RPC de configuración CLA del Cargo actual del trabajador (para el período).
--    Devuelve la config real (flags, tarifas y horarios de los dos tramos) SOLO
--    si el Cargo tiene Condiciones Anormales; en otro caso applicable = false.
CREATE OR REPLACE FUNCTION public.prenomina_cla_config(p_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_entry public.prenomina_worker_entries%rowtype;
  v_period public.prenomina_periods%rowtype;
  v_job_id uuid;
  v_job_enabled boolean;
  v_day_enabled boolean;
  v_day_rate numeric;
  v_night_enabled boolean;
  v_s1 public.organization_job_cla_night_segments%rowtype;
  v_s2 public.organization_job_cla_night_segments%rowtype;
  v_night_out boolean := false;
begin
  select * into v_entry from public.prenomina_worker_entries where id = p_entry_id;
  if not found then return jsonb_build_object('applicable', false); end if;
  select * into v_period from public.prenomina_periods where id = v_entry.period_id;
  if not public.can_access_entity(v_period.organization_entity_id, 'prenomina.view')
     and not public.can_access_entity(v_period.organization_entity_id, 'prenomina.manage') then
    raise exception 'Sin permiso para ver la prenómina';
  end if;

  select j.id, coalesce(j.has_abnormal_conditions, false), coalesce(j.cla_day_enabled, false),
         j.cla_day_hourly_rate, coalesce(j.cla_night_enabled, false)
    into v_job_id, v_job_enabled, v_day_enabled, v_day_rate, v_night_enabled
  from public.worker_position_assignments a
  join public.organization_positions p on p.id = a.position_id and p.is_active = true
  join public.organization_jobs j on j.id = p.job_id
  where a.worker_id = v_entry.worker_id
    and a.is_current = true and a.end_date is null
    and p.organization_entity_id = v_entry.organization_entity_id
  limit 1;

  if coalesce(v_job_enabled, false) and coalesce(v_night_enabled, false) then
    select * into v_s1 from public.organization_job_cla_night_segments where organization_job_id = v_job_id and segment_order = 1;
    select * into v_s2 from public.organization_job_cla_night_segments where organization_job_id = v_job_id and segment_order = 2;
    v_night_out := v_s1.id is not null and v_s2.id is not null;
  end if;

  return jsonb_build_object(
    'applicable', coalesce(v_job_enabled, false),
    'day_enabled', coalesce(v_job_enabled, false) and coalesce(v_day_enabled, false),
    'day_rate', case when coalesce(v_job_enabled, false) and coalesce(v_day_enabled, false) then v_day_rate else null end,
    'night_enabled', v_night_out,
    'night1_start', case when v_night_out then to_char(v_s1.start_time, 'HH24:MI') else null end,
    'night1_end', case when v_night_out then to_char(v_s1.end_time, 'HH24:MI') else null end,
    'night1_rate', case when v_night_out then v_s1.hourly_rate else null end,
    'night2_start', case when v_night_out then to_char(v_s2.start_time, 'HH24:MI') else null end,
    'night2_end', case when v_night_out then to_char(v_s2.end_time, 'HH24:MI') else null end,
    'night2_rate', case when v_night_out then v_s2.hourly_rate else null end
  );
end;
$function$;

-- 3. prenomina_save_cla (nueva firma con banderas de modalidad):
--    p_applied, p_day_used, p_day_minutes, p_night_used, p_night1_minutes, p_night2_minutes.
--    Guarda minutos y congela tarifas/horarios del Cargo. Si una modalidad no está
--    marcada como utilizada, sus minutos se ponen a 0 (sin importes ocultos).
DROP FUNCTION IF EXISTS public.prenomina_save_cla(uuid, boolean, numeric, numeric, numeric);

-- 4. prenomina_recalc_entry: el importe CLA solo se genera si
--    cla_applied AND modalidad_habilitada AND modalidad_utilizada.
--    Fórmula: horas = minutos / 60 ; importe = horas × tarifa del tramo.
--    cla_total = diurno + tramo1 + tramo2 (redondeo monetario a 2 decimales) y se
--    suma al total del trabajador junto a escala + antigüedad + académica + nocturnidad.
--
-- (Los cuerpos completos de prenomina_save_cla y prenomina_recalc_entry se aplican
--  vía execute SQL; ver la base de datos.)
