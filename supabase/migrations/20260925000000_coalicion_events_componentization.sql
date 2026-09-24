-- Componentización del formulario de eventos: agrega los campos nuevos
-- compartidos con el resto de los calendarios (Lugar, Hora de Finalización,
-- Tipo de Jornada + Especialidades, Descripción, Organizaciones
-- colaboradoras) y relaja la validación de ubicación ahora que el enlace de
-- Google Maps ya no se pide desde el formulario (se conserva para los
-- eventos viejos que ya tenían uno, solo deja de ser editable).

alter table public.coalicion_events
  add column if not exists venue text,
  add column if not exists end_time time,
  add column if not exists jornada_type text,
  add column if not exists specialties jsonb not null default '[]'::jsonb,
  add column if not exists description text,
  add column if not exists collaborating_orgs jsonb not null default '[]'::jsonb;

alter table public.coalicion_events
  drop constraint if exists coalicion_events_jornada_type_check;

alter table public.coalicion_events
  add constraint coalicion_events_jornada_type_check
  check (jornada_type is null or jornada_type in ('insumos', 'medica'));

grant select (venue, end_time, jornada_type, specialties, description, collaborating_orgs)
  on public.coalicion_events to anon, authenticated;

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
    if nullif(trim(p_payload->>'venue'), '') is null and nullif(trim(p_payload->>'location'), '') is null then
      raise exception 'venue or location is required' using errcode = '22023';
    end if;
    if p_id is null then
      insert into public.coalicion_events (
        title, event_date, start_time, end_time, venue, location, maps_url, status, notes,
        description, jornada_type, specialties, collaborating_orgs, participo_fundacion_ingenia
      )
      values (
        trim(p_payload->>'title'), (p_payload->>'event_date')::date, nullif(p_payload->>'start_time', '')::time,
        nullif(p_payload->>'end_time', '')::time,
        nullif(trim(p_payload->>'venue'), ''), nullif(trim(p_payload->>'location'), ''),
        nullif(trim(p_payload->>'maps_url'), ''),
        coalesce(nullif(p_payload->>'status', ''), 'planned'), nullif(trim(p_payload->>'notes'), ''),
        nullif(trim(p_payload->>'description'), ''),
        nullif(p_payload->>'jornada_type', ''),
        coalesce(p_payload->'specialties', '[]'::jsonb),
        coalesce(p_payload->'collaborating_orgs', '[]'::jsonb),
        coalesce((p_payload->>'participo_fundacion_ingenia')::boolean, false)
      ) returning to_jsonb(coalicion_events) into saved;
    else
      update public.coalicion_events set
        title = trim(p_payload->>'title'), event_date = (p_payload->>'event_date')::date,
        start_time = nullif(p_payload->>'start_time', '')::time,
        end_time = nullif(p_payload->>'end_time', '')::time,
        venue = nullif(trim(p_payload->>'venue'), ''), location = nullif(trim(p_payload->>'location'), ''),
        maps_url = coalesce(nullif(trim(p_payload->>'maps_url'), ''), maps_url),
        status = coalesce(nullif(p_payload->>'status', ''), 'planned'),
        notes = nullif(trim(p_payload->>'notes'), ''),
        description = nullif(trim(p_payload->>'description'), ''),
        jornada_type = nullif(p_payload->>'jornada_type', ''),
        specialties = coalesce(p_payload->'specialties', '[]'::jsonb),
        collaborating_orgs = coalesce(p_payload->'collaborating_orgs', '[]'::jsonb),
        participo_fundacion_ingenia = coalesce((p_payload->>'participo_fundacion_ingenia')::boolean, false),
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
