import type { Workspace } from '../core/workspaces/types'
import { localStoreGet, localStoreRemove, localStoreSet } from '../lib/localStore'

/**
 * Apps de tela que o kiosk pode executar. União explícita e mínima — um novo
 * app de exibição entra aqui somente quando ganhar implementação real.
 * Preferência LOCAL do dispositivo: nunca usar para autorização, identidade
 * nem acesso a dados (isso permanece Device Auth → workspace → backend/RLS).
 */
export type ScreenAppId = 'tv' | 'chamados-dashboard'

/** Catálogo de módulos de exibição — a fonte para a UI de seleção.
 * `id` precisa ser estável (persistido no config); `label`/`description`
 * são só apresentação local do dispositivo. */
export const SCREEN_APP_OPTIONS: ReadonlyArray<{
  id: ScreenAppId
  label: string
  description: string
}> = [
  {
    id: 'tv',
    label: 'TV Corporativa',
    description: 'Eventos, avisos, galeria, clima e músicas do campus',
  },
  {
    id: 'chamados-dashboard',
    label: 'Painel de Chamados',
    description: 'Tela com o status dos chamados abertos do prédio',
  },
]

export function screenAppLabel(id: ScreenAppId): string {
  return SCREEN_APP_OPTIONS.find((o) => o.id === id)?.label ?? id
}

const VALID_SCREEN_APPS: readonly string[] = SCREEN_APP_OPTIONS.map((o) => o.id)

export interface DeviceConfig {
  deviceId: string
  name: string
  workspace: Workspace
  createdAt: string
  /** Qual tela este kiosk executa. Opcional para compatibilidade com
   * instalações existentes: ausente/inválido resolve para 'tv'. */
  screenApp?: ScreenAppId
}

const STORAGE_KEY = 'labhub_tv_device_config'

/**
 * Normaliza a preferência de tela: configurações antigas (screenApp ausente)
 * e valores desconhecidos caem na TV Corporativa — a TV nunca fica sem tela.
 */
export function resolveScreenApp(config: DeviceConfig | null | undefined): ScreenAppId {
  const value = config?.screenApp
  return typeof value === 'string' && VALID_SCREEN_APPS.includes(value) ? value : 'tv'
}

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
