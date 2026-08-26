alter table if exists public.coalicion_events
  add column if not exists maps_url text;

create or replace function public.coalicion_save_record(
  p_key text,
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
  if not public.coalicion_verify_editor_key(p_key) then
    raise exception 'invalid editor key' using errcode = '28000';
  end if;

  if p_entity = 'contact' then
    if nullif(trim(p_payload->>'name'), '') is null or nullif(trim(p_payload->>'phone'), '') is null then
      raise exception 'name and phone are required' using errcode = '22023';
    end if;
    if p_id is null then
      insert into public.coalicion_contacts (name, national_id, phone, email, role, notes)
      values (
        trim(p_payload->>'name'), nullif(trim(p_payload->>'national_id'), ''), trim(p_payload->>'phone'),
        nullif(trim(p_payload->>'email'), ''), coalesce(nullif(trim(p_payload->>'role'), ''), 'Responsable'),
        nullif(trim(p_payload->>'notes'), '')
      ) returning to_jsonb(coalicion_contacts) into saved;
    else
      update public.coalicion_contacts set
        name = trim(p_payload->>'name'), national_id = nullif(trim(p_payload->>'national_id'), ''),
        phone = trim(p_payload->>'phone'), email = nullif(trim(p_payload->>'email'), ''),
        role = coalesce(nullif(trim(p_payload->>'role'), ''), 'Responsable'),
        notes = nullif(trim(p_payload->>'notes'), ''), updated_at = now()
      where id = p_id and archived_at is null
      returning to_jsonb(coalicion_contacts) into saved;
    end if;

  elsif p_entity = 'event' then
    if nullif(trim(p_payload->>'title'), '') is null or nullif(trim(p_payload->>'location'), '') is null then
      raise exception 'title and location are required' using errcode = '22023';
    end if;
    if nullif(trim(p_payload->>'maps_url'), '') is not null and
       lower(trim(p_payload->>'maps_url')) !~ '^https://((www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps)([/?]|$)' then
      raise exception 'invalid Google Maps URL' using errcode = '22023';
    end if;
    if p_id is null then
      insert into public.coalicion_events (title, event_date, start_time, location, maps_url, status, notes)
      values (
        trim(p_payload->>'title'), (p_payload->>'event_date')::date, nullif(p_payload->>'start_time', '')::time,
        trim(p_payload->>'location'), nullif(trim(p_payload->>'maps_url'), ''),
        coalesce(nullif(p_payload->>'status', ''), 'planned'), nullif(trim(p_payload->>'notes'), '')
      ) returning to_jsonb(coalicion_events) into saved;
    else
      update public.coalicion_events set
        title = trim(p_payload->>'title'), event_date = (p_payload->>'event_date')::date,
        start_time = nullif(p_payload->>'start_time', '')::time, location = trim(p_payload->>'location'),
        maps_url = nullif(trim(p_payload->>'maps_url'), ''),
        status = coalesce(nullif(p_payload->>'status', ''), 'planned'), notes = nullif(trim(p_payload->>'notes'), ''),
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
        (p_payload->>'distributed_quantity')::integer, coalesce(nullif(trim(p_payload->>'unit'), ''), 'unidades')
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
        status = coalesce(nullif(p_payload->>'status', ''), 'planned'), notes = nullif(trim(p_payload->>'notes'), ''),
        updated_at = now()
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

revoke all on function public.coalicion_save_record(text, text, jsonb, uuid) from public;
revoke all on function public.coalicion_save_record(text, text, jsonb, uuid) from anon, authenticated;
grant execute on function public.coalicion_save_record(text, text, jsonb, uuid) to service_role;
