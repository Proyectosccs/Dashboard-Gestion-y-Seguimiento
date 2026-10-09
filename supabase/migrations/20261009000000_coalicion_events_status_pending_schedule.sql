-- Reuniones de Coalición: agrega el estado "Pendiente por planificar"
-- (pending_schedule) a la restricción coalicion_events_status_check y quita
-- "Confirmado" (confirmed), que ya se eliminó del Kanban de Reuniones.
--
-- La restricción vieja solo permitía planned/confirmed/in_progress/completed/
-- cancelled, así que cualquier guardado con "Pendiente por planificar" fallaba
-- con 23514 dentro de coalicion_save_record_public y la edge function devolvía
-- 500 "operation unavailable". Esta migración no cambia la función: solo la
-- restricción.
--
-- Antes de agregar la restricción nueva, las reuniones que estuvieran en
-- "confirmed" pasan a "planned" (es lo mismo que ya se hizo con la única
-- reunión confirmada, Naiguata).

update public.coalicion_events
  set status = 'planned'
  where status = 'confirmed';

alter table public.coalicion_events
  drop constraint if exists coalicion_events_status_check;

alter table public.coalicion_events
  add constraint coalicion_events_status_check
  check (status in ('pending_schedule', 'planned', 'in_progress', 'completed', 'cancelled'));
