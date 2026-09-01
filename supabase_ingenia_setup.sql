-- CALENDARIO FUNDACIÓN INGENIA — fuentes propias "Networking Fund. Ingenia" y "Otros"
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar todo -> Run.
-- Mismo patrón simple que ucv_board_state / florangel_board_state.

create table if not exists public.ingenia_board_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ingenia_board_state enable row level security;

drop policy if exists "ingenia public read" on public.ingenia_board_state;
create policy "ingenia public read" on public.ingenia_board_state
  for select using (true);

drop policy if exists "ingenia public insert" on public.ingenia_board_state;
create policy "ingenia public insert" on public.ingenia_board_state
  for insert with check (true);

drop policy if exists "ingenia public update" on public.ingenia_board_state;
create policy "ingenia public update" on public.ingenia_board_state
  for update using (true) with check (true);

alter publication supabase_realtime add table public.ingenia_board_state;
