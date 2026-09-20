import { describe, it, expect } from 'vitest'
import { summarizePeopleCounts } from '../coordinatorHelpers'
import type {
  CoordinatorInactiveMember,
  CoordinatorRequest,
  CoordinatedUnit,
} from '../../../core/permissions/coordinatorService'
import type { Membership } from '../../../core/permissions/membership'

function unit(
  unitId: string,
  memberCountsPerLeader: number[],
  coordinationId = `coordination-${unitId}`,
): CoordinatedUnit {
  return {
    coordination: { id: coordinationId, status: 'active' } as Membership,
    unitId,
    unitName: `Unidade ${unitId}`,
    leaders: memberCountsPerLeader.map((count, i) => ({
      leadership: { id: `lead-${unitId}-${i}` } as Membership,
      profile: null,
      members: Array.from({ length: count }, (_, j) => ({
        membership: { id: `member-${unitId}-${i}-${j}`, status: 'active' } as Membership,
        profile: null,
      })),
    })),
  }
}

function request(id: string, status: Membership['status']): CoordinatorRequest {
  return { membership: { id, status } as Membership, profile: null }
}

function inactive(id: string, status: 'suspended' | 'removed'): CoordinatorInactiveMember {
  return { membership: { id, status } as Membership, profile: null }
}

describe('summarizePeopleCounts — soma dos indicadores de Pessoal (C4, PR B)', () => {
  it('contagem básica de uma unidade (líderes, membros, pendências, suspensos, removidos)', () => {
    const a = unit('a', [2, 3])
    const requests: Record<string, CoordinatorRequest[]> = {
      a: [request('r1', 'pending'), request('r2', 'pending'), request('r3', 'active')],
    }
    const inactiveByUnit: Record<string, CoordinatorInactiveMember[]> = {
      a: [inactive('s1', 'suspended'), inactive('s2', 'suspended'), inactive('r1', 'removed')],
    }

    const summary = summarizePeopleCounts([a], requests, inactiveByUnit)

    expect(summary).toEqual({
      leaderCount: 2,
      memberCount: 5,
      pendingCount: 3,
      suspendedCount: 2,
      removedCount: 1,
    })
  })

  it('multiunidade soma corretamente os valores de todas as unidades fornecidas', () => {
    const a = unit('a', [2, 3])
    const b = unit('b', [4])
    const requests: Record<string, CoordinatorRequest[]> = {
      a: [request('r1', 'pending')],
      b: [request('r2', 'pending'), request('r3', 'pending')],
    }
    const inactiveByUnit: Record<string, CoordinatorInactiveMember[]> = {
      a: [inactive('s1', 'suspended'), inactive('r1', 'removed')],
      b: [inactive('s2', 'suspended'), inactive('s3', 'suspended'), inactive('r2', 'removed')],
    }

    const summary = summarizePeopleCounts([a, b], requests, inactiveByUnit)

    expect(summary).toEqual({
      leaderCount: 3,
      memberCount: 9,
      pendingCount: 3,
      suspendedCount: 3,
      removedCount: 2,
    })
  })

  it('unidade sem dados entrega zeros honestos sem afetar as demais', () => {
    const empty = unit('empty', [])
    const withData = unit('data', [2])
    const requests: Record<string, CoordinatorRequest[]> = { data: [request('r1', 'pending')] }
    const inactiveByUnit: Record<string, CoordinatorInactiveMember[]> = {
      data: [inactive('s1', 'suspended')],
    }

    const summary = summarizePeopleCounts([empty, withData], requests, inactiveByUnit)

    expect(summary).toEqual({
      leaderCount: 1,
      memberCount: 2,
      pendingCount: 1,
      suspendedCount: 1,
      removedCount: 0,
    })

    const onlyEmpty = summarizePeopleCounts([empty], {}, {})
    expect(onlyEmpty).toEqual({
      leaderCount: 0,
      memberCount: 0,
      pendingCount: 0,
      suspendedCount: 0,
      removedCount: 0,
    })
  })

  it('suspensos e removidos permanecem categorias separadas', () => {
    const a = unit('a', [])
    const inactiveByUnit: Record<string, CoordinatorInactiveMember[]> = {
      a: [
        inactive('s1', 'suspended'),
        inactive('r1', 'removed'),
        inactive('s2', 'suspended'),
        inactive('r2', 'removed'),
      ],
    }

    const summary = summarizePeopleCounts([a], {}, inactiveByUnit)

    expect(summary.suspendedCount).toBe(2)
    expect(summary.removedCount).toBe(2)
    expect(summary.suspendedCount + summary.removedCount).toBe(inactiveByUnit.a.length)
  })

  it('nenhum dado fornecido retorna zeros (zero é legítimo)', () => {
    const summary = summarizePeopleCounts([], {}, {})
    expect(summary).toEqual({
      leaderCount: 0,
      memberCount: 0,
      pendingCount: 0,
      suspendedCount: 0,
      removedCount: 0,
    })
  })

  it('determinístico: mesmos inputs produzem sempre o mesmo resultado e não mutam as entradas', () => {
    const a = unit('a', [2, 3])
    const requests: Record<string, CoordinatorRequest[]> = {
      a: [request('r1', 'pending'), request('r2', 'active')],
    }
    const inactiveByUnit: Record<string, CoordinatorInactiveMember[]> = {
      a: [inactive('s1', 'suspended'), inactive('r1', 'removed')],
    }

    const snapshotUnits = structuredClone(a)
    const snapshotRequests = structuredClone(requests)
    const snapshotInactive = structuredClone(inactiveByUnit)

    const first = summarizePeopleCounts([a], requests, inactiveByUnit)
    const second = summarizePeopleCounts([a], requests, inactiveByUnit)

    expect(first).toEqual(second)
    expect(a).toEqual(snapshotUnits)
    expect(requests).toEqual(snapshotRequests)
    expect(inactiveByUnit).toEqual(snapshotInactive)
  })

  it('escopo: agrega somente sobre os dados fornecidos, sem descoberta externa', () => {
    const a = unit('a', [2])

    const withoutRequestsOrInactive = summarizePeopleCounts([a], {}, {})
    expect(withoutRequestsOrInactive).toEqual({
      leaderCount: 1,
      memberCount: 2,
      pendingCount: 0,
      suspendedCount: 0,
      removedCount: 0,
    })

    const withoutUnits = summarizePeopleCounts([], { a: [request('r1', 'pending')] }, {
      a: [inactive('s1', 'suspended')],
    })
    expect(withoutUnits).toEqual({
      leaderCount: 0,
      memberCount: 0,
      pendingCount: 1,
      suspendedCount: 1,
      removedCount: 0,
    })
  })
})