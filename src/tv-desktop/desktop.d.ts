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
    }
  }
}
