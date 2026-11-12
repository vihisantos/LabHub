import type { Workspace } from './types'
import { defaultDb } from '../../lib/supabase'

export interface ConfirmedWorkspaceContext {
  workspace: Pick<Workspace, 'id' | 'name' | 'slug'>
  revision: number
}

async function accessToken(): Promise<string> {
  if (!defaultDb) throw new Error('Sessão Supabase indisponível')
  const { data, error } = await defaultDb.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Sessão expirada')
  return data.session.access_token
}

async function requestContext(method: 'GET' | 'PUT', workspaceId?: string): Promise<ConfirmedWorkspaceContext | null> {
  const token = await accessToken()
  const response = await fetch('/api/workspace/active-context', {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'PUT' ? { body: JSON.stringify({ workspace_id: workspaceId }) } : {}),
  })
  if (method === 'GET' && response.status === 404) return null
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Falha ao consultar contexto (${response.status})`)
  }
  const result = await response.json() as ConfirmedWorkspaceContext
  if (!result?.workspace?.id || !Number.isInteger(result.revision) || result.revision < 1) {
    throw new Error('Resposta inválida do contexto de workspace')
  }
  return result
}

export const sessionWorkspaceContext = {
  get: () => requestContext('GET'),
  select: (workspaceId: string) => requestContext('PUT', workspaceId),
}

export function broadcastWorkspaceContext(revision: number) {
  try {
    const channel = new BroadcastChannel('labhub-workspace-context')
    channel.postMessage({ type: 'changed', revision })
    channel.close()
  } catch {
    // Other tabs always reload the authoritative context on focus as fallback.
  }
}
