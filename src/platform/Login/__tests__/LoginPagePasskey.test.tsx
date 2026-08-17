import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/helpers'

const mockSecurity = vi.hoisted(() => ({
  signInWithPasskey: vi.fn(),
  browserSupportsPasskey: vi.fn(),
}))

vi.mock('../../../core/auth/securityService', () => ({
  securityService: {
    signInWithPasskey: mockSecurity.signInWithPasskey,
  },
  browserSupportsPasskey: mockSecurity.browserSupportsPasskey,
}))

const mockAuth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  refreshProfile: vi.fn(),
}))

vi.mock('../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    signIn: mockAuth.signIn,
    signUp: mockAuth.signUp,
    error: null,
    loading: false,
    isAuthenticated: false,
  }),
}))

vi.mock('../../../core/auth/service', () => ({
  authService: {
    refreshProfile: mockAuth.refreshProfile,
  },
}))

const mockNavigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../lib/supabase', () => ({
  defaultDb: null,
  pcareDb: null,
  stockDb: null,
}))

import { LoginPage } from '../LoginPage'

/** A aba "Entrar" do modo signin e o botão submit têm o mesmo nome — pega o submit dentro do form. */
function clickSubmit() {
  const submit = document.querySelector('form button[type="submit"]') as HTMLButtonElement
  fireEvent.click(submit)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  mockAuth.signIn.mockResolvedValue(undefined)
  mockAuth.refreshProfile.mockResolvedValue(null)
})

describe('LoginPage — biometria e MFA', () => {
  it('mostra o botão "Entrar com biometria" quando o navegador suporta passkey', () => {
    mockSecurity.browserSupportsPasskey.mockReturnValue(true)
    renderWithProviders(<LoginPage />)
    expect(screen.getByText('Entrar com biometria')).toBeInTheDocument()
  })

  it('não mostra o botão quando o navegador não suporta WebAuthn', () => {
    mockSecurity.browserSupportsPasskey.mockReturnValue(false)
    renderWithProviders(<LoginPage />)
    expect(screen.queryByText('Entrar com biometria')).not.toBeInTheDocument()
  })

  it('entra com senha e navega para o app', async () => {
    mockSecurity.browserSupportsPasskey.mockReturnValue(true)
    renderWithProviders(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('nome.escolhido'), { target: { value: 'vitor' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'senha123' } })
    clickSubmit()

    await waitFor(() => {
      expect(mockAuth.signIn).toHaveBeenCalledWith({ email: 'vitor@labhub.com', password: 'senha123' })
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('entra via passkey quando a biometria é usada no login', async () => {
    mockSecurity.browserSupportsPasskey.mockReturnValue(true)
    mockSecurity.signInWithPasskey.mockResolvedValue({ ok: true })
    renderWithProviders(<LoginPage />)
    fireEvent.click(screen.getByText('Entrar com biometria'))

    await waitFor(() => {
      expect(mockSecurity.signInWithPasskey).toHaveBeenCalled()
      expect(mockAuth.refreshProfile).toHaveBeenCalled()
    })
  })

  it('mostra erro quando o passkey falha', async () => {
    mockSecurity.browserSupportsPasskey.mockReturnValue(true)
    mockSecurity.signInWithPasskey.mockResolvedValue({ ok: false, error: 'Cancelado pelo usuário' })
    renderWithProviders(<LoginPage />)
    fireEvent.click(screen.getByText('Entrar com biometria'))

    await waitFor(() => {
      expect(screen.getByText('Cancelado pelo usuário')).toBeInTheDocument()
    })
  })
})
