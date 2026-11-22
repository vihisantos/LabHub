export {}

/* Sem `declare global`: a cadeia desktop usa exclusivamente os imports
 * oficiais de `@tauri-apps/api/*` (`invoke`, `convertFileSrc`, `isTauri`).
 * Não existem `window.desktop`, `window.drive`, `window.programming` nem
 * `window.__TAURI__` no runtime Tauri 2 desta aplicação. */

export interface UpdateStatus {
  type: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error'
  version?: string
  percent?: number
  transferred?: number
  total?: number
  message?: string
}

export interface DriveFile {
  name: string
  size: number
  path: string
  fileType: 'video' | 'image'
  file_type: 'video' | 'image'
}

export interface DriveSyncStatus {
  configured: boolean
  folder_path: string | null
  local_storage_path: string | null
  config_path: string
  message: string | null
  pending_downloads: number
  pending_deletes: number
  last_sync_at: number | null
  last_error: string | null
}

export interface ProgrammingState {
  cycle: number
  position: number
  academicCompleted: number
  academicSinceLastFixed: number
  completedIds: string[]
  pendingQueue: string[]
  nextFixedId: string | null
  libraryVersion: string | null
  errorContents: string[]
}

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
  next_informative?: {
    id: string
    file_name: string
    path: string
    type: 'video' | 'image'
  } | null
  last_sync?: string | null
  discovery_errors?: string[] | null
}

export interface InformativoContent {
  id: string
  name: string
  path: string
  type: 'video' | 'image'
  duration: number
  displayCount: number
  lastDisplayed?: string
  isAvailable: boolean
}