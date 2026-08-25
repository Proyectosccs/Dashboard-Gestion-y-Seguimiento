-- Ejecutar en Supabase: SQL Editor -> New query -> pegar todo -> Run

create table if not exists public.ucv_board_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ucv_board_state enable row level security;

drop policy if exists "public read" on public.ucv_board_state;
create policy "public read" on public.ucv_board_state
  for select using (true);

drop policy if exists "public insert" on public.ucv_board_state;
create policy "public insert" on public.ucv_board_state
  for insert with check (true);

drop policy if exists "public update" on public.ucv_board_state;
create policy "public update" on public.ucv_board_state
  for update using (true) with check (true);

alter publication supabase_realtime add table public.ucv_board_state;
