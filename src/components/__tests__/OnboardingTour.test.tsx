import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import OnboardingTour from '../OnboardingTour'
import { OnboardingPromptProvider, useSuppressStartupPrompts } from '../../platform/Onboarding/onboardingState'

const auth = vi.hoisted(() => ({
  value: { user: null as null | { id: string; status: string; is_super_admin: boolean }, loading: false },
}))
const visibility = vi.hoisted(() => vi.fn(() => ({ isVisible: () => false })))
vi.mock('../../core/auth/AuthContext', () => ({ useAuth: () => auth.value }))
vi.mock('../../lib/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', accent: 'blue', setTheme: vi.fn(), setAccent: vi.fn() }),
}))
vi.mock('../../core/permissions/useModuleVisibility', () => ({ useModuleVisibilities: visibility }))

const user = (status: string) => ({ id: 'qa-onboarding', status, is_super_admin: false })
const title = /Personalize sua aparência/
const restart = () => (window as Window & { __restartOnboardingTour?: () => void }).__restartOnboardingTour

function Tree({ path = '/' }: { path?: string }) {
  return <MemoryRouter initialEntries={[path]}><OnboardingPromptProvider><Navigation /><OnboardingTour /><StartupPrompt /></OnboardingPromptProvider></MemoryRouter>
}
function StartupPrompt() {
  const suppressed = useSuppressStartupPrompts()
  return suppressed ? null : <div data-testid="startup-prompt" />
}
function Navigation() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/')}>Abrir início</button>
}

beforeEach(() => {
  localStorage.clear()
  auth.value = { user: null, loading: false }
  vi.clearAllMocks()
})

describe('onboarding global — autorização e rota', () => {
  it.each(['pending', 'rejected', 'blocked'])('não monta tour nem consulta permissões para status %s', status => {
    auth.value.user = user(status)
    render(<Tree />)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(visibility).not.toHaveBeenCalled()
    expect(restart()).toBeUndefined()
  })

  it('não monta enquanto autenticação está carregando', () => {
    auth.value = { user: user('active'), loading: true }
    render(<Tree />)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(visibility).not.toHaveBeenCalled()
  })

  it('aguarda aprovação e a saída da tela de celebração antes de iniciar', () => {
    auth.value.user = user('pending')
    const { rerender } = render(<Tree path="/approval-pending" />)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    auth.value.user = user('active')
    rerender(<Tree path="/approval-pending" />)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(visibility).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Abrir início'))
    expect(screen.getByText(title)).toBeInTheDocument()
    expect(restart()).toBeTypeOf('function')
    auth.value.user = null
    rerender(<Tree path="/approval-pending" />)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(restart()).toBeUndefined()
  })

  it.each(['/login', '/approval-pending/', '/chamados-publico/sala'])('não exibe o onboarding global na rota %s', path => {
    auth.value.user = user('active')
    render(<Tree path={path} />)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(visibility).not.toHaveBeenCalled()
  })
})

describe('onboarding único — sequência dos avisos', () => {
  it('oculta avisos durante o tour e libera ao pular, sem reiniciar ao navegar', () => {
    auth.value.user = user('active')
    render(<Tree />)
    expect(screen.getByText(title)).toBeInTheDocument()
    expect(screen.queryByTestId('startup-prompt')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(screen.getByTestId('startup-prompt')).toBeInTheDocument()
    expect(localStorage.getItem('onboardingCompleted_qa-onboarding')).toBe('true')
  })

  it('respeita conclusão do tour legado sem obrigar usuários antigos a repetir', () => {
    localStorage.setItem('labhub_onboarding_done_qa-onboarding', 'true')
    auth.value.user = user('active')
    render(<Tree />)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(screen.getByTestId('startup-prompt')).toBeInTheDocument()
  })
})
