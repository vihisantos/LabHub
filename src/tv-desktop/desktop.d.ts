export {}

declare global {
  interface Window {
    /** API exposta pelo preload do Electron (ausente quando rodando no navegador) */
    desktop?: {
      isDesktop?: boolean
      openAdmin?: () => void
      quit?: () => void
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
