-- DASHBOARD DRA FLORANGEL — DATOS INDEPENDIENTES (mismo proyecto Supabase, tabla propia)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar todo -> Run.
-- Guarda tareas (kanban) y eventos (calendario) como un blob jsonb por clave,
-- igual patrón que ucv_board_state — sin datos sensibles, sin necesidad de clave.

create table if not exists public.florangel_board_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.florangel_board_state enable row level security;

drop policy if exists "florangel public read" on public.florangel_board_state;
create policy "florangel public read" on public.florangel_board_state
  for select using (true);

drop policy if exists "florangel public insert" on public.florangel_board_state;
create policy "florangel public insert" on public.florangel_board_state
  for insert with check (true);

drop policy if exists "florangel public update" on public.florangel_board_state;
create policy "florangel public update" on public.florangel_board_state
  for update using (true) with check (true);

alter publication supabase_realtime add table public.florangel_board_state;
