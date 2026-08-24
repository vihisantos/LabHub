import { appRegistry } from '../../appRegistry'
import type { AppModule } from '../../appRegistry'
import { defaultDb } from '../../lib/supabase'
import { workspaceStore } from '../workspaces/store'
import type { AppSettingsDefinition, DeepPartial } from './types'

/**
 * Core de configuração por (workspace, app) sobre a tabela
 * `workspace_app_settings` (migration 031).
 *
 * Pipeline de leitura:  defaultSettings -> settings persistidos -> deepMerge -> validateSettings -> tipado
 * Pipeline de escrita:  valor atual -> patch -> deepMerge -> validateSettings -> upsert -> cache atualizado
 *
 * Isolamento: a chave de cache SEMPRE inclui o workspace ativo resolvido pelo
 * workspaceStore (fonte única sincronizada pelo WorkspaceProvider). Nenhum
 * componente passa workspace_id arbitrário. Escrita/leitura cruzada entre
 * workspaces é bloqueada no servidor pelas policies da migration 031; aqui o
 * frontend apenas garante não misturar caches nem enviar workspace errado.
 */

interface CacheEntry {
  value: unknown
  updatedAt: string | null
}

const cache = new Map<string, CacheEntry>()

function requireDb() {
  if (!defaultDb) throw new Error('Supabase not initialized')
  return defaultDb
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Merge profundo: objetos aninhados são combinados chave a chave; arrays,
 * Dates e escalares do patch substituem o valor base por inteiro. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return clone(base)
  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {}
  for (const [key, patchValue] of Object.entries(patch)) {
    if (!isPlainObject(patchValue)) {
      out[key] = patchValue === undefined ? out[key] : clone(patchValue)
      continue
    }
    const baseValue = isPlainObject(base) ? (base as Record<string, unknown>)[key] : undefined
    out[key] = deepMerge(baseValue ?? {}, patchValue)
  }
  return out as T
}

function requireActiveWorkspaceId(): string {
  const wsId = workspaceStore.activeWorkspaceId
  if (!wsId) throw new Error('Nenhum workspace ativo: selecione um workspace antes de acessar configurações')
  return wsId
}

export function findApp(appId: string): AppModule {
  const app = appRegistry.find((a) => a.id === appId)
  if (!app) throw new Error(`App não registrado: ${appId}`)
  return app
}

function findDefinition(appId: string): AppSettingsDefinition<unknown> {
  const app = findApp(appId)
  if (!app.settings) throw new Error(`App sem definição de settings: ${appId}`)
  return app.settings
}

/** Aplica defaults -> merge -> validação. Qualquer falha cai nos defaults
 * seguros e registra o erro sem propagar (a UI nunca quebra por JSON sujo). */
function buildValidated(def: AppSettingsDefinition<unknown>, stored: unknown): unknown {
  let base = stored
  if (!isPlainObject(base)) {
    if (base !== null && base !== undefined) {
      console.error('[appSettings] formato inesperado de configuração persistida; usando defaults', base)
    }
    base = {}
  }
  const merged = deepMerge(def.defaultSettings, base)
  try {
    return def.validateSettings(merged)
  } catch (err) {
    console.error('[appSettings] configuração inválida persistida; usando defaults', err)
    return clone(def.defaultSettings)
  }
}

async function fetchRow(workspaceId: string, appId: string): Promise<{ settings: unknown; updated_at: string | null } | null> {
  const db = requireDb()
  const { data, error } = await db
    .from('workspace_app_settings')
    .select('settings,updated_at')
    .eq('workspace_id', workspaceId)
    .eq('app_id', appId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { settings: data.settings, updated_at: data.updated_at ?? null }
}

/**
 * Configurações resolvidas do app no workspace ativo.
 * Cache em memória keyed por `${workspaceId}:${appId}` — trocar de workspace
 * nunca reutiliza cache do anterior (chave diferente).
 */
export async function getSettings<T>(appId: string): Promise<T> {
  const workspaceId = requireActiveWorkspaceId()
  const def = findDefinition(appId)
  const key = `${workspaceId}:${appId}`

  const cached = cache.get(key)
  if (cached) return clone(cached.value) as T

  try {
    const row = await fetchRow(workspaceId, appId)
    const value = buildValidated(def, row?.settings)
    cache.set(key, { value, updatedAt: row?.updated_at ?? null })
    return clone(value) as T
  } catch (err) {
    // Falha de rede/permissão na leitura: usa defaults, registra e NÃO popula
    // cache (próxima chamada tenta de novo). Nunca derruba a UI do app.
    console.error('[appSettings] falha ao carregar configuração; usando defaults', err)
    return clone(def.defaultSettings) as T
  }
}

/** Data da última alteração persistida (para exibição), se houver. */
export async function getUpdatedAt(appId: string): Promise<string | null> {
  const workspaceId = requireActiveWorkspaceId()
  const key = `${workspaceId}:${appId}`
  const cached = cache.get(key)
  if (cached) return cached.updatedAt
  const row = await fetchRow(workspaceId, appId)
  return row?.updated_at ?? null
}

/**
 * Aplica um patch parcial sobre as configurações atuais, valida e persiste
 * via upsert (ON CONFLICT (workspace_id, app_id)). O cache é atualizado
 * imediatamente com o valor validado — a próxima leitura não refaz requisição.
 * Erros de permissão (RLS 031: só super admin / admin do workspace) propagam.
 */
export async function upsertSettings<T>(appId: string, patch: DeepPartial<T>): Promise<T> {
  const workspaceId = requireActiveWorkspaceId()
  const def = findDefinition(appId)

  const current = await getSettings<T>(appId)
  const merged = deepMerge(current, patch)

  let validated: unknown
  try {
    validated = def.validateSettings(merged)
  } catch (err) {
    console.error('[appSettings] patch rejeitado pela validação', err)
    throw err instanceof Error ? err : new Error('Configuração inválida')
  }

  let updatedBy: string | undefined
  try {
    const { data } = await requireDb().auth.getUser()
    updatedBy = data.user?.id ?? undefined
  } catch {
    updatedBy = undefined
  }

  const updatedAt = new Date().toISOString()
  const db = requireDb()
  const { error } = await db
    .from('workspace_app_settings')
    .upsert(
      {
        workspace_id: workspaceId,
        app_id: appId,
        settings: validated,
        updated_by: updatedBy,
        updated_at: updatedAt,
      },
      { onConflict: 'workspace_id,app_id' },
    )
  if (error) throw error

  cache.set(`${workspaceId}:${appId}`, { value: validated, updatedAt })
  return clone(validated) as T
}

/** Invalida cache do app no workspace ativo (ou de todos os apps, se omitido). */
export function invalidate(appId?: string): void {
  const workspaceId = workspaceStore.activeWorkspaceId
  if (!workspaceId) {
    cache.clear()
    return
  }
  if (appId) {
    cache.delete(`${workspaceId}:${appId}`)
    return
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${workspaceId}:`)) cache.delete(key)
  }
}

/** Limpa todo o cache (logout, testes). */
export function clearCache(): void {
  cache.clear()
}

/**
 * Superfície pública do serviço. Deliberadamente NÃO expõe update/delete:
 * a migration 031 define backups/settings como append-only para roles comuns
 * (device da TV tem SELECT, nunca INSERT/UPDATE/DELETE).
 */
export const appSettingsService = {
  getSettings,
  upsertSettings,
  getUpdatedAt,
  invalidate,
  clearCache,
}
