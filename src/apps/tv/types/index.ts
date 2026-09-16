export interface TvEvent {
  id: string
  title: string
  description: string | null
  image_url: string | null
  pdf_url: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  sort_order: number
  show_countdown?: boolean
  has_welcome?: boolean
  workspace_id?: string | null
  /** TV (tv_devices) de destino. NULL = evento do campus (todas as TVs). */
  device_id?: string | null
  /** Chave determinística da reserva (ReservaLab → TV). NULL = evento manual. */
  reservation_id?: string | null
  /** Quando true, o evento está arquivado e não deve aparecer na programação. */
  archived?: boolean
  created_at: string
}

/** Resultado bruto do resolver `tv_resolve_scheduled_content` (4-arg overload). */
export interface ScheduledResolution {
  event_id: string
  schedule_id: string | null
  workspace_id: string
  device_id: string
  date: string
  origin: 'scheduled' | 'legacy'
}

export type PlaylistSource = 'youtube' | 'google_drive' | 'cloudinary'

export interface TvPlaylist {
  id: string
  name: string
  source: PlaylistSource
  youtube_url: string
  is_active: boolean
  sort_order: number
  workspace_id?: string | null
  created_at: string
}

export type ContentType = 'video' | 'music' | 'events'

export interface TvMusicQueue {
  id: string
  name: string
  shuffle: boolean
  workspace_id?: string | null
  created_at: string
}

export interface TvMusicTrack {
  id: string
  queue_id: string
  youtube_video_id: string
  title: string
  duration_seconds: number
  position: number
  created_at: string
}

export interface TvAnnouncement {
  id: string
  text: string
  is_active: boolean
  sort_order: number
  workspace_id?: string | null
  created_at: string
}

export interface YouTubeTrackInfo {
  videoId: string
  title: string
  duration: number
}

export interface YouTubeSearchResult {
  videoId: string
  title: string
  channel: string
  thumbnail: string
}

export interface TvGallery {
  id: string
  title: string
  is_active: boolean
  sort_order: number
  workspace_id?: string | null
  created_at: string
}

export interface TvGalleryPhoto {
  id: string
  gallery_id: string
  image_url: string
  sort_order: number
  created_at: string
}

export interface TvDevice {
  id: string
  name: string
  workspace_id: string | null
  user_id: string | null
  last_seen: string | null
  created_at: string
}

export type MusicRequestStatus = 'pending' | 'approved' | 'rejected'

export interface TvMusicRequest {
  id: string
  youtube_url: string
  youtube_video_id: string | null
  title: string | null
  requested_by: string
  requested_by_name: string | null
  status: MusicRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  workspace_id?: string | null
  created_at: string
}
