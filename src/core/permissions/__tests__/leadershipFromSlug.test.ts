import { describe, it, expect } from 'vitest'
import {
  LEADERSHIP_BY_SLUG,
  areaOfSlug,
  leadershipFromSlug,
  isLeadershipRole,
  leadershipAreaOf,
} from '../leadership'
import { LeadershipLevel } from '../types'

/**
 * RBAC 2.0 (#296 PR-4C): a liderança passa a ser derivada do SLUG do cargo da
 * membership ATIVA (`memberships.role_id → public.roles.slug`), e não mais da
 * coleção local `roles` nem de `profiles.role`.
 */
describe('leadershipFromSlug — cargo vem da membership', () => {
  it('lider => liderança de unidade (área team)', () => {
    const got = leadershipFromSlug('lider')
    expect(got).not.toBeNull()
    expect(got!.isLeadership).toBe(true)
    expect(got!.leadershipLevel).toBe(LeadershipLevel.Leader)
    expect(got!.area).toBe('team')
    expect(got!.key).toBe('lider')
  })

  it('coordinator => liderança multiunidades (área coordination)', () => {
    const got = leadershipFromSlug('coordinator')
    expect(got).not.toBeNull()
    expect(got!.isLeadership).toBe(true)
    expect(got!.leadershipLevel).toBe(LeadershipLevel.Coordinator)
    expect(got!.area).toBe('coordination')
  })

  it.each(['tec', 'vis', 'est', 'opv', 'adm'])(
    'cargo não-liderança "%s" => sem liderança (fail-closed)',
    (slug) => {
      expect(leadershipFromSlug(slug)).toBeNull()
      expect(areaOfSlug(slug)).toBeNull()
    },
  )

  it.each(['role-lider', 'role-coordinator', 'tecnico', 'lideranca', 'LIDER'])(
    'slug legado/inesperado "%s" => sem liderança (sem palpite)',
    (slug) => {
      expect(leadershipFromSlug(slug)).toBeNull()
    },
  )

  it.each([null, undefined, ''])('slug vazio (%s) => sem liderança', (slug) => {
    expect(leadershipFromSlug(slug)).toBeNull()
    expect(areaOfSlug(slug)).toBeNull()
  })

  it('hierarquia: coordinator > lider > executante', () => {
    expect(leadershipFromSlug('coordinator')!.leadershipLevel).toBeGreaterThan(
      leadershipFromSlug('lider')!.leadershipLevel,
    )
    expect(leadershipFromSlug('lider')!.leadershipLevel).toBeGreaterThan(
      LeadershipLevel.None,
    )
  })

  it('nenhum slug além de lider/coordinator é liderança', () => {
    expect(Object.keys(LEADERSHIP_BY_SLUG).sort()).toEqual(['coordinator', 'lider'])
  })
})

describe('interoperabilidade com leadership.ts (shape preservado)', () => {
  it('o objeto do slug satisfaz os helpers existentes', () => {
    const fromSlug = leadershipFromSlug('lider')!
    // `isLeadershipRole`/`leadershipAreaOf` leem exatamente estes campos.
    expect(isLeadershipRole(fromSlug)).toBe(true)
    expect(leadershipAreaOf(fromSlug as never)).toBe('team')
  })

  it('um Role local sem isLeadership continua não-liderança', () => {
    // Comportamento antigo preservado: a coleção local não é mais a fonte,
    // mas os helpers puros continuam coerentes se algum Role chegar aqui.
    expect(isLeadershipRole({ isLeadership: false })).toBe(false)
    expect(leadershipAreaOf({ isLeadership: false } as never)).toBeNull()
  })
})
