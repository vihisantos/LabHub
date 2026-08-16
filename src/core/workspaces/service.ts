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
    lab_count: data.lab_count ?? 2,
    color: data.color || '',
    disabled_apps: data.disabled_apps ?? [],
    created_at: now,
    updated_at: now,
  }
}

// Fetch em andamento — vários componentes sincronizam workspaces ao mesmo
// tempo (WorkspaceProvider + modais do gate com useWorkspaces), gerando
// rajadas de requisições idênticas. Reutilizar a promessa em voo colapsa
// essas chamadas em uma única requisição.
let fetchInFlight: Promise<Workspace[] | null> | null = null

async function fetchFromSupabase(): Promise<Workspace[] | null> {
  if (!defaultDb) return null
  if (fetchInFlight) return fetchInFlight

  fetchInFlight = (async () => {
    const { data, error } = await defaultDb.from('workspaces').select('*').order('name')
    if (error) {
      console.warn('[Workspace] Supabase fetch error:', error.message)
      return null
    }
    return (data || []) as Workspace[]
  })()

  try {
    return await fetchInFlight
  } finally {
    fetchInFlight = null
  }
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
    const ok = await upsertToSupabase(updated)
    if (defaultDb && !ok) {
      throw new Error('Falha ao salvar no servidor. Tente novamente.')
    }
    local.update(id, updated)
    return updated
  },

  remove: async (id: string): Promise<boolean> => {
    const ok = local.remove(id)
    if (ok) await removeFromSupabase(id)
    return ok
  },

  syncFromSupabase: async (): Promise<Workspace[]> => {
    const remote = await fetchFromSupabase()

    if (!remote) return local.getAll()

    const localAll = local.getAll()
    const localMap = new Map(localAll.map((w) => [w.id, w]))
    const remoteIds = new Set(remote.map((w) => w.id))

    for (const ws of remote) {
      const existing = localMap.get(ws.id)
      if (!existing) {
        local.create(ws as any)
      } else if (existing.updated_at < ws.updated_at) {
        local.update(ws.id, ws)
      }
    }

    for (const ws of localAll) {
      if (!remoteIds.has(ws.id)) {
        local.remove(ws.id)
      }
    }

    return local.getAll()
  },
}
