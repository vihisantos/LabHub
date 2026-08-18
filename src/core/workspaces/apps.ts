import { appRegistry } from '../../appRegistry'
import type { Workspace } from './types'

// Apps que podem ser ativados/desativados por workspace.
// Admin e Dashboard ficam sempre ligados (evita se trancar).
export const APPS_CONFIGURABLE = appRegistry
  .filter((app) => app.id !== 'admin' && app.id !== 'dashboard')
  .map((app) => app.id)

export function isAppDisabled(appId: string, workspace?: Workspace | null): boolean {
  if (!workspace) return false
  return (workspace.disabled_apps ?? []).includes(appId)
}

export function filterAppsByWorkspace<T extends { id: string }>(
  apps: T[],
  workspace?: Workspace | null,
): T[] {
  if (!workspace) return apps
  const disabled = new Set(workspace.disabled_apps ?? [])
  return apps.filter((app) => !disabled.has(app.id))
}

/** Módulo disponível = workspace permite E usuário tem acesso. */
export function isModuleAvailable(
  appId: string,
  workspace: Workspace | null | undefined,
  canAccessApp: (id: string) => boolean,
): boolean {
  return !isAppDisabled(appId, workspace) && canAccessApp(appId)
}
