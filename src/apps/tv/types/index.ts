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
  source?: "admin" | "qr"
  reviewed_by: string | null
  reviewed_at: string | null
  workspace_id?: string | null
  created_at: string
}

// ════════════════════════════════════════════════════════════════════════════
// NOVOS TIPOS PARA PROGRAMAÇÃO ACADÊMICA (LabHub TV)
// ════════════════════════════════════════════════════════════════════════════

/** Curso acadêmico (Direito, Biomedicina, Enfermagem, etc.) */
export interface TvCourse {
  id: string
  workspace_id: string | null
  name: string
  slug: string
  trailer_path: string | null     // caminho da vinheta
  color_hex: string
  sort_order: number
  created_at: string
}

/** Conteúdo acadêmico individual (vídeo ou imagem) */
export interface TvAcademicContent {
  id: string
  workspace_id: string | null
  course_id: string
  file_name: string
  file_path: string
  file_type: 'video' | 'image'
  duration_seconds: number
  is_completed: boolean
  completed_at: string | null
  thumbnail_url: string | null
  sort_order: number
  created_at: string
}

/** Conteúdo fixo/comercial institucional */
export interface TvFixedContent {
  id: string
  workspace_id: string | null
  file_name: string
  file_path: string
  file_type: 'video' | 'image'
  duration_seconds: number
  display_count: number
  last_displayed: string | null
  thumbnail_url: string | null
  sort_order: number
  is_available: boolean
  created_at: string
}

/** Conteúdo informativo (notícias, avisos, slides) */
export interface TvInformativo {
  id: string
  workspace_id: string | null
  file_name: string
  file_path: string
  file_type: 'video' | 'image'
  duration_seconds: number
  display_count: number
  last_displayed: string | null
  thumbnail_url: string | null
  sort_order: number
  is_available: boolean
  created_at: string
}

/** Tipo de conteúdo na programação */
export type ProgrammingContentType = 'academic' | 'fixed'

/** Estado da programação por workspace */
export interface TvProgrammingState {
  workspace_id: string
  cycle_version: number
  current_position: number
  academic_completed: number
  academic_since_last_fixed: number
  current_cycle_completed_ids: string[]
  last_fixed_id: string | null
  last_fixed_at: string | null
  library_version: string | null
  pending_queue_ids: string[]
  pending_order: string[]
  next_fixed_scheduled_id: string | null
  error_contents: string
  last_updated: string
}

/** Entrada de histórico de reprodução */
export interface TvPlaybackHistory {
  id: string
  workspace_id: string | null
  content_id: string
  content_type: 'academic' | 'fixed'
  playback_started: string
  playback_ended: string | null
  duration_played: number | null
  status: 'playing' | 'completed' | 'error' | 'skipped'
  error_message: string | null
  created_at: string
}

/** Item na fila de programação (unificado) */
export interface ProgrammingQueueItem {
  id: string                            // ID de academic_content ou fixed_content
  type: ProgrammingContentType
  course_id?: string                    // null para fixed
  course_name?: string
  file_path: string
  file_name: string
  file_type: 'video' | 'image'
  duration_seconds: number
  is_trailer: boolean                    // true se vinheta
  is_fixed: boolean                        // true se conteúdo fixo
}

/** Estado retomável da programação */
export interface ProgrammingCheckpoint {
  cycle_version: number
  position: number
  academic_completed: number
  academic_since_last_fixed: number
  completed_ids: string[]
  pending_order: string[]
  error_contents: string[]
  last_fixed_at: string | null
  library_version: string | null
}

/** Status de monitoramento administrativo */
export interface ProgrammingMetrics {
  total_academic_content: number
  academic_completed_current_cycle: number
  academic_pending: number
  academic_with_errors: number
  total_fixed_content: number
  fixed_available: number
  last_playback: string | null
  current_course: string | null
  cycle_progress_percent: number
  commercials_played: number
  last_commercial: string | null
  academic_since_last_commercial: number
  library_version: string | null
}
