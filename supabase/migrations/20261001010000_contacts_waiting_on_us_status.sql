-- Agrega un cuarto estado de contacto: "esperando por nosotros" (nueva
-- llave waiting_on_us), además de pending/contacted/waiting_response. En la
-- interfaz, waiting_response ahora se muestra como "Esperando por ellos" —
-- la llave en base de datos no cambia, solo la etiqueta.

alter table public.coalicion_contacts
  drop constraint if exists coalicion_contacts_status_check;

alter table public.coalicion_contacts
  add constraint coalicion_contacts_status_check
  check (status in ('pending', 'contacted', 'waiting_response', 'waiting_on_us'));

create or replace function public.coalicion_update_contact_public(
  p_payload jsonb,
  p_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  saved jsonb;
  affiliation text := nullif(trim(p_payload->>'belongs_to'), '');
  contact_status text := nullif(trim(p_payload->>'status'), '');
begin
  if nullif(trim(p_payload->>'name'), '') is null or nullif(trim(p_payload->>'phone'), '') is null then
    raise exception 'name and phone are required' using errcode = '22023';
  end if;
  if affiliation is null or affiliation not in (
    'Coalicion con amor a Venezuela',
    'Fundacion Ingenia',
    'Voluntariado AVAA',
    'Voluntario Particular'
  ) then
    raise exception 'valid affiliation is required' using errcode = '22023';
  end if;
  if contact_status is not null and contact_status not in ('pending', 'contacted', 'waiting_response', 'waiting_on_us') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  update public.coalicion_contacts set
    name = trim(p_payload->>'name'), national_id = nullif(trim(p_payload->>'national_id'), ''),
    phone = trim(p_payload->>'phone'), email = nullif(trim(p_payload->>'email'), ''),
    role = coalesce(nullif(trim(p_payload->>'role'), ''), 'Responsable'),
    belongs_to = affiliation, status = coalesce(contact_status, 'pending'),
    notes = nullif(trim(p_payload->>'notes'), ''), updated_at = now()
  where id = p_id and archived_at is null
  returning to_jsonb(coalicion_contacts) into saved;

  if saved is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

create or replace function public.coalicion_create_contact_public(
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  saved jsonb;
  affiliation text := nullif(trim(p_payload->>'belongs_to'), '');
  contact_status text := nullif(trim(p_payload->>'status'), '');
begin
  if nullif(trim(p_payload->>'name'), '') is null or nullif(trim(p_payload->>'phone'), '') is null then
    raise exception 'name and phone are required' using errcode = '22023';
  end if;
  if affiliation is null or affiliation not in (
    'Coalicion con amor a Venezuela',
    'Fundacion Ingenia',
    'Voluntariado AVAA',
    'Voluntario Particular'
  ) then
    raise exception 'valid affiliation is required' using errcode = '22023';
  end if;
  if contact_status is not null and contact_status not in ('pending', 'contacted', 'waiting_response', 'waiting_on_us') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  insert into public.coalicion_contacts (name, national_id, phone, email, role, belongs_to, status, notes)
  values (
    trim(p_payload->>'name'),
    nullif(trim(p_payload->>'national_id'), ''),
    trim(p_payload->>'phone'),
    nullif(trim(p_payload->>'email'), ''),
    coalesce(nullif(trim(p_payload->>'role'), ''), 'Responsable'),
    affiliation,
    coalesce(contact_status, 'pending'),
    nullif(trim(p_payload->>'notes'), '')
  )
  returning to_jsonb(coalicion_contacts) into saved;

  return saved;
end;
$$;

revoke all on function public.coalicion_update_contact_public(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.coalicion_create_contact_public(jsonb) from public, anon, authenticated;
grant execute on function public.coalicion_update_contact_public(jsonb, uuid) to service_role;
grant execute on function public.coalicion_create_contact_public(jsonb) to service_role;

-- lideres_contacts: si tiene un CHECK sobre "status" (no está versionado en
-- este repo de migraciones), lo reemplazamos de forma defensiva por uno que
-- también permita 'waiting_on_us'. Si la tabla no existe en este entorno, no
-- hace nada.
do $$
declare
  existing_constraint text;
begin
  if to_regclass('public.lideres_contacts') is null then
    return;
  end if;

  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'lideres_contacts' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%'
  limit 1;

  if existing_constraint is not null then
    execute format('alter table public.lideres_contacts drop constraint %I', existing_constraint);
  end if;

  alter table public.lideres_contacts
    add constraint lideres_contacts_status_check
    check (status in ('pending', 'contacted', 'waiting_response', 'waiting_on_us'));
end $$;
