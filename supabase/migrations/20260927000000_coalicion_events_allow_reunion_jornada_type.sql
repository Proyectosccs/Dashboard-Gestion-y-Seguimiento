-- Agrega "Reunión" como valor válido de jornada_type (antes solo permitía
-- insumos/medica) — el formulario ahora ofrece "Tipo de Jornada / Reunión"
-- con esta tercera opción en todos los calendarios.

alter table public.coalicion_events
  drop constraint if exists coalicion_events_jornada_type_check;

alter table public.coalicion_events
  add constraint coalicion_events_jornada_type_check
  check (jornada_type is null or jornada_type in ('insumos', 'medica', 'reunion'));
