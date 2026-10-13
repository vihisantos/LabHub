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

/**
 * Tamanho de página para buscas paginadas. O PostgREST/Supabase trunca as
 * respostas no limite de linhas configurado no servidor (padrão 1000). Como
 * esse truncamento é silencioso, paginamos explicitamente com `.range()` para
 * nunca perder registros.
 */
export const TABLET_PAGE_SIZE = 1000

/** Guarda contra loop infinito caso o backend ignore `.range()`. */
const MAX_TABLET_PAGES = 100

/**
 * Resultado mínimo de uma query paginável do Supabase (builder é thenable).
 * Mantido estrutural para não acoplar o serviço aos tipos internos do client.
 */
interface TabletReservasQuery {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
}

/**
 * Executa uma busca paginada e concatena todas as páginas.
 * `buildQuery` deve devolver um builder novo, com filtros/ordenação já
 * aplicados (sem `.range()`), a cada iteração.
 */
async function fetchAllTabletPages(buildQuery: () => TabletReservasQuery): Promise<TabletReserva[]> {
  const todas: TabletReserva[] = []
  for (let page = 0; page < MAX_TABLET_PAGES; page++) {
    const from = page * TABLET_PAGE_SIZE
    const to = from + TABLET_PAGE_SIZE - 1
    const { data, error } = await buildQuery().range(from, to)
    if (error) throw error
    const rows = (data as TabletReserva[]) || []
    todas.push(...rows)
    // Última página: veio menos que o tamanho da página.
    if (rows.length < TABLET_PAGE_SIZE) break
  }
  return todas
}

/**
 * Busca reservas de tablets ativas no intervalo [desde, ate], paginando o
 * resultado. A ordenação secundária por `id` garante paginação ESTÁVEL
 * (sem duplicar/pular linhas com o mesmo `horario_inicio`).
 *
 * Por padrão, busca reservas futuras (até 90 dias à frente) quando `ate` não é
 * fornecido — mantém a semântica histórica desta função. Para o HISTÓRICO
 * COMPLETO (passado + hoje + futuro, sem janela), use `fetchAllTabletReservas`.
 *
 * @param desde - Data inicial (inclusive). Default: hoje à meia-noite.
 * @param ate - Data final (exclusiva). Default: 90 dias a partir de `desde`.
 * @param workspaceId - ID do workspace. Default: workspace ativo no store.
 * @returns Array de reservas de tablets ativas ordenadas por horario_inicio.
 */
export async function fetchTabletReservas(desde?: Date, ate?: Date, workspaceId?: string): Promise<TabletReserva[]> {
  if (!supabase) return []

  const inicio = desde ? new Date(desde) : new Date()
  inicio.setHours(0, 0, 0, 0)

  // Default: buscar 90 dias à frente (em vez de 7) para garantir visibilidade de reservas futuras
  const fim = ate ? new Date(ate) : new Date(inicio)
  if (!ate) fim.setDate(fim.getDate() + 90)

  const wsId = workspaceId || workspaceStore.activeWorkspaceId
  if (!wsId) return []

  const client = supabase
  return fetchAllTabletPages(() =>
    client
      .from('tablet_reservations')
      .select('*')
      .gte('horario_inicio', inicio.toISOString())
      .lt('horario_inicio', fim.toISOString())
      .eq('status', 'ativa')
      .eq('workspace_id', wsId)
      .order('horario_inicio', { ascending: true })
      .order('id', { ascending: true }),
  )
}

/**
 * Busca TODAS as reservas ativas do workspace — passado, hoje e futuro — sem
 * janela de datas. É a fonte do histórico exibido na ReservaLab, garantindo que
 * nada seja escondido por um corte fixo (ex.: 90 dias) e que o calendário possa
 * navegar livremente entre os meses.
 *
 * Paginada (`.range()`) para não sofrer o truncamento silencioso do PostgREST.
 * O filtro por `workspace_id` preserva o isolamento entre workspaces; o RLS do
 * backend continua sendo a autoridade final.
 */
export async function fetchAllTabletReservas(workspaceId?: string): Promise<TabletReserva[]> {
  if (!supabase) return []

  const wsId = workspaceId || workspaceStore.activeWorkspaceId
  if (!wsId) return []

  const client = supabase
  return fetchAllTabletPages(() =>
    client
      .from('tablet_reservations')
      .select('*')
      .eq('status', 'ativa')
      .eq('workspace_id', wsId)
      .order('horario_inicio', { ascending: true })
      .order('id', { ascending: true }),
  )
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
