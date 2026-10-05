-- Campo «Motivo» en las reuniones (pestaña Reuniones del dashboard de
-- Networking): para qué es la reunión. Se muestra en la tarjeta y se incluye
-- en el recordatorio por WhatsApp.
--
-- IMPORTANTE: esta migración redefine coalicion_save_record_public con TODOS
-- los campos de un evento. La versión de 20260929010000_reuniones_adjuntos_storage
-- se armó sobre una función anterior y no guarda end_time, jornada_type,
-- specialties, collaborating_orgs ni participants; esta versión los incluye
-- de nuevo (junto con minuta, pendientes, minuta_files y motivo). Si la función
-- que está en la base ya los tenía, no cambia nada; si no, lo corrige.

alter table public.coalicion_events
  add column if not exists motivo text;

grant select (motivo) on public.coalicion_events to anon, authenticated;

create or replace function public.coalicion_save_record_public(
  p_entity text,
  p_payload jsonb,
  p_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  saved jsonb;
begin
  if p_entity = 'event' then
    if nullif(trim(p_payload->>'title'), '') is null then
      raise exception 'title is required' using errcode = '22023';
    end if;
    if nullif(trim(p_payload->>'location'), '') is null then
      raise exception 'location is required' using errcode = '22023';
    end if;
    if p_id is null then
      insert into public.coalicion_events (
        title, event_date, start_time, end_time, location, maps_url, status, notes,
        jornada_type, specialties, collaborating_orgs, participants, participo_fundacion_ingenia,
        minuta, pendientes, minuta_files, motivo
      )
      values (
        trim(p_payload->>'title'), (p_payload->>'event_date')::date, nullif(p_payload->>'start_time', '')::time,
        nullif(p_payload->>'end_time', '')::time,
        nullif(trim(p_payload->>'location'), ''),
        nullif(trim(p_payload->>'maps_url'), ''),
        coalesce(nullif(p_payload->>'status', ''), 'planned'), nullif(trim(p_payload->>'notes'), ''),
        nullif(p_payload->>'jornada_type', ''),
        coalesce(p_payload->'specialties', '[]'::jsonb),
        coalesce(p_payload->'collaborating_orgs', '[]'::jsonb),
        coalesce(p_payload->'participants', '[]'::jsonb),
        coalesce((p_payload->>'participo_fundacion_ingenia')::boolean, false),
        nullif(trim(p_payload->>'minuta'), ''),
        coalesce(p_payload->'pendientes', '[]'::jsonb),
        coalesce(p_payload->'minuta_files', '[]'::jsonb),
        nullif(trim(p_payload->>'motivo'), '')
      ) returning to_jsonb(coalicion_events) into saved;
    else
      update public.coalicion_events set
        title = trim(p_payload->>'title'), event_date = (p_payload->>'event_date')::date,
        start_time = nullif(p_payload->>'start_time', '')::time,
        end_time = nullif(p_payload->>'end_time', '')::time,
        location = nullif(trim(p_payload->>'location'), ''),
        maps_url = coalesce(nullif(trim(p_payload->>'maps_url'), ''), maps_url),
        status = coalesce(nullif(p_payload->>'status', ''), 'planned'),
        notes = nullif(trim(p_payload->>'notes'), ''),
        jornada_type = nullif(p_payload->>'jornada_type', ''),
        specialties = coalesce(p_payload->'specialties', '[]'::jsonb),
        collaborating_orgs = coalesce(p_payload->'collaborating_orgs', '[]'::jsonb),
        participants = coalesce(p_payload->'participants', '[]'::jsonb),
        participo_fundacion_ingenia = coalesce((p_payload->>'participo_fundacion_ingenia')::boolean, false),
        minuta = nullif(trim(p_payload->>'minuta'), ''),
        pendientes = coalesce(p_payload->'pendientes', '[]'::jsonb),
        minuta_files = coalesce(p_payload->'minuta_files', '[]'::jsonb),
        motivo = nullif(trim(p_payload->>'motivo'), ''),
        updated_at = now()
      where id = p_id and archived_at is null
      returning to_jsonb(coalicion_events) into saved;
    end if;

  elsif p_entity = 'inventory' then
    if nullif(trim(p_payload->>'name'), '') is null then
      raise exception 'inventory name is required' using errcode = '22023';
    end if;
    if p_id is null then
      insert into public.coalicion_inventory (name, total_quantity, distributed_quantity, unit)
      values (
        trim(p_payload->>'name'), (p_payload->>'total_quantity')::integer,
        (p_payload->>'distributed_quantity')::integer,
        coalesce(nullif(trim(p_payload->>'unit'), ''), 'unidades')
      ) returning to_jsonb(coalicion_inventory) into saved;
    else
      update public.coalicion_inventory set
        name = trim(p_payload->>'name'), total_quantity = (p_payload->>'total_quantity')::integer,
        distributed_quantity = (p_payload->>'distributed_quantity')::integer,
        unit = coalesce(nullif(trim(p_payload->>'unit'), ''), 'unidades'), updated_at = now()
      where id = p_id and archived_at is null
      returning to_jsonb(coalicion_inventory) into saved;
    end if;

  elsif p_entity = 'batch' then
    if nullif(trim(p_payload->>'label'), '') is null or nullif(trim(p_payload->>'leader_name'), '') is null then
      raise exception 'batch label and leader are required' using errcode = '22023';
    end if;
    if p_id is null then
      insert into public.coalicion_batches (event_id, label, leader_name, expected_count, arrival_window, status, notes)
      values (
        nullif(p_payload->>'event_id', '')::uuid, trim(p_payload->>'label'), trim(p_payload->>'leader_name'),
        (p_payload->>'expected_count')::integer, nullif(trim(p_payload->>'arrival_window'), ''),
        coalesce(nullif(p_payload->>'status', ''), 'planned'), nullif(trim(p_payload->>'notes'), '')
      ) returning to_jsonb(coalicion_batches) into saved;
    else
      update public.coalicion_batches set
        event_id = nullif(p_payload->>'event_id', '')::uuid, label = trim(p_payload->>'label'),
        leader_name = trim(p_payload->>'leader_name'), expected_count = (p_payload->>'expected_count')::integer,
        arrival_window = nullif(trim(p_payload->>'arrival_window'), ''),
        status = coalesce(nullif(p_payload->>'status', ''), 'planned'),
        notes = nullif(trim(p_payload->>'notes'), ''), updated_at = now()
      where id = p_id and archived_at is null
      returning to_jsonb(coalicion_batches) into saved;
    end if;
  else
    raise exception 'unsupported entity' using errcode = '22023';
  end if;

  if saved is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

-- Misma política de ejecución que las versiones anteriores: solo la Edge
-- Function coalicion-editor (service_role) puede llamarla.
revoke all on function public.coalicion_save_record_public(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.coalicion_save_record_public(text, jsonb, uuid) to service_role;
