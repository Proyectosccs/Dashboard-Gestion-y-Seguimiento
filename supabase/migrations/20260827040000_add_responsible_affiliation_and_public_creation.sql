-- La creación de responsables es pública; revelar y editar existentes conserva la clave.
-- La afiliación es visible para identificar el color de cada ficha.

alter table public.coalicion_contacts
  add column if not exists belongs_to text;

alter table public.coalicion_contacts
  drop constraint if exists coalicion_contacts_belongs_to_check;

alter table public.coalicion_contacts
  add constraint coalicion_contacts_belongs_to_check
  check (belongs_to is null or belongs_to in (
    'Coalicion con amor a Venezuela',
    'Fundacion Ingenia',
    'Voluntariado AVAA',
    'Voluntario Particular'
  ));

grant select (belongs_to) on public.coalicion_contacts to anon, authenticated;

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

  insert into public.coalicion_contacts (name, national_id, phone, email, role, belongs_to, notes)
  values (
    trim(p_payload->>'name'),
    nullif(trim(p_payload->>'national_id'), ''),
    trim(p_payload->>'phone'),
    nullif(trim(p_payload->>'email'), ''),
    coalesce(nullif(trim(p_payload->>'role'), ''), 'Responsable'),
    affiliation,
    nullif(trim(p_payload->>'notes'), '')
  )
  returning to_jsonb(coalicion_contacts) into saved;

  return saved;
end;
$$;

create or replace function public.coalicion_save_contact(
  p_key text,
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
  affiliation text := nullif(trim(p_payload->>'belongs_to'), '');
begin
  if not public.coalicion_verify_editor_key(p_key) then
    raise exception 'invalid editor key' using errcode = '28000';
  end if;
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

  if p_id is null then
    insert into public.coalicion_contacts (name, national_id, phone, email, role, belongs_to, notes)
    values (
      trim(p_payload->>'name'), nullif(trim(p_payload->>'national_id'), ''), trim(p_payload->>'phone'),
      nullif(trim(p_payload->>'email'), ''), coalesce(nullif(trim(p_payload->>'role'), ''), 'Responsable'),
      affiliation, nullif(trim(p_payload->>'notes'), '')
    ) returning to_jsonb(coalicion_contacts) into saved;
  else
    update public.coalicion_contacts set
      name = trim(p_payload->>'name'), national_id = nullif(trim(p_payload->>'national_id'), ''),
      phone = trim(p_payload->>'phone'), email = nullif(trim(p_payload->>'email'), ''),
      role = coalesce(nullif(trim(p_payload->>'role'), ''), 'Responsable'),
      belongs_to = affiliation, notes = nullif(trim(p_payload->>'notes'), ''), updated_at = now()
    where id = p_id and archived_at is null
    returning to_jsonb(coalicion_contacts) into saved;
  end if;

  if saved is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

revoke all on function public.coalicion_create_contact_public(jsonb) from public, anon, authenticated;
revoke all on function public.coalicion_save_contact(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.coalicion_create_contact_public(jsonb) to service_role;
grant execute on function public.coalicion_save_contact(text, jsonb, uuid) to service_role;
