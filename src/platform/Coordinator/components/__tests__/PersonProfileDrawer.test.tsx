import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { PersonProfileDrawer } from '../PersonProfileDrawer'
import type { BreakpointState } from '../../../../responsive/useBreakpoint'
import { COORDINATOR_LEADER_LABEL, peopleStatusLabel } from '../../coordinatorHelpers'
import type { AggregatedPerson } from '../../coordinatorHelpers'
import type { TeamMemberProfile } from '../../../../core/permissions/membership'

/**
 * PersonProfileDrawer — perfil interativo da aba Pessoal (#365), READ-ONLY.
 *
 * Reaproveita o MESMO dado consolidado do card (`AggregatedPerson`, #364) — o
 * drawer NÃO decide autorização nem inventa dado: apenas projeta, por unidade,
 * o cargo/status/responsável PRÓPRIOS de cada membership.
 *
 * Faixas (mesmo primitive do LabHub):
 * - compact/tablet → BottomSheet (PWA/mobile);
 * - desktop/wide → Dialog (Radix) como DRAWER lateral à direita (backdrop,
 *   Esc, trap de foco — do Radix).
 *
 * Cobertura aqui: conteúdo (avatar/banner/nome/cargo/e-mail/status/unidades/
 * responsável), regras uniforme × divergente, fallbacks locais, os três meios
 * de fechar em cada faixa (botão, backdrop, Esc) e o estado fechado.
 */

const mockUseBreakpoint = vi.hoisted(() => vi.fn())

vi.mock('../../../../responsive/useBreakpoint', () => ({
  useBreakpoint: () => mockUseBreakpoint(),
}))

function setBp(bp: BreakpointState['bp']) {
  mockUseBreakpoint.mockReturnValue({
    bp,
    isCompact: bp === 'compact',
    isTablet: bp === 'tablet',
    isDesktop: bp === 'desktop',
    isWide: bp === 'wide',
  })
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

function renderDrawer(person: AggregatedPerson | null, onClose: () => void = () => {}) {
  return render(<PersonProfileDrawer person={person} onClose={onClose} />)
}

describe('PersonProfileDrawer — mobile/PWA (BottomSheet) — #365', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBp('compact')
  })

  it('fechado (person null): nada é montado', () => {
    renderDrawer(null)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('people-profile-name')).toBeNull()
  })

  it('tablet mantém a variante mobile-first (mesmo BottomSheet)', () => {
    setBp('tablet')
    renderDrawer(person())
    expect(screen.getByRole('dialog', { name: 'Perfil de Ana Líder' })).toBeInTheDocument()
  })

  it('abre o perfil: dialog acessível com identidade completa', () => {
    renderDrawer(person())

    const dialog = screen.getByRole('dialog', { name: 'Perfil de Ana Líder' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('people-profile-name')).toHaveTextContent('Ana Líder')
    expect(screen.getByTestId('people-profile-role')).toHaveTextContent('Técnico')
    expect(screen.getByTestId('people-profile-email')).toHaveTextContent('ana@labhub.app')
  })

  it('foto e banner reais do perfil (profiles.avatar/banner)', () => {
    renderDrawer(
      person([unit()], {
        profile: { ...baseProfile(), avatar: 'https://cdn.labhub.app/avatar.png', banner: 'https://cdn.labhub.app/banner.png' },
      }),
    )

    expect(screen.getByTestId('people-profile-avatar-img-ms-1')).toHaveAttribute(
      'src',
      'https://cdn.labhub.app/avatar.png',
    )
    expect(screen.getByTestId('people-profile-banner-img-ms-1')).toHaveAttribute(
      'src',
      'https://cdn.labhub.app/banner.png',
    )
    expect(screen.queryByTestId('people-profile-avatar-fallback-ms-1')).toBeNull()
  })

  it('fallbacks locais: iniciais e gradiente quando não há foto/banner (nunca inventa)', () => {
    renderDrawer(person())

    expect(screen.getByTestId('people-profile-avatar-fallback-ms-1')).toHaveTextContent('AL')
    expect(screen.getByTestId('people-profile-banner-fallback-ms-1')).toBeInTheDocument()
  })

  it('status UNIFORME: selo único no cabeçalho', () => {
    renderDrawer(person([unit({ status: 'suspended' })]))

    expect(screen.getByTestId('people-profile-status-ms-1')).toHaveTextContent('Suspenso')
  })

  it('TODOS os vínculos por unidade com cargo/status/responsável PRÓPRIOS — cargos divergentes, sem prioridade', () => {
    renderDrawer(
      person([
        unit({
          membershipId: 'ms-1',
          unitName: 'Campus A',
          roleLabel: 'Analista de TI',
          status: 'active',
          leader: { membershipId: 'ms-l1', name: 'Bruno Líder', email: 'bruno@labhub.app', isCoordination: false },
        }),
        unit({
          membershipId: 'ms-2',
          unitName: 'Campus B',
          roleLabel: 'Líder',
          status: 'pending',
          leader: null,
        }),
      ]),
    )

    expect(screen.getByTestId('people-profile-units')).toBeInTheDocument()
    expect(screen.getByTestId('people-profile-unit-ms-1')).toHaveTextContent('Campus A')
    expect(screen.getByTestId('people-profile-unit-role-ms-1')).toHaveTextContent('Analista de TI')
    expect(screen.getByTestId('people-profile-unit-status-ms-1')).toHaveTextContent('Ativo')
    expect(screen.getByTestId('people-profile-responsible-ms-1')).toHaveTextContent('Bruno Líder')

    expect(screen.getByTestId('people-profile-unit-ms-2')).toHaveTextContent('Campus B')
    expect(screen.getByTestId('people-profile-unit-role-ms-2')).toHaveTextContent('Líder')
    expect(screen.getByTestId('people-profile-unit-status-ms-2')).toHaveTextContent('Pendente')
    expect(screen.getByTestId('people-profile-responsible-ms-2')).toHaveTextContent('Sem responsável')

    // Status divergente → NENHUM selo único no cabeçalho (nada inventado).
    expect(screen.queryByTestId('people-profile-status-ms-1')).toBeNull()
    // Acima ainda reconhece o status real de cada vínculo.
    expect(screen.getByText(peopleStatusLabel('active'))).toBeInTheDocument()
    expect(screen.getByText(peopleStatusLabel('pending'))).toBeInTheDocument()
  })

  it('liderança da coordenação usa o rótulo fixo como responsável', () => {
    renderDrawer(
      person([
        unit({
          leader: { membershipId: 'ms-coord', name: COORDINATOR_LEADER_LABEL, email: null, isCoordination: true },
        }),
      ]),
    )

    expect(screen.getByTestId('people-profile-responsible-ms-1')).toHaveTextContent(
      COORDINATOR_LEADER_LABEL,
    )
  })

  it('botão de fechar fecha o perfil (nome acessível)', () => {
    const onClose = vi.fn()
    renderDrawer(person(), onClose)

    const close = screen.getByTestId('people-profile-close')
    expect(close).toHaveAccessibleName('Fechar perfil')
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdrop (toque fora) fecha o perfil', () => {
    const onClose = vi.fn()
    const { container } = renderDrawer(person(), onClose)

    const wrapper = container.querySelector('.fixed.inset-0.z-50')
    expect(wrapper).not.toBeNull()
    // Primeiro filho do wrapper do BottomSheet = backdrop (onClick=onClose).
    fireEvent.click(wrapper!.firstElementChild as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc fecha o perfil (paridade de teclado com o desktop)', () => {
    const onClose = vi.fn()
    renderDrawer(person(), onClose)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('PersonProfileDrawer — desktop/wide (drawer lateral Radix) — #365', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBp('desktop')
  })

  it('painel lateral ancorado à direita, com backdrop e nome acessível', () => {
    renderDrawer(person())

    const dialog = screen.getByRole('dialog', { name: 'Perfil de Ana Líder' })
    expect(dialog).toBe(screen.getByTestId('people-profile-panel'))
    expect(dialog).toHaveClass('right-0', 'border-l')
    expect(dialog.className).toMatch(/max-w-md/)
    expect(screen.getByTestId('people-profile-backdrop')).toBeInTheDocument()
    expect(screen.getByTestId('people-profile-name')).toHaveTextContent('Ana Líder')
  })

  it('entrada com slide da direita (animação do drawer)', () => {
    renderDrawer(person())

    const panel = screen.getByTestId('people-profile-panel')
    expect(panel.className).toMatch(/data-\[state=open\]:animate-drawer-right-show/)
  })

  it('Esc fecha pelo Radix (Escape nativo do dialog)', () => {
    const onClose = vi.fn()
    renderDrawer(person(), onClose)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdrop fecha pela camada de dissmissão do Radix', async () => {
    const onClose = vi.fn()
    renderDrawer(person(), onClose)

    // O DialogRadix adia o dismiss para o clique (`deferPointerDownOutside`):
    // pointerdown no backdrop arma, e o click que completa fecha o drawer.
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    fireEvent.pointerDown(screen.getByTestId('people-profile-backdrop'), { pointerId: 1, button: 0 })
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    fireEvent.click(screen.getByTestId('people-profile-backdrop'))
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fechado (person null): nada é montado', () => {
    renderDrawer(null)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('people-profile-panel')).toBeNull()
  })
})