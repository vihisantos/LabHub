import { isTauri } from '@tauri-apps/api/core'

export function isKiosk(): boolean {
  if (typeof window === 'undefined') return false
  // API oficial do Tauri 2: não depende de bridge injetada pelo Electron.
  return isTauri()
}

/** Alias para isKiosk, mantido para compatibilidade */
export const isDesktopEnv = isKiosk

let kioskErrorCount = 0

/** Em kiosk, registra erro localmente (sem toast). Retorna true em kiosk. */
export function kioskError(message: string, error?: unknown): boolean {
  if (!isKiosk()) return false
  kioskErrorCount += 1
  console.warn(`[TV kiosk #${kioskErrorCount}] ${message}`, error)
  return true
}

export function resetKioskErrorCount(): void {
  kioskErrorCount = 0
}