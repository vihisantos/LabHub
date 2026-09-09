import { createClient } from '@supabase/supabase-js'
import type { TabletReserva } from '../types'
import { workspaceStore } from '../../../core/workspaces/store'
import { defaultDb } from '../../../lib/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: ReturnType<typeof createClient> | null = null

if (supabaseUrl && supabaseAnonKey) {
  client = createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = client

/** Inventário de tablets do workspace — usado na validação de capacidade. */
export const TABLET_INVENTORY = 50

export async function fetchTabletReservas(desde?: Date, ate?: Date, workspaceId?: string): Promise<TabletReserva[]> {
  if (!supabase) return []

  const hoje = desde || new Date()
  hoje.setHours(0, 0, 0, 0)
  const limite = ate || new Date(hoje)
  if (!ate) limite.setDate(limite.getDate() + 7)

  const wsId = workspaceId || workspaceStore.activeWorkspaceId
  if (!wsId) return []

  let query = supabase
    .from('tablet_reservations')
    .select('*')
    .gte('horario_inicio', hoje.toISOString())
    .lt('horario_inicio', limite.toISOString())
    .eq('status', 'ativa')
    .eq('workspace_id', wsId)

  const { data } = await query.order('horario_inicio', { ascending: true })

  return (data as TabletReserva[]) || []
}

/**
 * Verificação de capacidade: soma os tablets em uso (reservas ativas
 * sobrepostas ao intervalo [inicio, fim], excluindo `ignoreId` na edição)
 * e compara com o inventário. Se não couber, retorna o motivo em texto
 * pronto para exibir ao usuário; se couber (ou nao ultrapassar), retorna null.
 *
 * Regra do negócio: sobreposição de horário na MESMA sala é permitida
 * desde que a soma total de tablets não ultrapasse o inventário (50).
 */
export async function checkTabletCapacity(params: {
  inicio: Date
  fim: Date
  quantidade: number
  workspaceId?: string
  ignoreId?: string
  inventory?: number
}): Promise<string | null> {
  const wsId = params.workspaceId || workspaceStore.activeWorkspaceId
  if (!supabase || !wsId) return null // sem supabase/ws: deixa o RLS decidir

  const { data } = await supabase
    .from('tablet_reservations')
    .select('id, quantidade_tablets')
    .eq('status', 'ativa')
    .eq('workspace_id', wsId)
    .lt('horario_inicio', params.fim.toISOString())
    .gt('horario_fim', params.inicio.toISOString())

  const rows = (data as Array<{ id: string; quantidade_tablets: number }>) || []
  const emUso = rows
    .filter((r) => r.id !== params.ignoreId)
    .reduce((sum, r) => sum + (Number(r.quantidade_tablets) || 0), 0)

  const inventory = params.inventory ?? TABLET_INVENTORY
  const total = emUso + params.quantidade
  if (total > inventory) {
    const disponiveis = Math.max(0, inventory - emUso)
    return (
      `Capacidade excedida: já existem ${emUso} tablet(s) reservado(s) nesse horário ` +
      `(inventário: ${inventory}). Restam ${disponiveis} — ajuste a quantidade, o horário ou a sala.`
    )
  }
  return null
}

/** Id do usuário logado (para carimbar created_by/cancelled_by). */
async function currentUserId(): Promise<string | undefined> {
  if (!defaultDb) return undefined
  try {
    const { data } = await defaultDb.auth.getSession()
    return data.session?.user?.id || undefined
  } catch {
    return undefined
  }
}

export async function createTabletReserva(values: Record<string, unknown>, workspaceId?: string): Promise<void> {
  if (!supabase) return
  const wsId = workspaceId || workspaceStore.activeWorkspaceId
  if (!wsId) throw new Error('Workspace não selecionado')

  // Auditoria: identidade real do usuário logado (migration 051).
  const createdBy = await currentUserId()
  const { error } = await supabase
    .from('tablet_reservations')
    .insert({
      ...values,
      workspace_id: wsId,
      created_at: new Date().toISOString(),
      ...(createdBy ? { created_by: createdBy } : {}),
    } as never)
  if (error) throw error
}

export async function updateTabletReserva(id: string, values: Record<string, unknown>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tablet_reservations').update(values as never).eq('id', id)
  if (error) throw error
}

export async function deleteTabletReserva(id: string): Promise<void> {
  if (!supabase) return
  // Soft delete com auditoria: quem cancelou e quando (migration 051).
  const cancelledBy = await currentUserId()
  const { error } = await supabase
    .from('tablet_reservations')
    .update({
      status: 'cancelada',
      ...(cancelledBy ? { cancelled_by: cancelledBy } : {}),
      cancelled_at: new Date().toISOString(),
    } as never)
    .eq('id', id)
  if (error) throw error
}

export async function cleanupOldCancelledTablets(): Promise<void> {
  if (!supabase) return
  const umMesAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('tablet_reservations')
    .delete()
    .eq('status', 'cancelada')
    .lt('horario_inicio', umMesAtras)
  if (error) throw error
}
