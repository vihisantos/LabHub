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

create index if not exists idx_galleries_active on tv_galleries(is_active);
create index if not exists idx_gallery_photos_order on tv_gallery_photos(gallery_id, sort_order);
