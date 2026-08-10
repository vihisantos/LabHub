/**
 * Armazenamento local cross-ambiente.
 * - Desktop (Electron): SQLite local via IPC (`window.desktop.store`).
 * - Web: localStorage.
 * Ambos têm a mesma interface assíncrona.
 */

const desktopStore = () => window.desktop?.store

export function isDesktopEnv(): boolean {
  return !!window.desktop?.isDesktop
}

export async function localStoreGet(key: string): Promise<string | null> {
  try {
    if (isDesktopEnv()) return await desktopStore()!.get(key)
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function localStoreSet(key: string, value: string): Promise<void> {
  try {
    if (isDesktopEnv()) {
      await desktopStore()!.set(key, value)
      return
    }
    localStorage.setItem(key, value)
  } catch {
    /* IPC indisponível / quota */
  }
}

export async function localStoreRemove(key: string): Promise<void> {
  try {
    if (isDesktopEnv()) {
      await desktopStore()!.delete(key)
      return
    }
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
