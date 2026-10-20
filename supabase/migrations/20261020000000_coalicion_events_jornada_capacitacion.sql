-- Agrega "Capacitación" (capacitacion) como valor válido de jornada_type en
-- Reuniones de Coalición. Sin esto, guardar una capacitación de Coalición
-- falla con 23514 dentro de coalicion_save_record_public (mismo caso que
-- "Pendiente por planificar" con coalicion_events_status_check).

alter table public.coalicion_events
  drop constraint if exists coalicion_events_jornada_type_check;

alter table public.coalicion_events
  add constraint coalicion_events_jornada_type_check
  check (jornada_type is null or jornada_type in ('insumos', 'medica', 'reunion', 'capacitacion'));
