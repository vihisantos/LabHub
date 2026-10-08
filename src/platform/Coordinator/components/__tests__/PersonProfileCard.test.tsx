import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PersonProfileCard } from '../PersonProfileCard'
import type { AggregatedPerson } from '../../coordinatorHelpers'
import { COORDINATOR_LEADER_LABEL, peopleStatusLabel } from '../../coordinatorHelpers'
import type { MembershipStatus, TeamMemberProfile } from '../../../../core/permissions/membership'

/**
 * PersonProfileCard — card de perfil da aba Pessoal (#363, READ-ONLY).
 *
 * O componente recebe a PESSOA CONSOLIDADA (`AggregatedPerson`) — 1 perfil →
 * 1 card → N unidades já autorizadas pelo servidor — e é APENAS visual:
 * banner/foto reais do perfil com fallback local (iniciais/gradiente), avatar
 * ACIMA do banner (layering sem clipping), unidades em chips compactos (+N),
 * e status/cargo/responsável por vínculo quando divergem (nenhuma prioridade
 * inventada). Estes testes cobrem fotos, fallbacks, campos exibidos, os 4
 * status reais, layering (stacking), estados uniforme/divergente e a estrutura
 * responsiva mobile-first (sem largura fixa — o card preenche a célula).
 */

function baseProfile(): TeamMemberProfile {
  return {
    id: 'u-ms-1',
    name: 'Ana Líder',
    email: 'ana@labhub.app',
    status: 'active',
    roleId: 'role-technician',
  }
}

function unit(over: Partial<AggregatedPerson['units'][number]> = {}): AggregatedPerson['units'][number] {
  return {
    membershipId: 'ms-1',
    unitId: 'ws1',
    unitName: 'Campus A',
    roleLabel: 'Técnico',
    status: 'active',
    leader: null,
    ...over,
  }
}

function person(
  units: AggregatedPerson['units'] = [unit()],
  over: Partial<AggregatedPerson> = {},
): AggregatedPerson {
  return {
    profileId: 'u-ms-1',
    profile: baseProfile(),
    name: 'Ana Líder',
    email: 'ana@labhub.app',
    units,
    ...over,
  }
}

function renderCard(person: AggregatedPerson) {
  return render(
    <ul>
      <PersonProfileCard person={person} />
    </ul>,
  )
}

describe('PersonProfileCard — card de perfil da aba Pessoal', () => {
  it('renderiza FOTO real do perfil (profiles.avatar) e o avatar fica ACIMA do banner', () => {
    renderCard(person([unit()], { profile: { ...baseProfile(), avatar: 'https://cdn.labhub.app/avatar.png' } }))

    const img = screen.getByTestId('people-avatar-img-ms-1')
    expect(img).toHaveAttribute('src', 'https://cdn.labhub.app/avatar.png')
    expect(screen.queryByTestId('people-avatar-fallback-ms-1')).toBeNull()
  })

  it('renderiza fallback de INICIAIS quando não há foto (nunca inventa)', () => {
    renderCard(person())

    const fallback = screen.getByTestId('people-avatar-fallback-ms-1')
    expect(fallback).toHaveTextContent('AL') // initials('Ana Líder')
    expect(screen.queryByTestId('people-avatar-img-ms-1')).toBeNull()
  })

  it('fallback de iniciais com avatar vazio também (profiles.avatar = "")', () => {
    renderCard(person([unit()], { profile: { ...baseProfile(), avatar: '' } }))

    expect(screen.getByTestId('people-avatar-fallback-ms-1')).toBeInTheDocument()
    expect(screen.queryByTestId('people-avatar-img-ms-1')).toBeNull()
  })

  it('renderiza BANNER real quando disponível (profiles.banner)', () => {
    renderCard(person([unit()], { profile: { ...baseProfile(), banner: 'https://cdn.labhub.app/banner.png' } }))

    const banner = screen.getByTestId('people-banner-img-ms-1')
    expect(banner).toHaveAttribute('src', 'https://cdn.labhub.app/banner.png')
    expect(screen.queryByTestId('people-banner-fallback-ms-1')).toBeNull()
  })

  it('fallback de BANNER: gradiente do tema quando não há banner', () => {
    renderCard(person())

    expect(screen.getByTestId('people-banner-fallback-ms-1')).toBeInTheDocument()
    expect(screen.queryByTestId('people-banner-img-ms-1')).toBeNull()
  })

  it('exibe o NOME e o E-MAIL da pessoa', () => {
    renderCard(person())

    expect(screen.getByText('Ana Líder')).toBeInTheDocument()
    expect(screen.getByText('ana@labhub.app')).toBeInTheDocument()
  })

  it('exibe o CARGO uniforme (roleLabel único dos vínculos autorizados)', () => {
    renderCard(person([unit({ roleLabel: 'Líder' })]))

    expect(screen.getByText('Líder')).toBeInTheDocument()
  })

  it('cargos DIVERGENTES entre unidades: exibe os rótulos distintos (sem "principal" inventado)', () => {
    renderCard(person([
      unit({ membershipId: 'ms-1', unitName: 'Campus A', roleLabel: 'Analista de TI' }),
      unit({ membershipId: 'ms-2', unitName: 'Campus B', roleLabel: 'Líder' }),
    ]))

    expect(screen.getByText('Analista de TI · Líder')).toBeInTheDocument()
  })

  it('exibe cada UNIDADE como chip compacto (people-unit-<membershipId>)', () => {
    renderCard(person([
      unit({ membershipId: 'ms-1', unitName: 'Campus A' }),
      unit({ membershipId: 'ms-2', unitName: 'Campus B' }),
    ]))

    expect(screen.getByTestId('people-units-ms-1')).toHaveTextContent('Campus A')
    expect(screen.getByTestId('people-unit-ms-1')).toBeInTheDocument()
    expect(screen.getByTestId('people-unit-ms-2')).toHaveTextContent('Campus B')
  })

  it('muitas unidades: mantém N chips visíveis e colapsa o restante em +N', () => {
    renderCard(person([
      unit({ membershipId: 'ms-1', unitName: 'Campus 1' }),
      unit({ membershipId: 'ms-2', unitName: 'Campus 2' }),
      unit({ membershipId: 'ms-3', unitName: 'Campus 3' }),
      unit({ membershipId: 'ms-4', unitName: 'Campus 4' }),
      unit({ membershipId: 'ms-5', unitName: 'Campus 5' }),
    ]))

    expect(screen.getByTestId('people-unit-ms-1')).toBeInTheDocument()
    expect(screen.getByTestId('people-unit-ms-3')).toBeInTheDocument()
    expect(screen.queryByTestId('people-unit-ms-4')).toBeNull()
    const more = screen.getByTestId('people-units-more-ms-1')
    expect(more).toHaveTextContent('+2')
    expect(more).toHaveAccessibleName('Mais 2 unidades: Campus 4, Campus 5')
  })

  it('exibe o LÍDER/RESPONSÁVEL: nome da liderança real', () => {
    renderCard(person([unit({
      leader: { membershipId: 'ms-l1', name: 'Bruno Líder', email: 'bruno@labhub.app', isCoordination: false },
    })]))

    expect(screen.getByTestId('people-leader-ms-1')).toHaveTextContent('Bruno Líder')
  })

  it('exibe o LÍDER/RESPONSÁVEL: rótulo fixo quando a coordenação', () => {
    renderCard(person([unit({
      leader: { membershipId: 'ms-coord', name: COORDINATOR_LEADER_LABEL, email: null, isCoordination: true },
    })]))

    expect(screen.getByTestId('people-leader-ms-1')).toHaveTextContent(COORDINATOR_LEADER_LABEL)
  })

  it('exibe "Sem líder definido" quando o vínculo não tem managed_by', () => {
    renderCard(person([unit({ leader: null })]))

    expect(screen.getByTestId('people-leader-ms-1')).toHaveTextContent('Sem líder definido')
  })

  it('líderes DIVERGENTES entre unidades: exibe os rótulos distintos (sem hierarquia)', () => {
    renderCard(person([
      unit({ membershipId: 'ms-1', leader: { membershipId: 'ms-l1', name: 'Bruno Líder', email: 'bruno@labhub.app', isCoordination: false } }),
      unit({ membershipId: 'ms-2', leader: { membershipId: 'ms-l2', name: 'Zé Líder', email: 'ze@labhub.app', isCoordination: false } }),
    ]))

    expect(screen.getByTestId('people-leader-ms-1')).toHaveTextContent('Bruno Líder · Zé Líder')
  })

  it('exibe os 4 STATUS reais no selo único quando o status é UNIFORME', () => {
    const cases: Array<[MembershipStatus, string]> = [
      ['active', 'Ativo'],
      ['pending', 'Pendente'],
      ['suspended', 'Suspenso'],
      ['removed', 'Removido'],
    ]
    for (const [status, label] of cases) {
      const { unmount } = renderCard(person([unit({ status })]))
      expect(screen.getByTestId('people-status-ms-1')).toHaveTextContent(label)
      unmount()
    }
  })

  it('status DIVERGENTE: NENHUM selo único (não inventa prioridade) — cada chip carrega o próprio status', () => {
    renderCard(person([
      unit({ membershipId: 'ms-1', unitName: 'Campus A', status: 'active' }),
      unit({ membershipId: 'ms-2', unitName: 'Campus B', status: 'pending' }),
    ]))

    expect(screen.queryByTestId('people-status-ms-1')).toBeNull()
    expect(screen.getByTitle(`Campus A · ${peopleStatusLabel('active')}`)).toBeInTheDocument()
    expect(screen.getByTitle(`Campus B · ${peopleStatusLabel('pending')}`)).toBeInTheDocument()
  })

  it('layering: o avatar (relative z-10) sobe por cima do banner SEM overflow/recorte', () => {
    renderCard(person([
      unit({ membershipId: 'ms-1', unitName: 'Campus A', status: 'active' }),
      unit({ membershipId: 'ms-2', unitName: 'Campus B', status: 'pending' }),
    ]))

    // Wrapper do avatar: posicionado E acima do banner (z-10) — o overlap -mt não é recortado.
    expect(screen.getByTestId('people-avatar-ms-1')).toHaveClass('relative', 'z-10')
    // Banner: camada de fundo, SEM overflow-hidden (recorte nunca é a solução aqui).
    expect(screen.getByTestId('people-banner-ms-1')).not.toHaveClass('overflow-hidden')
  })

  it('estrutura responsiva mobile-first: banner 64px→80px e avatar 48px→56px, sem largura fixa', () => {
    renderCard(person())

    // Mobile: h-16 (64px); desktop: sm:h-20 (80px).
    expect(screen.getByTestId('people-banner-ms-1')).toHaveClass('h-16', 'sm:h-20')
    // Avatar: h-12 (48px) no mobile; sm:h-14 (56px) no desktop.
    expect(screen.getByTestId('people-avatar-fallback-ms-1')).toHaveClass('h-12', 'w-12', 'sm:h-14', 'sm:w-14')
    // Nenhuma largura fixa no card: o root não define w-[...]/max-w fixo.
    const root = screen.getByTestId('people-row-ms-1')
    expect(root.className).not.toMatch(/w-\[\d+px\]|max-w-\[\d+px\]|w-\d{3,}/)
  })

  it('perfil ausente (RLS): nome/e-mail de fallback e iniciais "?" (fail-closed, não inventa)', () => {
    renderCard(person([unit()], { profile: null, name: 'Perfil não disponível', email: 'Sem e-mail registrado' }))

    expect(screen.getByText('Perfil não disponível')).toBeInTheDocument()
    expect(screen.getByText('Sem e-mail registrado')).toBeInTheDocument()
    expect(screen.getByTestId('people-avatar-fallback-ms-1')).toHaveTextContent('?')
  })
})