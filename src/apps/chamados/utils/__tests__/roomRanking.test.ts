import { describe, expect, it } from 'vitest'
import { rankProblemRooms } from '../roomRanking'

describe('rankProblemRooms', () => {
  it('combina volume, prioridade e violações de SLA', () => {
    const ranked = rankProblemRooms(
      [['Lab 1', 2], ['Sala 2', 4]],
      [
        {
          roomName: 'Lab 1',
          status: 'aberto',
          priority: 'urgente',
          createdAt: '2026-01-01T00:00:00Z',
          resolvedAt: null,
          workspaceId: 'ws-a',
        },
        {
          roomName: 'Lab 1',
          status: 'resolvido',
          priority: 'alta',
          createdAt: '2026-01-01T00:00:00Z',
          resolvedAt: '2026-01-01T01:00:00Z',
          workspaceId: 'ws-a',
        },
        ...Array.from({ length: 4 }, (_, index) => ({
          roomName: 'Sala 2',
          status: 'resolvido',
          priority: 'normal' as const,
          createdAt: `2026-01-0${index + 1}T00:00:00Z`,
          resolvedAt: `2026-01-0${index + 1}T01:00:00Z`,
          workspaceId: 'ws-a',
        })),
      ],
      {},
      Date.parse('2026-01-01T04:00:00Z'),
    )

    expect(ranked[0]).toMatchObject({ room: 'Lab 1', total: 2, highPriority: 1, urgent: 1, overdue: 1, score: 11 })
    expect(ranked[1]).toMatchObject({ room: 'Sala 2', total: 4, urgent: 0, overdue: 0, score: 4 })
  })

  it('usa volume como fallback quando a API não inclui detalhes por chamado', () => {
    expect(rankProblemRooms([['Lab 2', 3]], [], {}, 0)[0]).toMatchObject({
      room: 'Lab 2',
      total: 3,
      score: 3,
    })
  })
})
