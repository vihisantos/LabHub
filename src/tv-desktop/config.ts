import type { Workspace } from '../core/workspaces/types'
import { localStoreGet, localStoreRemove, localStoreSet } from '../lib/localStore'

export interface DeviceConfig {
  deviceId: string
  name: string
  workspace: Workspace
  createdAt: string
}

const STORAGE_KEY = 'labhub_tv_device_config'

function isValid(parsed: unknown): parsed is DeviceConfig {
  const c = parsed as DeviceConfig
  return !!c?.deviceId && !!c?.name && !!c?.workspace?.id
}

/** Desktop: SQLite local via IPC. Web: localStorage. */
export async function loadConfig(): Promise<DeviceConfig | null> {
  try {
    const raw = await localStoreGet(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function saveConfig(config: DeviceConfig): Promise<void> {
  await localStoreSet(STORAGE_KEY, JSON.stringify(config))
}

export async function clearConfig(): Promise<void> {
  await localStoreRemove(STORAGE_KEY)
}
