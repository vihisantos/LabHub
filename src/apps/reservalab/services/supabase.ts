import { createClient } from '@supabase/supabase-js'
import type { TabletReserva } from '../types'
import { workspaceStore } from '../../../core/workspaces/store'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: ReturnType<typeof createClient> | null = null

if (supabaseUrl && supabaseAnonKey) {
  client = createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = client

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

export async function createTabletReserva(values: Record<string, unknown>, workspaceId?: string): Promise<void> {
  if (!supabase) return
  const wsId = workspaceId || workspaceStore.activeWorkspaceId
  if (!wsId) throw new Error('Workspace não selecionado')
  await supabase.from('tablet_reservations').insert({ ...values, workspace_id: wsId } as never)
}

export async function updateTabletReserva(id: string, values: Record<string, unknown>): Promise<void> {
  if (!supabase) return
  await supabase.from('tablet_reservations').update(values as never).eq('id', id)
}

export async function deleteTabletReserva(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tablet_reservations').delete().eq('id', id)
}

export async function cleanupOldCancelledTablets(): Promise<void> {
  if (!supabase) return
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('tablet_reservations')
    .delete()
    .eq('status', 'cancelada')
    .lt('horario_inicio', seteDiasAtras)
}
