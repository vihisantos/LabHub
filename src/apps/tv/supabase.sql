-- Tabela de eventos para TV corporativa
create table if not exists tv_events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  image_url text,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Tabela de playlists (YouTube) para TV
create table if not exists tv_playlists (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text not null check (type in ('video', 'music')),
  youtube_url text not null,
  duration_seconds int default 30,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Índices para consulta rápida
create index if not exists idx_tv_events_active on tv_events(is_active, sort_order);
create index if not exists idx_tv_playlists_active on tv_playlists(is_active, sort_order);
