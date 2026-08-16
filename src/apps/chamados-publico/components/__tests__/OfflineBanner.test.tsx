import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}))

import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { OfflineBanner } from '../OfflineBanner'

const mockUseOnlineStatus = vi.mocked(useOnlineStatus)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OfflineBanner', () => {
  it('não renderiza nada quando online', () => {
    mockUseOnlineStatus.mockReturnValue({ online: true })

    render(<OfflineBanner />)

    expect(screen.queryByText(/Sem conexão/)).not.toBeInTheDocument()
  })

  it('mostra o aviso quando offline', () => {
    mockUseOnlineStatus.mockReturnValue({ online: false })

    render(<OfflineBanner />)

    expect(screen.getByText(/Sem conexão com a internet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Como conectar' })).toBeInTheDocument()
  })

  it('abre o manual de Wi-Fi ao tocar em como conectar', () => {
    mockUseOnlineStatus.mockReturnValue({ online: false })

    render(<OfflineBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Como conectar' }))

    expect(screen.getByText('Conectar ao Wi-Fi')).toBeInTheDocument()
    expect(screen.getByText('Rede com login (portal)')).toBeInTheDocument()
  })

  it('mostra os passos de conexão com portal de login', () => {
    mockUseOnlineStatus.mockReturnValue({ online: false })

    render(<OfflineBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Como conectar' }))

    expect(screen.getByText('Conecte-se ao Wi-Fi')).toBeInTheDocument()
    expect(screen.getByText('Aguarde o portal abrir')).toBeInTheDocument()
    expect(screen.getByText('Escolha seu perfil')).toBeInTheDocument()
    expect(screen.getByText('Faça login')).toBeInTheDocument()
    expect(screen.getByText('Volte ao app')).toBeInTheDocument()
    expect(screen.getByText(/Sem internet o chamado não é enviado/)).toBeInTheDocument()
  })
})
