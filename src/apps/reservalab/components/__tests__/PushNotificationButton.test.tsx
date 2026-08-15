import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PushNotificationButton } from '../PushNotificationButton'

const mockSubscribe = vi.fn()

vi.mock('../../../../lib/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

import { usePushNotifications } from '../../../../lib/usePushNotifications'

// Mock framer-motion (motion.div + AnimatePresence)
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

function mockHook(overrides: Record<string, unknown> = {}) {
  ;(usePushNotifications as any).mockReturnValue({
    supported: true,
    permission: 'default',
    subscribed: false,
    loading: false,
    error: null,
    subscribe: mockSubscribe,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('PushNotificationButton', () => {
  it('não renderiza quando supported=false', () => {
    mockHook({ supported: false })
    const { container } = render(<PushNotificationButton />)
    expect(container.textContent).toBe('')
  })

  it('não renderiza quando permission=granted', () => {
    mockHook({ permission: 'granted' })
    const { container } = render(<PushNotificationButton />)
    expect(container.textContent).toBe('')
  })

  it('não renderiza quando subscribed=true', () => {
    mockHook({ subscribed: true })
    const { container } = render(<PushNotificationButton />)
    expect(container.textContent).toBe('')
  })

  it('renderiza card com título e botão "Ativar Notificações" quando suportado e não inscrito', () => {
    mockHook()
    render(<PushNotificationButton />)
    expect(screen.getByText('Não perca nenhum aviso')).toBeInTheDocument()
    expect(screen.getByText('Ativar Notificações')).toBeInTheDocument()
  })

  it('mostra os benefícios listados', () => {
    mockHook()
    render(<PushNotificationButton />)
    expect(screen.getByText(/Novos chamados abertos pelos professores/)).toBeInTheDocument()
    expect(screen.getByText(/Empréstimos, devoluções e validade do estoque/)).toBeInTheDocument()
    expect(screen.getByText(/Manutenções agendadas e reservas próximas/)).toBeInTheDocument()
  })

  it('renderiza "Ativando..." quando loading', () => {
    mockHook({ loading: true })
    render(<PushNotificationButton />)
    expect(screen.getByText('Ativando...')).toBeInTheDocument()
  })

  it('não mostra benefícios durante loading', () => {
    mockHook({ loading: true })
    render(<PushNotificationButton />)
    expect(screen.queryByText(/Novos chamados/)).not.toBeInTheDocument()
  })

  it('renderiza estado bloqueado quando permission=denied', () => {
    mockHook({ permission: 'denied' })
    render(<PushNotificationButton />)
    expect(screen.getByText('Notificações bloqueadas')).toBeInTheDocument()
    expect(screen.getByText('Reativar')).toBeInTheDocument()
    // Link de configuração do navegador
    // Link de configuração do navegador presente (abre em nova aba)
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
  })

  it('chama subscribe ao clicar em Ativar Notificações', () => {
    mockHook()
    render(<PushNotificationButton />)
    fireEvent.click(screen.getByText('Ativar Notificações'))
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })

  it('esconde o card ao clicar no botão de fechar (dismiss persistente)', () => {
    mockHook()
    const { container } = render(<PushNotificationButton />)
    expect(screen.getByText('Ativar Notificações')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(container.textContent).toBe('')
    expect(localStorage.getItem('labhub_push_prompt_dismissed')).toBe('1')
  })

  it('não renderiza quando já foi dispensado anteriormente', () => {
    localStorage.setItem('labhub_push_prompt_dismissed', '1')
    mockHook()
    const { container } = render(<PushNotificationButton />)
    expect(container.textContent).toBe('')
  })
})
