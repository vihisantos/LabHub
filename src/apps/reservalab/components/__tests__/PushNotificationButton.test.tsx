import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PushNotificationButton } from '../PushNotificationButton'

const mockSubscribe = vi.fn()

vi.mock('../../../../lib/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

import { usePushNotifications } from '../../../../lib/usePushNotifications'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PushNotificationButton', () => {
  it('não renderiza quando supported=false', () => {
    ;(usePushNotifications as any).mockReturnValue({
      supported: false,
      permission: 'default',
      subscribed: false,
      loading: false,
      subscribe: mockSubscribe,
    })

    const { container } = render(<PushNotificationButton />)
    expect(container.textContent).toBe('')
  })

  it('não renderiza quando permission=granted', () => {
    ;(usePushNotifications as any).mockReturnValue({
      supported: true,
      permission: 'granted',
      subscribed: false,
      loading: false,
      subscribe: mockSubscribe,
    })

    const { container } = render(<PushNotificationButton />)
    expect(container.textContent).toBe('')
  })

  it('não renderiza quando subscribed=true', () => {
    ;(usePushNotifications as any).mockReturnValue({
      supported: true,
      permission: 'default',
      subscribed: true,
      loading: false,
      subscribe: mockSubscribe,
    })

    const { container } = render(<PushNotificationButton />)
    expect(container.textContent).toBe('')
  })

  it('renderiza "Ativar Notificações" quando suportado e não inscrito', () => {
    ;(usePushNotifications as any).mockReturnValue({
      supported: true,
      permission: 'default',
      subscribed: false,
      loading: false,
      subscribe: mockSubscribe,
    })

    render(<PushNotificationButton />)
    expect(screen.getByText('Ativar Notificações')).toBeInTheDocument()
  })

  it('renderiza "Ativando..." quando loading', () => {
    ;(usePushNotifications as any).mockReturnValue({
      supported: true,
      permission: 'default',
      subscribed: false,
      loading: true,
      subscribe: mockSubscribe,
    })

    render(<PushNotificationButton />)
    expect(screen.getByText('Ativando...')).toBeInTheDocument()
  })

  it('renderiza "Notificações bloqueadas" quando permission=denied', () => {
    ;(usePushNotifications as any).mockReturnValue({
      supported: true,
      permission: 'denied',
      subscribed: false,
      loading: false,
      subscribe: mockSubscribe,
    })

    render(<PushNotificationButton />)
    expect(screen.getByText('Notificações bloqueadas')).toBeInTheDocument()
  })

  it('chama subscribe ao clicar', () => {
    ;(usePushNotifications as any).mockReturnValue({
      supported: true,
      permission: 'default',
      subscribed: false,
      loading: false,
      subscribe: mockSubscribe,
    })

    render(<PushNotificationButton />)
    fireEvent.click(screen.getByText('Ativar Notificações'))
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })
})
