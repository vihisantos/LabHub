/**
 * Armazenamento local cross-ambiente.
 *
 * - Desktop Tauri: comandos nativos `device_config_*`, gravados em
 *   `%APPDATA%/LabHub TV/device-config.json` com escrita atômica (`fsync` +
 *   rename no backend Rust). Não depende de `window.desktop` nem de preload.
 * - Web/PWA: `localStorage` (dados não críticos).
 *
 * A leitura aceita um valor legado do `localStorage` quando o arquivo nativo
 * ainda não existe, para não desconfigurar instalações já existentes.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'

const LEGACY_PREFIX = 'labhub-legacy-'

export function isDesktopEnv(): boolean {
  return isTauri()
}

function legacyKey(key: string): string {
  return LEGACY_PREFIX + key
}

export async function localStoreGet(key: string): Promise<string | null> {
  if (isTauri()) {
    try {
      const native = await invoke<string | null>('device_config_get', { key })
      if (native !== null && native !== undefined) return native
      // Migração: instalações antigas guardavam a config no WebView2.
      return localStorage.getItem(key) ?? localStorage.getItem(legacyKey(key))
    } catch (e) {
      console.warn('[localStore] leitura nativa falhou, usando cópia local:', e)
      return localStorage.getItem(key) ?? localStorage.getItem(legacyKey(key))
    }
  }
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function localStoreSet(key: string, value: string): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('device_config_set', { key, value })
      localStorage.removeItem(key)
      localStorage.removeItem(legacyKey(key))
      return
    } catch (e) {
      console.warn('[localStore] escrita nativa falhou, mantendo cópia local:', e)
    }
  }
  try {
    localStorage.setItem(key, value)
  } catch {
    /* cota indisponível */
  }
}

export async function localStoreRemove(key: string): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('device_config_remove', { key })
    } catch (e) {
      console.warn('[localStore] remoção nativa falhou:', e)
    }
  }
  try {
    localStorage.removeItem(key)
    localStorage.removeItem(legacyKey(key))
  } catch {
    /* ignore */
  }
}
