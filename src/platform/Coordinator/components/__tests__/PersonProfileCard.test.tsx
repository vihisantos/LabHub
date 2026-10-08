import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PersonProfileCard } from '../PersonProfileCard'
import type { PeopleRow } from '../../coordinatorHelpers'
import { COORDINATOR_LEADER_LABEL } from '../../coordinatorHelpers'
import type { Membership, TeamMemberProfile } from '../../../../core/permissions/membership'

/**
 * PersonProfileCard — card de perfil da aba Pessoal (READ-ONLY).
 *
 * O componente recebe o `PeopleRow` já autorizado pelo servidor e é APENAS
 * visual: banner/foto reais do perfil com fallback de iniciais/gradiente.
 * Estes testes cobrem foto, banner, fallbacks, campos exibidos, os 4 status
 * reais e a estrutura responsiva (sem largura fixa — o card preenche a célula).
 */

function mem(id: string, over: Partial<Membership> = {}): Membership {
  return {
    id,
    profile_id: `u-${id}`,
    workspace_id: 'ws1',
    role_id: 'role-technician',
    status: 'active',
    managed_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function baseProfile(): TeamMemberProfile {
  return {
    id: 'u-ms-1',
    name: 'Ana Líder',
    email: 'ana@labhub.app',
    status: 'active',
    roleId: 'role-technician',
  }
}

function row(over: Partial<PeopleRow> = {}): PeopleRow {
  return {
    membership: mem('ms-1'),
    profile: baseProfile(),
    roleLabel: 'Técnico',
    unitId: 'ws1',
    unitName: 'Campus A',
    status: 'active',
    leader: null,
    ...over,
  }
}

function renderCard(over: Partial<PeopleRow> = {}) {
  return render(
    <ul>
      <PersonProfileCard row={row(over)} />
    </ul>,
  )
}

describe('PersonProfileCard — card de perfil da aba Pessoal', () => {
  it('renderiza pessoa com FOTO real (profiles.avatar) sobrepondo o banner', () => {
    renderCard({ profile: { ...baseProfile(), avatar: 'https://cdn.labhub.app/avatar.png' } })

    const img = screen.getByTestId('people-avatar-img-ms-1')
    expect(img).toHaveAttribute('src', 'https://cdn.labhub.app/avatar.png')
    expect(screen.queryByTestId('people-avatar-fallback-ms-1')).toBeNull()
  })

  it('renderiza fallback de INICIAIS quando não há foto (nunca inventa)', () => {
    renderCard()

    const fallback = screen.getByTestId('people-avatar-fallback-ms-1')
    expect(fallback).toHaveTextContent('AL') // initials('Ana Líder')
    expect(screen.queryByTestId('people-avatar-img-ms-1')).toBeNull()
  })

  it('fallback de iniciais com string vazia também (profiles.avatar = "")', () => {
    renderCard({ profile: { ...baseProfile(), avatar: '' } })

    expect(screen.getByTestId('people-avatar-fallback-ms-1')).toBeInTheDocument()
    expect(screen.queryByTestId('people-avatar-img-ms-1')).toBeNull()
  })

  it('renderiza BANNER real quando disponível (profiles.banner)', () => {
    renderCard({ profile: { ...baseProfile(), banner: 'https://cdn.labhub.app/banner.png' } })

    const banner = screen.getByTestId('people-banner-img-ms-1')
    expect(banner).toHaveAttribute('src', 'https://cdn.labhub.app/banner.png')
    expect(screen.queryByTestId('people-banner-fallback-ms-1')).toBeNull()
  })

  it('fallback de BANNER: gradiente do tema quando não há banner', () => {
    renderCard()

    expect(screen.getByTestId('people-banner-fallback-ms-1')).toBeInTheDocument()
    expect(screen.queryByTestId('people-banner-img-ms-1')).toBeNull()
  })

  it('exibe o NOME da pessoa', () => {
    renderCard()

    expect(screen.getByText('Ana Líder')).toBeInTheDocument()
  })

  it('exibe o CARGO (roleLabel da membership, resolvido pela aba)', () => {
    renderCard({ roleLabel: 'Líder' })

    expect(screen.getByText('Líder')).toBeInTheDocument()
  })

  it('exibe a UNIDADE de origem', () => {
    renderCard({ unitName: 'Campus B' })

    expect(screen.getByText('Campus B')).toBeInTheDocument()
  })

  it('exibe o LÍDER/RESPONSÁVEL: nome da liderança real', () => {
    renderCard({
      leader: { membershipId: 'ms-l1', name: 'Bruno Líder', email: 'bruno@labhub.app', isCoordination: false },
    })

    expect(screen.getByTestId('people-leader-ms-1')).toHaveTextContent('Bruno Líder')
  })

  it('exibe o LÍDER/RESPONSÁVEL: rótulo fixo quando a coordenação', () => {
    renderCard({
      leader: { membershipId: 'ms-coord', name: COORDINATOR_LEADER_LABEL, email: null, isCoordination: true },
    })

    expect(screen.getByTestId('people-leader-ms-1')).toHaveTextContent(COORDINATOR_LEADER_LABEL)
  })

  it('exibe "Sem líder definido" quando managed_by é NULL', () => {
    renderCard({ leader: null })

    expect(screen.getByTestId('people-leader-ms-1')).toHaveTextContent('Sem líder definido')
  })

  it('exibe os 4 STATUS reais com o mesmo testid (fonte: membership.status)', () => {
    const cases: Array<[PeopleRow['status'], string]> = [
      ['active', 'Ativo'],
      ['pending', 'Pendente'],
      ['suspended', 'Suspenso'],
      ['removed', 'Removido'],
    ]
    for (const [status, label] of cases) {
      const { unmount } = renderCard({ status })
      expect(screen.getByTestId('people-status-ms-1')).toHaveTextContent(label)
      unmount()
    }
  })

  it('estrutura responsiva mobile-first: banner 64px→80px e avatar 48px→56px, sem largura fixa', () => {
    renderCard()

    // Mobile: h-16 (64px, dentro da faixa 60–75px); desktop: sm:h-20 (80px).
    expect(screen.getByTestId('people-banner-ms-1')).toHaveClass('h-16', 'sm:h-20')
    // Avatar: h-12 (48px) no mobile; sm:h-14 (56px) no desktop.
    expect(screen.getByTestId('people-avatar-fallback-ms-1')).toHaveClass('h-12', 'w-12', 'sm:h-14', 'sm:w-14')
    // Nenhuma largura fixa no card: o root não define w-[...]/max-w fixo.
    const root = screen.getByTestId('people-row-ms-1')
    expect(root.className).not.toMatch(/w-\[\d+px\]|max-w-\[\d+px\]|w-\d{3,}/)
  })

  it('perfil ausente: nome/e-mail de fallback e iniciais "?" (fail-closed, não inventa)', () => {
    renderCard({ profile: null })

    expect(screen.getByText('Perfil não disponível')).toBeInTheDocument()
    expect(screen.getByText('Sem e-mail registrado')).toBeInTheDocument()
    expect(screen.getByTestId('people-avatar-fallback-ms-1')).toHaveTextContent('?')
  })
})
