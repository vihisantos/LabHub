import type { Workspace, WorkspaceFormData } from './types'
import { createLocalService } from '../../lib/storage'
import { defaultDb } from '../../lib/supabase'

const local = createLocalService<Workspace & { workspace_id?: string }>('workspaces', false)

function toSnake(data: WorkspaceFormData & { id?: string }): Workspace {
  const now = new Date().toISOString()
  return {
    id: data.id || crypto.randomUUID(),
    name: data.name,
    slug: data.slug,
    location: data.location || '',
    spreadsheet_url: data.spreadsheet_url || '',
    color: data.color || '',
    disabled_apps: data.disabled_apps ?? [],
    created_at: now,
    updated_at: now,
  }
}

async function fetchFromSupabase(): Promise<Workspace[]> {
  if (!defaultDb) return []
  const { data, error } = await defaultDb.from('workspaces').select('*').order('name')
  if (error) {
    console.warn('[Workspace] Supabase fetch error:', error.message)
    return []
  }
  return (data || []) as Workspace[]
}

async function upsertToSupabase(workspace: Workspace): Promise<boolean> {
  if (!defaultDb) return false
  const { error } = await defaultDb.from('workspaces').upsert(workspace, { onConflict: 'id' })
  if (error) {
    console.warn('[Workspace] Supabase upsert error:', error.message)
    return false
  }
  return true
}

async function removeFromSupabase(id: string): Promise<boolean> {
  if (!defaultDb) return false
  const { error } = await defaultDb.from('workspaces').delete().eq('id', id)
  if (error) {
    console.warn('[Workspace] Supabase delete error:', error.message)
    return false
  }
  return true
}

// Seed antigo (DEFAULT_WORKSPACE) gravado localmente antes de virar dado do banco.
function isLegacySeed(w: Workspace): boolean {
  return w.slug === 'piracicaba' && w.name === 'Anhembi Piracicaba'
}

function pruneLegacySeed(remoteIds: Set<string>): void {
  for (const ws of local.getAll()) {
    if (isLegacySeed(ws) && !remoteIds.has(ws.id)) {
      local.remove(ws.id)
    }
  }
}

export const workspaceService = {
  getAll: (): Workspace[] => local.getAll(),

  getById: (id: string): Workspace | undefined => local.getById(id),

  getBySlug: (slug: string): Workspace | undefined =>
    local.query((w) => w.slug === slug)[0],

  create: async (data: WorkspaceFormData): Promise<Workspace> => {
    const workspace = toSnake(data)
    local.create(workspace as any)
    await upsertToSupabase(workspace)
    return workspace
  },

  update: async (id: string, data: Partial<Workspace>): Promise<Workspace | undefined> => {
    const existing = local.getById(id)
    if (!existing) return undefined
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    local.update(id, updated)
    await upsertToSupabase(updated)
    return updated
  },

  remove: async (id: string): Promise<boolean> => {
    const ok = local.remove(id)
    if (ok) await removeFromSupabase(id)
    return ok
  },

  syncFromSupabase: async (): Promise<Workspace[]> => {
    const remote = await fetchFromSupabase()
    pruneLegacySeed(new Set(remote.map((w) => w.id)))

    if (remote.length === 0) return local.getAll()

    const localAll = local.getAll()
    const localMap = new Map(localAll.map((w) => [w.id, w]))

    for (const ws of remote) {
      const existing = localMap.get(ws.id)
      if (!existing || existing.updated_at < ws.updated_at) {
        local.update(ws.id, ws)
      }
    }

    return local.getAll()
  },
}
