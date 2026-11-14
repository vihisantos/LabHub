export {}

declare global {
  interface Window {
    /** API do Tauri (desktop nativo) */
    __TAURI__?: {
      core: {
        invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>
      }
      dir: {
        applet: () => Promise<string | null>
        cache: () => Promise<string>
        config: () => Promise<string>
        desktop: () => Promise<string>
        document: () => Promise<string>
        download: () => Promise<string>
        executable: () => Promise<string>
        home: () => Promise<string>
        runtime: () => Promise<string>
        sample: () => Promise<string>
        temp: () => Promise<string>
        video: () => Promise<string>
        voice: () => Promise<string>
      }
    }
    /** API do Tauri (desktop nativo) - alias para window.__TAURI__ */
    desktop?: {
      isDesktop?: boolean
      openAdmin?: () => void
      quit?: () => void
      reportAlive?: () => void
      reloadRenderer?: () => void
      /** Store local (SQLite no userData) — substitui o localStorage no desktop */
      store?: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
        delete: (key: string) => Promise<void>
      }
      /** Auto-update (electron-updater → GitHub Releases) */
      updates?: {
        getVersion: () => Promise<string>
        check: () => Promise<{ version?: string | null; dev?: boolean; message?: string }>
        download: () => Promise<void>
        install: () => void
        onStatus: (callback: (status: UpdateStatus) => void) => () => void
      }
    }
    /** API de descoberta do Google Drive (via Tauri) */
    drive?: {
      /** Lista arquivos sincronizados do Google Drive */
      listSyncedFiles: () => Promise<DriveFile[]>
      /** Status da sincronização */
      getSyncStatus: () => Promise<DriveSyncStatus | null>
      /** Configura caminho da pasta de sincronização */
      configureSync: (folderPath: string, accountConfirmed: boolean) => Promise<DriveSyncStatus>
      /** Sincroniza o conteúdo do Drive */
      syncDriveContent: () => Promise<DriveFile[]>
    }
    /** API de programação acadêmica */
    programming?: {
      /** Estado atual da programação */
      getState: () => Promise<ProgrammingState | null>
      /** Salva estado da programação */
      saveState: (state: ProgrammingState) => Promise<void>
      /** Reseta estado da programação */
      resetState: () => Promise<void>
    }
  }
}

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