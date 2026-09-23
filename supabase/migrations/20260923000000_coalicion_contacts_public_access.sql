-- Quita el requisito de clave para ver y editar contactos existentes: los
-- datos sensibles (cédula, teléfono, correo, notas) ahora son visibles
-- directamente, igual que el resto del sitio (tareas, eventos, etc., que
-- tampoco piden clave). Crear un contacto nuevo ya era público desde antes
-- (coalicion_create_contact_public); esta migración añade el equivalente
-- para "ver" (permiso de columna, lectura directa) y "editar" (función sin
-- verificación de clave, sigue pasando por el rol de servicio vía la Edge
-- Function coalicion-editor).

grant select (national_id, phone, email, notes) on public.coalicion_contacts to anon, authenticated;

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

  update public.coalicion_contacts set
    name = trim(p_payload->>'name'), national_id = nullif(trim(p_payload->>'national_id'), ''),
    phone = trim(p_payload->>'phone'), email = nullif(trim(p_payload->>'email'), ''),
    role = coalesce(nullif(trim(p_payload->>'role'), ''), 'Responsable'),
    belongs_to = affiliation, notes = nullif(trim(p_payload->>'notes'), ''), updated_at = now()
  where id = p_id and archived_at is null
  returning to_jsonb(coalicion_contacts) into saved;

  if saved is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

revoke all on function public.coalicion_update_contact_public(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.coalicion_update_contact_public(jsonb, uuid) to service_role;

-- coalicion_save_contact (con clave) y coalicion_get_contacts (con clave)
-- quedan sin usar desde el cliente, pero no se eliminan: no hacen daño
-- revocadas de anon/authenticated como ya estaban, y conservarlas evita
-- romper nada si algo externo las sigue llamando.
