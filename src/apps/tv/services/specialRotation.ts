/**
 * Rodízio determinístico de Fixos e Informativos do LabHub TV.
 *
 * Nenhuma escolha usa Math.random: a ordem da rodada é derivada do nome do
 * arquivo (e do caminho como desempate) e a posição é persistida. Um arquivo
 * só entra no histórico da rodada depois que a mídia termina efetivamente.
 *
 * Regras:
 *  - uma rodada contém TODOS os arquivos válidos conhecidos da categoria;
 *  - novos arquivos do Drive são acrescentados ao fim da rodada;
 *  - arquivos alterados/removidos não herdam o histórico da versão antiga;
 *  - vídeo em cooldown é ignorado; se nenhum estiver elegível, a pendência
 *    permanece (o chamador mantém o contador da cadência ligado);
 *  - só se inicia uma nova rodada quando todos os arquivos válidos da rodada
 *    anterior foram concluídos.
 */

import type { ProgrammingQueueItem, TvInformativo } from '../types'

export type SpecialCategory = 'fixed' | 'informativo'

export interface RotationCandidate {
  id: string
  name: string
  path: string
  type: 'video' | 'image'
}

export interface RotationState {
  /** Ordem determinística da rodada atual. */
  roundIds: string[]
  /** Próxima posição a ser avaliada na rodada. */
  cursor: number
  /** IDs concluídos nesta rodada (gravados apenas após o fim da mídia). */
  playedIds: string[]
}

export interface RotationSelection {
  id: string | null
  state: RotationState
  reason: string
}

export function emptyRotationState(): RotationState {
  return { roundIds: [], cursor: 0, playedIds: [] }
}

export function fixedCandidates(items: ProgrammingQueueItem[]): RotationCandidate[] {
  return items.map(function(item) {
    return { id: item.id, name: item.file_name, path: item.file_path, type: item.file_type }
  })
}

export function informativoCandidates(items: TvInformativo[]): RotationCandidate[] {
  return items.map(function(item) {
    return { id: item.id, name: item.file_name, path: item.file_path, type: item.file_type }
  })
}

/** Ordem estável e legível: nome (case-insensitive), depois caminho, depois id. */
export function sortedRotationIds(candidates: RotationCandidate[]): string[] {
  const byId = new Map(candidates.map(function(c) { return [c.id, c] }))
  return [...candidates]
    .sort(function(a, b) {
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        || a.path.localeCompare(b.path, 'pt-BR')
        || a.id.localeCompare(b.id)
    })
    .map(function(c) { return byId.get(c.id)!.id })
}

/**
 * Reconcilia a rodada persistida com a biblioteca atual, preservando a ordem
 * conhecida e acrescentando apenas arquivos novos. Não reinicia a rodada: um
 * arquivo que continua presente mantém seu histórico de conclusão.
 */
export function reconcileRotation(state: RotationState, candidates: RotationCandidate[]): RotationState {
  const byId = new Map(candidates.map(function(c) { return [c.id, c] }))
  const roundIds: string[] = []
  const seen = new Set<string>()
  for (const id of state.roundIds) {
    if (byId.has(id) && !seen.has(id)) {
      roundIds.push(id)
      seen.add(id)
    }
  }
  for (const id of sortedRotationIds(candidates)) {
    if (!seen.has(id)) {
      roundIds.push(id)
      seen.add(id)
    }
  }
  const cursor = roundIds.length === 0 ? 0 : Math.min(Math.max(state.cursor, 0), roundIds.length - 1)
  return {
    roundIds,
    cursor,
    playedIds: state.playedIds.filter(function(id) { return byId.has(id) }),
  }
}

/** Remove da rodada um arquivo alterado, para que sua nova versão seja exibida. */
export function forgetRotationIds(state: RotationState, ids: string[]): RotationState {
  if (ids.length === 0) return state
  const invalid = new Set(ids)
  const roundIds = state.roundIds.filter(function(id) { return !invalid.has(id) })
  return {
    roundIds,
    cursor: roundIds.length === 0 ? 0 : Math.min(state.cursor, roundIds.length - 1),
    playedIds: state.playedIds.filter(function(id) { return !invalid.has(id) }),
  }
}

/**
 * Escolhe o próximo arquivo elegível da rodada, a partir do cursor salvo.
 * Nunca escolhe um arquivo já concluído, falho ou em cooldown. Quando todos os
 * arquivos válidos foram concluídos, abre uma nova rodada — ainda assim sem
 * tocar nos contadores das cadências, que só são zerados na conclusão.
 */
export function selectRotationItem(
  state: RotationState,
  candidates: RotationCandidate[],
  history: Record<string, number>,
  failedIds: string[],
  now: number,
  cooldownMs: number,
): RotationSelection {
  const byId = new Map(candidates.map(function(c) { return [c.id, c] }))
  const failed = new Set(failedIds)
  const valid = state.roundIds.filter(function(id) { return byId.has(id) && !failed.has(id) })
  if (valid.length === 0 || state.roundIds.length === 0) {
    return { id: null, state, reason: 'sem arquivos válidos na categoria' }
  }

  let played = state.playedIds.filter(function(id) { return valid.includes(id) })
  let current = state
  let restarted = false
  if (played.length === valid.length) {
    played = []
    restarted = true
    current = { ...state, playedIds: [], cursor: 0 }
  }

  const blocked: string[] = []
  for (let step = 0; step < current.roundIds.length; step++) {
    const index = (current.cursor + step) % current.roundIds.length
    const id = current.roundIds[index]
    if (!valid.includes(id) || played.includes(id)) continue
    const candidate = byId.get(id)!
    const last = history[id]
    if (candidate.type === 'video' && last !== undefined && now - last < cooldownMs) {
      const release = new Date(last + cooldownMs).toISOString()
      blocked.push(`${candidate.name} (libera às ${release})`)
      continue
    }
    return {
      id,
      state: { ...current, cursor: index },
      reason: restarted
        ? 'nova rodada: todos os arquivos válidos foram concluídos'
        : 'próximo da rodada em ordem determinística',
    }
  }

  return {
    id: null,
    state: current,
    reason: blocked.length > 0
      ? `nenhum elegível agora — cooldown: ${blocked.join('; ')}`
      : 'nenhum arquivo pendente na rodada',
  }
}

/** Registra a conclusão efetiva e aponta o cursor para o próximo candidato. */
export function completeRotationItem(state: RotationState, id: string): RotationState {
  const index = state.roundIds.indexOf(id)
  if (index === -1) return state
  const playedIds = state.playedIds.includes(id) ? state.playedIds : [...state.playedIds, id]
  return {
    roundIds: state.roundIds,
    cursor: (index + 1) % state.roundIds.length,
    playedIds,
  }
}

/** Histórico individual: apenas vídeos recebem cooldown; o mapa é podado. */
export function recordPlayback(
  history: Record<string, number>, id: string, type: 'video' | 'image', now: number, cooldownMs: number,
): Record<string, number> {
  if (type !== 'video') return history
  const recent = Object.fromEntries(
    Object.entries(history).filter(function([, time]) { return now - time < cooldownMs }),
  )
  return { ...recent, [id]: now }
}
