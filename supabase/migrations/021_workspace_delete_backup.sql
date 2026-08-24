-- ============================================================
-- MIGRAÇÃO: Exclusão de workspace com backup (2 dias) + auditoria
-- Execute este arquivo no SQL Editor do Supabase.
--
-- 1. workspace_backups: snapshot do workspace excluído, retido por
--    2 dias e auto-limpado (cron diário + prune feito pelo app).
-- 2. workspace_audit_logs: registro de quem excluiu cada workspace.
-- 3. FKs das tabelas TV passam a ter ON DELETE CASCADE para a
--    exclusão do workspace não falhar por dependências.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Backup de workspaces excluídos (TTL de 2 dias)
-- ------------------------------------------------------------
create table if not exists workspace_backups (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid,
  workspace_name text not null,
  workspace_data jsonb not null,
  deleted_by uuid,
  deleted_by_name text,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);

create index if not exists idx_workspace_backups_expires on workspace_backups (expires_at);

-- ------------------------------------------------------------
-- 2. Auditoria de exclusão (quem excluiu e quando)
-- ------------------------------------------------------------
create table if not exists workspace_audit_logs (
  id uuid default gen_random_uuid() primary key,
  action text not null default 'delete',
  workspace_id uuid,
  workspace_name text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz default now()
);

create index if not exists idx_workspace_audit_logs_created on workspace_audit_logs (created_at);

-- ------------------------------------------------------------
-- 3. Exclusão em cascata nas tabelas de conteúdo da TV
-- ------------------------------------------------------------
alter table tv_events drop constraint if exists tv_events_workspace_id_fkey;
alter table tv_events add constraint tv_events_workspace_id_fkey
  foreign key (workspace_id) references workspaces(id) on delete cascade;

alter table tv_playlists drop constraint if exists tv_playlists_workspace_id_fkey;
alter table tv_playlists add constraint tv_playlists_workspace_id_fkey
  foreign key (workspace_id) references workspaces(id) on delete cascade;

alter table tv_music_queues drop constraint if exists tv_music_queues_workspace_id_fkey;
alter table tv_music_queues add constraint tv_music_queues_workspace_id_fkey
  foreign key (workspace_id) references workspaces(id) on delete cascade;

alter table tv_announcements drop constraint if exists tv_announcements_workspace_id_fkey;
alter table tv_announcements add constraint tv_announcements_workspace_id_fkey
  foreign key (workspace_id) references workspaces(id) on delete cascade;

alter table tv_galleries drop constraint if exists tv_galleries_workspace_id_fkey;
alter table tv_galleries add constraint tv_galleries_workspace_id_fkey
  foreign key (workspace_id) references workspaces(id) on delete cascade;

alter table tv_calendar_cache drop constraint if exists tv_calendar_cache_workspace_id_fkey;
alter table tv_calendar_cache add constraint tv_calendar_cache_workspace_id_fkey
  foreign key (workspace_id) references workspaces(id) on delete cascade;

alter table tv_urgent_announcements drop constraint if exists tv_urgent_announcements_workspace_id_fkey;
alter table tv_urgent_announcements add constraint tv_urgent_announcements_workspace_id_fkey
  foreign key (workspace_id) references workspaces(id) on delete cascade;

alter table tv_devices drop constraint if exists tv_devices_workspace_id_fkey;
alter table tv_devices add constraint tv_devices_workspace_id_fkey
  foreign key (workspace_id) references workspaces(id) on delete cascade;

-- ------------------------------------------------------------
-- 4. Auto-limpeza: apaga backups expirados diariamente às 03:00
--    (requer a extensão pg_cron ativada em Database -> Extensions).
--    Caso não esteja ativa, o app também limpa os expirados sozinho.
-- ------------------------------------------------------------
do $$
begin
  perform cron.schedule(
    'clean-expired-workspace-backups',
    '0 3 * * *',
    $del$ delete from workspace_backups where expires_at < now(); $del$
  );
exception when others then
  raise notice 'pg_cron nao disponivel: a limpeza sera feita pelo app.';
end $$;
