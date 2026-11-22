/**
 * Tipos de sincronização do Google Drive para TV.
 * Definidos aqui para compatibilidade com código existente.
 * NOTA: O backend serializa em camelCase (folderPath, pendingDownloads).
 */

export interface DriveFile {
  name: string
  size: number
  path: string
  file_type: 'video' | 'image'
}

export interface DriveSyncStatus {
  configured: boolean
  folder_path?: string | null
  folderPath?: string | null
  pending_downloads?: number
  pendingDownloads?: number
  last_error?: string | null
  lastError?: string | null
  message?: string | null
  last_sync?: string | null
  synced?: string | null
  file_count?: number
}