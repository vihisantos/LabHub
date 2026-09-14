import { localStoreGet, localStoreSet } from '../../../lib/localStore'

export const PLAYER_SETTINGS_KEY = 'tv-player-settings'

export interface TvPlayerSettings {
  volume: number
  muted: boolean
}

export const DEFAULT_PLAYER_SETTINGS: Readonly<TvPlayerSettings> = {
  volume: 100,
  muted: false,
}

export function sanitizePlayerSettings(raw: unknown): TvPlayerSettings {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const volume = record.volume
  const muted = record.muted
  return {
    volume:
      typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 && volume <= 100
        ? volume
        : DEFAULT_PLAYER_SETTINGS.volume,
    muted: typeof muted === 'boolean' ? muted : DEFAULT_PLAYER_SETTINGS.muted,
  }
}

export async function loadPlayerSettings(): Promise<TvPlayerSettings> {
  try {
    const raw = await localStoreGet(PLAYER_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_PLAYER_SETTINGS }
    return sanitizePlayerSettings(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_PLAYER_SETTINGS }
  }
}

export async function savePlayerSettings(settings: TvPlayerSettings): Promise<void> {
  try {
    await localStoreSet(PLAYER_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    void 0
  }
}