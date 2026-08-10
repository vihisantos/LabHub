-- ============================================================
-- MIGRAÇÃO: TV corporativa multi-workspace + registro de dispositivos
-- Execute este arquivo no SQL Editor do Supabase.
-- ============================================================

-- 0. Garante a tabela workspaces (criada em bancos novos antes das FKs)
create table if not exists workspaces (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text not null unique,
  location text default '',
  spreadsheet_url text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 1. Adiciona workspace_id nas tabelas de conteúdo
alter table tv_events add column if not exists workspace_id uuid references workspaces(id);
alter table tv_playlists add column if not exists workspace_id uuid references workspaces(id);
alter table tv_music_queues add column if not exists workspace_id uuid references workspaces(id);
alter table tv_announcements add column if not exists workspace_id uuid references workspaces(id);
alter table tv_galleries add column if not exists workspace_id uuid references workspaces(id);
alter table tv_calendar_cache add column if not exists workspace_id uuid references workspaces(id);
alter table tv_urgent_announcements add column if not exists workspace_id uuid references workspaces(id);

create index if not exists idx_tv_events_workspace on tv_events(workspace_id);
create index if not exists idx_tv_playlists_workspace on tv_playlists(workspace_id);
create index if not exists idx_tv_music_queues_workspace on tv_music_queues(workspace_id);
create index if not exists idx_tv_announcements_workspace on tv_announcements(workspace_id);
create index if not exists idx_tv_galleries_workspace on tv_galleries(workspace_id);
create index if not exists idx_tv_calendar_cache_workspace on tv_calendar_cache(workspace_id);
create index if not exists idx_tv_urgent_workspace on tv_urgent_announcements(workspace_id);

-- 2. Tabela de dispositivos (TVs registradas)
create table if not exists tv_devices (
  id uuid primary key,
  name text not null,
  workspace_id uuid references workspaces(id),
  user_id uuid references auth.users(id) on delete set null,
  last_seen timestamptz,
  created_at timestamptz default now()
);

alter table tv_devices enable row level security;

-- O display kiosk roda SEM sessão (anon) para fazer heartbeat (last_seen).
-- Mesmo modelo de confiança das demais tabelas TV: qualquer cliente pode ler/atualizar.
drop policy if exists "Dispositivos: tudo para anon" on tv_devices;
create policy "Dispositivos: tudo para anon" on tv_devices for all using (true) with check (true);

create index if not exists idx_tv_devices_workspace on tv_devices(workspace_id);

-- 3. Atribui dados legados (workspace_id nulo) ao primeiro workspace existente
do $$
declare v_ws uuid;
begin
  select id into v_ws from workspaces order by created_at limit 1;
  if v_ws is not null then
    update tv_events set workspace_id = v_ws where workspace_id is null;
    update tv_playlists set workspace_id = v_ws where workspace_id is null;
    update tv_music_queues set workspace_id = v_ws where workspace_id is null;
    update tv_announcements set workspace_id = v_ws where workspace_id is null;
    update tv_galleries set workspace_id = v_ws where workspace_id is null;
    update tv_calendar_cache set workspace_id = v_ws where workspace_id is null;
    update tv_urgent_announcements set workspace_id = v_ws where workspace_id is null;
  end if;
end $$;
