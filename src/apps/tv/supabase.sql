-- Tabela de eventos para TV corporativa
create table if not exists tv_events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  image_url text,
  pdf_url text,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Tabela de playlists (YouTube / Google Drive / Cloudinary) para TV
create table if not exists tv_playlists (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  source text not null default 'youtube' check (source in ('youtube', 'google_drive', 'cloudinary')),
  youtube_url text not null,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Remove coluna legada 'type' se existir (era do schema antigo, antes da migração para tv_music_queues)
alter table tv_playlists drop column if exists type;

-- Índices para consulta rápida
create index if not exists idx_tv_events_active on tv_events(is_active, sort_order);
create index if not exists idx_tv_playlists_active on tv_playlists(is_active, sort_order);

-- Filas de música (substitui o type='music' em tv_playlists)
create table if not exists tv_music_queues (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  shuffle boolean default false,
  created_at timestamptz default now()
);

-- Tracks individuais dentro de uma fila
create table if not exists tv_music_tracks (
  id uuid default gen_random_uuid() primary key,
  queue_id uuid not null references tv_music_queues(id) on delete cascade,
  youtube_video_id text not null,
  title text not null,
  duration_seconds int default 0,
  position int not null,
  created_at timestamptz default now(),
  unique(queue_id, position)
);

alter table tv_music_tracks enable row level security;
alter table tv_music_queues enable row level security;

drop policy if exists "Permitir tudo para anon" on tv_music_queues;
create policy "Permitir tudo para anon" on tv_music_queues for all using (true) with check (true);
drop policy if exists "Permitir tudo para anon" on tv_music_tracks;
create policy "Permitir tudo para anon" on tv_music_tracks for all using (true) with check (true);

create index if not exists idx_music_tracks_queue on tv_music_tracks(queue_id, position);

-- Avisos para ticker no display
create table if not exists tv_announcements (
  id uuid default gen_random_uuid() primary key,
  text text not null,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table tv_announcements enable row level security;
drop policy if exists "Permitir tudo para anon" on tv_announcements;
create policy "Permitir tudo para anon" on tv_announcements for all using (true) with check (true);
create index if not exists idx_tv_announcements_active on tv_announcements(is_active, sort_order);

-- Galerias de fotos para slideshow
create table if not exists tv_galleries (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  is_active boolean default false,
  created_at timestamptz default now()
);

create table if not exists tv_gallery_photos (
  id uuid default gen_random_uuid() primary key,
  gallery_id uuid not null references tv_galleries(id) on delete cascade,
  image_url text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table tv_galleries enable row level security;
alter table tv_gallery_photos enable row level security;

drop policy if exists "Permitir tudo para anon" on tv_galleries;
create policy "Permitir tudo para anon" on tv_galleries for all using (true) with check (true);
drop policy if exists "Permitir tudo para anon" on tv_gallery_photos;
create policy "Permitir tudo para anon" on tv_gallery_photos for all using (true) with check (true);

alter table tv_galleries add column if not exists sort_order int default 0;

create index if not exists idx_galleries_active on tv_galleries(is_active);
create index if not exists idx_gallery_photos_order on tv_gallery_photos(gallery_id, sort_order);

-- ============================================================
-- Calendar Cache: eventos do calendário acadêmico com expiração semestral
-- ============================================================
create table if not exists tv_calendar_cache (
  id uuid primary key default gen_random_uuid(),
  semester_code text not null,           -- ex: '26/2', '27/1'
  source_url text not null,
  events jsonb default '[]'::jsonb,
  start_date date,
  end_date date,                          -- ex: 2026-12-18
  expires_at timestamptz not null,       -- ex: 2026-12-18 23:59:59
  is_active boolean default true,
  extracted_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table tv_calendar_cache enable row level security;
drop policy if exists "Permitir tudo para anon" on tv_calendar_cache;
create policy "Permitir tudo para anon" on tv_calendar_cache for all using (true) with check (true);

create index if not exists idx_calendar_cache_active on tv_calendar_cache(is_active);
create index if not exists idx_calendar_cache_expires on tv_calendar_cache(expires_at);

-- ============================================================
-- Urgent Announcements: avisos de urgência moderados pelo admin
-- ============================================================
create table if not exists tv_urgent_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'danger')),
  expires_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table tv_urgent_announcements enable row level security;
drop policy if exists "Permitir tudo para anon" on tv_urgent_announcements;
create policy "Permitir tudo para anon" on tv_urgent_announcements for all using (true) with check (true);

create index if not exists idx_urgent_active on tv_urgent_announcements(is_active);
create index if not exists idx_urgent_expires on tv_urgent_announcements(expires_at);
