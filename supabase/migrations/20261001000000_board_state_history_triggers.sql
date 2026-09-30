-- Historial automático de todos los tableros (*_board_state).
--
-- Cada vez que cambia una fila de ucv_board_state, ingenia_board_state o
-- florangel_board_state, se guarda una copia en board_state_history con el
-- valor anterior y el nuevo. Lo hace la propia base de datos, así que queda
-- registrado sin importar desde qué computadora, pestaña o versión del
-- dashboard vino la escritura — incluida la pestaña Contactos del calendario,
-- que no escribía en ucv_board_state_history.
--
-- Recuperar una versión: buscar en board_state_history por table_name + key,
-- ordenado por changed_at, y volver a escribir old_value/new_value.
-- ucv_board_state_history (el historial que ya escribía el directorio UCV)
-- se conserva tal cual.

create table if not exists public.board_state_history (
  id          bigserial primary key,
  table_name  text        not null,
  key         text        not null,
  op          text        not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_value   jsonb,
  new_value   jsonb,
  changed_at  timestamptz not null default now()
);

create index if not exists idx_bsh_table_key_time
  on public.board_state_history (table_name, key, changed_at desc);

alter table public.board_state_history enable row level security;

-- Solo lectura desde el navegador (igual que los tableros, que ya son de
-- lectura pública). Nadie puede insertar, editar ni borrar el historial a
-- mano: las filas solo las crea el trigger.
drop policy if exists "board history public read" on public.board_state_history;
create policy "board history public read" on public.board_state_history
  for select using (true);

create or replace function public.log_board_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := coalesce(new.key, old.key);
begin
  -- Las preferencias de pantalla (pestaña activa, filtros…) cambian a cada
  -- rato y no son datos: no se guardan.
  if k like '%-ui-v1' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;
  insert into public.board_state_history (table_name, key, op, old_value, new_value)
  values (
    tg_table_name, k, tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then old.value end,
    case when tg_op in ('INSERT', 'UPDATE') then new.value end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_ucv_board_state_history on public.ucv_board_state;
create trigger trg_ucv_board_state_history
  after insert or update or delete on public.ucv_board_state
  for each row execute function public.log_board_state_change();

drop trigger if exists trg_ingenia_board_state_history on public.ingenia_board_state;
create trigger trg_ingenia_board_state_history
  after insert or update or delete on public.ingenia_board_state
  for each row execute function public.log_board_state_change();

drop trigger if exists trg_florangel_board_state_history on public.florangel_board_state;
create trigger trg_florangel_board_state_history
  after insert or update or delete on public.florangel_board_state
  for each row execute function public.log_board_state_change();
