export interface TvEvent {
  id: string
  title: string
  description: string | null
  image_url: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface TvPlaylist {
  id: string
  name: string
  type: 'video' | 'music'
  youtube_url: string
  duration_seconds: number
  is_active: boolean
  sort_order: number
  created_at: string
}

export type ContentType = 'video' | 'music' | 'events'

export interface TvMusicQueue {
  id: string
  name: string
  shuffle: boolean
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

export interface YouTubeTrackInfo {
  videoId: string
  title: string
  duration: number
}
