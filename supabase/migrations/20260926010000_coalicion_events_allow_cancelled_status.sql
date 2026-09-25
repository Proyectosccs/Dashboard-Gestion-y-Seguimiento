-- La tabla coalicion_events tenía una restricción (CHECK) que solo permitía
-- los 4 estados originales (planned/confirmed/in_progress/completed) —
-- bloqueaba silenciosamente el nuevo estado "Cancelada" agregado al
-- formulario. Se recrea permitiendo también 'cancelled'.

alter table public.coalicion_events
  drop constraint if exists coalicion_events_status_check;

alter table public.coalicion_events
  add constraint coalicion_events_status_check
  check (status in ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled'));
