-- ============================================
-- LabHub TV — Fix RLS policies + tabelas faltando
-- ============================================
-- Execute este script no SQL Editor do Supabase.
-- ============================================

-- 1. Criar tabela tv_announcements que nunca foi criada
create table if not exists tv_announcements (
  id uuid default gen_random_uuid() primary key,
  text text not null,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table tv_announcements enable row level security;
drop policy if exists "tv_announcements_all" on tv_announcements;
create policy "tv_announcements_all" on tv_announcements
  for all using (true) with check (true);

create index if not exists idx_tv_announcements_active
  on tv_announcements(is_active, sort_order);

-- 2. Corrigir RLS de tv_events (tabela existe mas sem policy)
alter table tv_events enable row level security;
drop policy if exists "tv_events_all" on tv_events;
create policy "tv_events_all" on tv_events
  for all using (true) with check (true);

-- 3. Corrigir RLS de tv_playlists (tabela existe mas sem policy)
alter table tv_playlists enable row level security;
drop policy if exists "tv_playlists_all" on tv_playlists;
create policy "tv_playlists_all" on tv_playlists
  for all using (true) with check (true);

-- 4. Adicionar coluna source e remover type das playlists
alter table tv_playlists add column if not exists source text not null default 'youtube';
alter table tv_playlists drop constraint if exists tv_playlists_type_check;
alter table tv_playlists add constraint tv_playlists_source_check check (source in ('youtube', 'google_drive', 'cloudinary'));

-- 5. Remover duration_seconds (não mais usado)
alter table tv_playlists drop column if exists duration_seconds;
