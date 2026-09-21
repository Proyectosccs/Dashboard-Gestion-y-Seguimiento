-- DASHBOARD LÍDERES DE COMUNIDADES — DATOS INDEPENDIENTES (mismo proyecto Supabase, tabla propia)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar todo -> Run.
-- Una fila por líder/contacto comunitario. Sin datos sensibles que enmascarar
-- (a diferencia de Coalición Venezuela): lectura y escritura anónima abierta,
-- igual patrón de RLS que florangel_board_state / ucv_board_state.
-- "community" es texto libre (lo escribe quien carga el contacto) — el
-- dashboard agrupa por ese valor, no hay un catálogo fijo de comunidades.
-- "status" sigue el mismo set de estados que el tablero de seguimiento UCV
-- (pending/contacted/following/waiting_response/executed/blocked).
-- Borrado siempre suave (archived_at) — nunca se eliminan filas.

create table if not exists public.lideres_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  community text not null default '',
  role text not null default '',
  phone text not null default '',
  email text not null default '',
  status text not null default 'pending',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.lideres_contacts enable row level security;

drop policy if exists "lideres public read" on public.lideres_contacts;
create policy "lideres public read" on public.lideres_contacts
  for select using (true);

drop policy if exists "lideres public insert" on public.lideres_contacts;
create policy "lideres public insert" on public.lideres_contacts
  for insert with check (true);

drop policy if exists "lideres public update" on public.lideres_contacts;
create policy "lideres public update" on public.lideres_contacts
  for update using (true) with check (true);

alter publication supabase_realtime add table public.lideres_contacts;
