-- EVENTO COALICIÓN VENEZUELA — CONSULTA PÚBLICA + EDICIÓN CON CLAVE
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar todo -> Run.
-- Este archivo crea la estructura y las políticas, pero NO contiene la clave ni datos personales.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.coalicion_settings (
  key text primary key,
  value_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.coalicion_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  national_id text,
  phone text not null,
  email text,
  role text not null default 'Responsable',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.coalicion_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  start_time time,
  location text,
  maps_url text,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'in_progress', 'completed')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.coalicion_inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_quantity integer not null default 0 check (total_quantity >= 0),
  distributed_quantity integer not null default 0 check (distributed_quantity >= 0 and distributed_quantity <= total_quantity),
  unit text not null default 'unidades',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.coalicion_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.coalicion_events(id) on delete set null,
  label text not null,
  leader_name text not null,
  expected_count integer not null check (expected_count >= 15),
  arrival_window text,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'arrived', 'completed')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Compatibilidad si se ejecutó una versión anterior basada en cuentas.
alter table public.coalicion_contacts alter column created_by drop not null;
alter table public.coalicion_events alter column created_by drop not null;
alter table public.coalicion_events add column if not exists maps_url text;
alter table public.coalicion_events alter column location drop not null;
alter table public.coalicion_inventory alter column created_by drop not null;
alter table public.coalicion_batches alter column created_by drop not null;

create index if not exists coalicion_events_event_date_idx on public.coalicion_events(event_date);
create index if not exists coalicion_contacts_name_idx on public.coalicion_contacts(name);
create index if not exists coalicion_batches_event_id_idx on public.coalicion_batches(event_id);
create index if not exists coalicion_contacts_created_by_idx on public.coalicion_contacts(created_by);
create index if not exists coalicion_events_created_by_idx on public.coalicion_events(created_by);
create index if not exists coalicion_inventory_created_by_idx on public.coalicion_inventory(created_by);
create index if not exists coalicion_batches_created_by_idx on public.coalicion_batches(created_by);

alter table public.coalicion_settings enable row level security;
alter table public.coalicion_contacts enable row level security;
alter table public.coalicion_events enable row level security;
alter table public.coalicion_inventory enable row level security;
alter table public.coalicion_batches enable row level security;

-- Si existió una versión anterior, retiramos la vista que podía ejecutar con
-- privilegios del propietario. La consulta pública usa permisos por columna.
drop view if exists public.coalicion_contacts_public;

revoke all on public.coalicion_settings from anon, authenticated;
revoke all on public.coalicion_contacts from anon, authenticated;
revoke all on public.coalicion_events from anon, authenticated;
revoke all on public.coalicion_inventory from anon, authenticated;
revoke all on public.coalicion_batches from anon, authenticated;
grant select (id, name, role, created_at, updated_at, archived_at)
  on public.coalicion_contacts to anon, authenticated;
grant select on public.coalicion_events to anon, authenticated;
grant select on public.coalicion_inventory to anon, authenticated;
grant select on public.coalicion_batches to anon, authenticated;

grant select, insert, update, delete on public.coalicion_settings to service_role;
grant select, insert, update, delete on public.coalicion_contacts to service_role;
grant select, insert, update, delete on public.coalicion_events to service_role;
grant select, insert, update, delete on public.coalicion_inventory to service_role;
grant select, insert, update, delete on public.coalicion_batches to service_role;

drop policy if exists "coalicion settings deny clients" on public.coalicion_settings;
create policy "coalicion settings deny clients" on public.coalicion_settings
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "coalicion contacts public read" on public.coalicion_contacts;
create policy "coalicion contacts public read" on public.coalicion_contacts
  for select to anon, authenticated using (archived_at is null);

drop policy if exists "coalicion events public read" on public.coalicion_events;
create policy "coalicion events public read" on public.coalicion_events
  for select to anon, authenticated using (archived_at is null);

drop policy if exists "coalicion inventory public read" on public.coalicion_inventory;
create policy "coalicion inventory public read" on public.coalicion_inventory
  for select to anon, authenticated using (archived_at is null);

drop policy if exists "coalicion batches public read" on public.coalicion_batches;
create policy "coalicion batches public read" on public.coalicion_batches
  for select to anon, authenticated using (archived_at is null);

-- Elimina las políticas de escritura de una versión anterior, si existieran.
drop policy if exists "coalicion contacts read" on public.coalicion_contacts;
drop policy if exists "coalicion contacts insert" on public.coalicion_contacts;
drop policy if exists "coalicion contacts update" on public.coalicion_contacts;
drop policy if exists "coalicion events read" on public.coalicion_events;
drop policy if exists "coalicion events insert" on public.coalicion_events;
drop policy if exists "coalicion events update" on public.coalicion_events;
drop policy if exists "coalicion inventory read" on public.coalicion_inventory;
drop policy if exists "coalicion inventory insert" on public.coalicion_inventory;
drop policy if exists "coalicion inventory update" on public.coalicion_inventory;
drop policy if exists "coalicion batches read" on public.coalicion_batches;
drop policy if exists "coalicion batches insert" on public.coalicion_batches;
drop policy if exists "coalicion batches update" on public.coalicion_batches;

create or replace function public.coalicion_verify_editor_key(p_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.coalicion_settings
    where key = 'editor_key'
      and length(coalesce(p_key, '')) >= 12
      and value_hash = extensions.crypt(p_key, value_hash)
  );
$$;

create or replace function public.coalicion_get_contacts(p_key text)
returns setof public.coalicion_contacts
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.coalicion_verify_editor_key(p_key) then
    raise exception 'invalid editor key' using errcode = '28000';
  end if;
  return query
    select * from public.coalicion_contacts
    where archived_at is null
    order by name;
end;
$$;

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
      insert into public.coalicion_events (title, event_date, start_time, location, maps_url, status, notes)
      values (
        trim(p_payload->>'title'), (p_payload->>'event_date')::date, nullif(p_payload->>'start_time', '')::time,
        nullif(trim(p_payload->>'location'), ''), nullif(trim(p_payload->>'maps_url'), ''), coalesce(nullif(p_payload->>'status', ''), 'planned'),
        nullif(trim(p_payload->>'notes'), '')
      ) returning to_jsonb(coalicion_events) into saved;
    else
      update public.coalicion_events set
        title = trim(p_payload->>'title'), event_date = (p_payload->>'event_date')::date,
        start_time = nullif(p_payload->>'start_time', '')::time, location = nullif(trim(p_payload->>'location'), ''),
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

revoke all on function public.coalicion_verify_editor_key(text) from public;
revoke all on function public.coalicion_get_contacts(text) from public;
revoke all on function public.coalicion_save_record(text, text, jsonb, uuid) from public;
revoke all on function public.coalicion_verify_editor_key(text) from anon, authenticated;
revoke all on function public.coalicion_get_contacts(text) from anon, authenticated;
revoke all on function public.coalicion_save_record(text, text, jsonb, uuid) from anon, authenticated;
grant execute on function public.coalicion_verify_editor_key(text) to service_role;
grant execute on function public.coalicion_get_contacts(text) to service_role;
grant execute on function public.coalicion_save_record(text, text, jsonb, uuid) to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['coalicion_events', 'coalicion_inventory', 'coalicion_batches']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

-- PASO PRIVADO PARA DEFINIR O CAMBIAR LA CLAVE:
-- Sustituye la frase de ejemplo y ejecuta SOLO esta sentencia desde SQL Editor.
-- Usa 12 caracteres o más. No guardes la clave real en GitHub.
--
-- insert into public.coalicion_settings (key, value_hash, updated_at)
-- values ('editor_key', extensions.crypt('REEMPLAZAR_CON_CLAVE_SEGURA', extensions.gen_salt('bf', 12)), now())
-- on conflict (key) do update
-- set value_hash = excluded.value_hash, updated_at = now();
