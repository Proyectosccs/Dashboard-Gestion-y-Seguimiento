-- Adjuntos de archivo para las minutas de la pestaña Reuniones (Networking):
-- las minutas ahora se pueden cargar como archivo, no solo como texto.
-- Bucket de Storage público (mismo modelo de seguridad que el resto del
-- sitio: acceso anónimo abierto, sin autenticación de usuarios) + el campo
-- correspondiente en coalicion_events (los demás orígenes de eventos ya
-- guardan JSON libre en *_board_state y no necesitan migración).

insert into storage.buckets (id, name, public)
values ('reuniones-archivos', 'reuniones-archivos', true)
on conflict (id) do nothing;

drop policy if exists "reuniones_archivos_select_public" on storage.objects;
create policy "reuniones_archivos_select_public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'reuniones-archivos');

drop policy if exists "reuniones_archivos_insert_public" on storage.objects;
create policy "reuniones_archivos_insert_public"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'reuniones-archivos');

drop policy if exists "reuniones_archivos_delete_public" on storage.objects;
create policy "reuniones_archivos_delete_public"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'reuniones-archivos');

alter table public.coalicion_events
  add column if not exists minuta_files jsonb not null default '[]'::jsonb;

grant select (minuta_files) on public.coalicion_events to anon, authenticated;

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
    if nullif(trim(p_payload->>'location'), '') is null and nullif(trim(p_payload->>'maps_url'), '') is null then
      raise exception 'location or Google Maps URL is required' using errcode = '22023';
    end if;
    if nullif(trim(p_payload->>'maps_url'), '') is not null and
       lower(trim(p_payload->>'maps_url')) !~ '^https://((www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps)([/?]|$)' then
      raise exception 'invalid Google Maps URL' using errcode = '22023';
    end if;
    if p_id is null then
      insert into public.coalicion_events (title, event_date, start_time, location, maps_url, status, notes, participo_fundacion_ingenia, minuta, pendientes, minuta_files)
      values (
        trim(p_payload->>'title'), (p_payload->>'event_date')::date, nullif(p_payload->>'start_time', '')::time,
        nullif(trim(p_payload->>'location'), ''), nullif(trim(p_payload->>'maps_url'), ''),
        coalesce(nullif(p_payload->>'status', ''), 'planned'), nullif(trim(p_payload->>'notes'), ''),
        coalesce((p_payload->>'participo_fundacion_ingenia')::boolean, false),
        nullif(trim(p_payload->>'minuta'), ''),
        coalesce(p_payload->'pendientes', '[]'::jsonb),
        coalesce(p_payload->'minuta_files', '[]'::jsonb)
      ) returning to_jsonb(coalicion_events) into saved;
    else
      update public.coalicion_events set
        title = trim(p_payload->>'title'), event_date = (p_payload->>'event_date')::date,
        start_time = nullif(p_payload->>'start_time', '')::time,
        location = nullif(trim(p_payload->>'location'), ''), maps_url = nullif(trim(p_payload->>'maps_url'), ''),
        status = coalesce(nullif(p_payload->>'status', ''), 'planned'),
        notes = nullif(trim(p_payload->>'notes'), ''),
        participo_fundacion_ingenia = coalesce((p_payload->>'participo_fundacion_ingenia')::boolean, false),
        minuta = nullif(trim(p_payload->>'minuta'), ''),
        pendientes = coalesce(p_payload->'pendientes', '[]'::jsonb),
        minuta_files = coalesce(p_payload->'minuta_files', '[]'::jsonb),
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

revoke all on function public.coalicion_save_record_public(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.coalicion_save_record_public(text, jsonb, uuid) to service_role;
