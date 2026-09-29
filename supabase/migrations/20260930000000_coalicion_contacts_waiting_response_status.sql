-- Agrega un tercer estado de contacto: "esperando respuesta", además de
-- pending/contacted (mismo catálogo en todos los dashboards).

alter table public.coalicion_contacts
  drop constraint if exists coalicion_contacts_status_check;

alter table public.coalicion_contacts
  add constraint coalicion_contacts_status_check
  check (status in ('pending', 'contacted', 'waiting_response'));

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
  if contact_status is not null and contact_status not in ('pending', 'contacted', 'waiting_response') then
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
  if contact_status is not null and contact_status not in ('pending', 'contacted', 'waiting_response') then
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
