export interface KioskWindow { desktop?: { isDesktop?: boolean } }

export function isKiosk(): boolean {
  if (typeof window === 'undefined') return false
  return !!window.desktop?.isDesktop
}

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