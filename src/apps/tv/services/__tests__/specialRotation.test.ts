import { describe, expect, it } from 'vitest'
import {
  completeRotationItem,
  emptyRotationState,
  forgetRotationIds,
  reconcileRotation,
  recordPlayback,
  selectRotationItem,
  sortedRotationIds,
  type RotationCandidate,
  type RotationState,
} from '../specialRotation'

const COOLDOWN = 10 * 60_000
const NOW = 1_800_000_000_000

function candidate(id: string, name: string, type: 'video' | 'image' = 'video'): RotationCandidate {
  return { id, name, path: `/media/${id}`, type }
}

/** Nomes fora de ordem alfabética: a fila não pode depender da ordem do Drive. */
const FIXOS = [
  candidate('f5', 'zeta.mp4'),
  candidate('f2', 'beta.mp4'),
  candidate('f4', 'delta.mp4'),
  candidate('f1', 'alfa.mp4'),
  candidate('f3', 'gamma.mp4'),
]
const INFORMATIVOS = [
  candidate('i4', 'ultimo.png', 'image'),
  candidate('i2', 'segundo.mp4'),
  candidate('i1', 'primeiro.jpg', 'image'),
  candidate('i3', 'terceiro.mp4'),
]

function playFullRound(candidates: RotationCandidate[]): {
  state: RotationState
  ids: string[]
  reasons: string[]
} {
  let state = reconcileRotation(emptyRotationState(), candidates)
  const ids: string[] = []
  const reasons: string[] = []
  for (let i = 0; i < candidates.length; i++) {
    const selection = selectRotationItem(state, candidates, {}, [], NOW, COOLDOWN)
    if (!selection.id) throw new Error(`rodada parou no item ${i}: ${selection.reason}`)
    ids.push(selection.id)
    reasons.push(selection.reason)
    expect(selection.state.playedIds).not.toContain(selection.id)
    state = completeRotationItem(selection.state, selection.id)
  }
  return { state, ids, reasons }
}

describe('rodízio determinístico de Fixos e Informativos', () => {
  it('exibe os cinco fixos e os quatro informativos antes de qualquer repetição', () => {
    const fixed = playFullRound(FIXOS)
    const informativos = playFullRound(INFORMATIVOS)

    expect(fixed.ids).toHaveLength(5)
    expect(new Set(fixed.ids).size).toBe(5)
    expect(fixed.ids).toEqual(sortedRotationIds(FIXOS))
    expect(informativos.ids).toHaveLength(4)
    expect(new Set(informativos.ids).size).toBe(4)
    expect(informativos.ids).toEqual(sortedRotationIds(INFORMATIVOS))

    expect(fixed.state.playedIds).toHaveLength(5)
    expect(informativos.state.playedIds).toHaveLength(4)
  })

  it('abre nova rodada sem favorecer o arquivo que acabou de passar', () => {
    const round = playFullRound(FIXOS)
    const next = selectRotationItem(round.state, FIXOS, {}, [], NOW, COOLDOWN)

    expect(next.id).toBe(sortedRotationIds(FIXOS)[0])
    expect(next.id).not.toBe(round.ids[round.ids.length - 1])
    expect(next.state.playedIds).toEqual([])
    expect(next.reason).toMatch(/nova rodada/)
  })

  it('aplica cooldown individual e procura outro elegível da mesma categoria', () => {
    const history: Record<string, number> = {
      f1: NOW - 1000,
      f2: NOW - 1000,
      f4: NOW - COOLDOWN - 1,
    }
    const state = reconcileRotation(emptyRotationState(), FIXOS)
    const selection = selectRotationItem(state, FIXOS, history, [], NOW, COOLDOWN)

    // f1/f2 foram concluídos agora; a ordem determinística f1 → f2 → f4 pula os dois.
    expect(selection.id).toBe('f4')
    expect(selection.reason).not.toMatch(/nenhum elegível/)
  })

  it('preserva a pendência quando todos os vídeos estão em cooldown', () => {
    const history: Record<string, number> = Object.fromEntries(
      FIXOS.map(function(f) { return [f.id, NOW - 1000] }),
    )
    const state: RotationState = {
      roundIds: sortedRotationIds(FIXOS), cursor: 0, playedIds: [],
    }
    const selection = selectRotationItem(state, FIXOS, history, [], NOW, COOLDOWN)

    expect(selection.id).toBeNull()
    expect(selection.state).toEqual(state)
    expect(selection.reason).toMatch(/nenhum elegível agora — cooldown/)
    expect(selection.reason).toMatch(/libera às/)
  })

  it('não registra como reproduzido só por selecionar', () => {
    const state = reconcileRotation(emptyRotationState(), FIXOS)
    const selection = selectRotationItem(state, FIXOS, {}, [], NOW, COOLDOWN)

    expect(selection.state.playedIds).toEqual([])
    const done = completeRotationItem(selection.state, selection.id!)
    expect(done.playedIds).toEqual([selection.id])
  })

  it('não escolhe arquivo que falhou e não o considera concluído', () => {
    const state = reconcileRotation(emptyRotationState(), FIXOS)
    const first = selectRotationItem(state, FIXOS, {}, ['f1'], NOW, COOLDOWN)
    expect(first.id).toBe('f2')
    expect(first.state.playedIds).toEqual([])

    const afterF2 = completeRotationItem(first.state, 'f2')
    const second = selectRotationItem(afterF2, FIXOS, {}, ['f1'], NOW, COOLDOWN)
    // Ordem determinística: alfa(f1) → beta(f2) → delta(f4) → gamma(f3) → zeta(f5)
    expect(second.id).toBe('f4')
    expect(second.state.playedIds).toEqual(['f2'])
  })

  it('acrescenta arquivos novos ao fim da rodada sem reiniciar o histórico', () => {
    const initial = reconcileRotation(emptyRotationState(), FIXOS.slice(0, 2))
    const started = completeRotationItem(initial, initial.roundIds[0])
    const expanded = reconcileRotation(started, FIXOS)
    const expected = [...started.roundIds]
    for (const id of sortedRotationIds(FIXOS)) {
      if (!expected.includes(id)) expected.push(id)
    }

    expect(expanded.roundIds).toEqual(expected)
    expect(expanded.playedIds).toEqual(started.playedIds)

    let state = expanded
    const chosen: string[] = []
    for (let i = 0; i < 3; i++) {
      const selection = selectRotationItem(state, FIXOS, {}, [], NOW, COOLDOWN)
      chosen.push(selection.id!)
      state = completeRotationItem(selection.state, selection.id!)
    }
    expect(new Set(chosen).size).toBe(3)
  })

  it('remove arquivo alterado e acrescenta a nova versão ao fim da rodada', () => {
    const round = playFullRound(FIXOS)
    const changed = forgetRotationIds(round.state, [round.ids[0]])
    expect(changed.roundIds).not.toContain(round.ids[0])
    expect(changed.playedIds).not.toContain(round.ids[0])

    const reconciled = reconcileRotation(changed, FIXOS)
    expect(reconciled.roundIds).toContain(round.ids[0])
    expect(reconciled.roundIds[reconciled.roundIds.length - 1]).toBe(round.ids[0])

    // A versão alterada volta a ser elegível antes de nova rodada completa.
    let state = reconciled
    const seen: string[] = []
    for (let i = 0; i < FIXOS.length; i++) {
      const selection = selectRotationItem(state, FIXOS, {}, [], NOW, COOLDOWN)
      seen.push(selection.id!)
      state = completeRotationItem(selection.state, selection.id!)
    }
    expect(seen).toContain(round.ids[0])
  })

  it('só vídeos recebem cooldown no histórico individual', () => {
    const imageHistory = recordPlayback({}, 'i1', 'image', NOW, COOLDOWN)
    expect(imageHistory).toEqual({})

    const videoHistory = recordPlayback(imageHistory, 'f1', 'video', NOW, COOLDOWN)
    expect(videoHistory).toEqual({ f1: NOW })
    expect(recordPlayback(videoHistory, 'f2', 'video', NOW + COOLDOWN + 1, COOLDOWN))
      .toEqual({ f2: NOW + COOLDOWN + 1 })
  })
})
