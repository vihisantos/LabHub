import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DisplayShell } from '../DisplayShell'
import { loadConfig, type DeviceConfig } from '../config'

/* Mock do ScreenRenderer: prova que o DisplayShell delega a decisão de tela
 * a ele (em vez de montar TvDisplay diretamente) e repassa a config inteira. */
vi.mock('../ScreenRenderer', () => ({
  ScreenRenderer: ({ config }: { config: DeviceConfig }) => (
    <div
      data-testid="screen-renderer-stub"
      data-device-id={config?.deviceId}
      data-screen-app={String(config?.screenApp)}
    />
  ),
}))

const config = {
  deviceId: 'dev-9',
  name: 'TV Lab 2',
  workspace: { id: 'ws-1', name: 'Campus A' },
  createdAt: '2026-06-25T12:00:00Z',
  screenApp: 'tv',
} as unknown as DeviceConfig

describe('DisplayShell — uso do ScreenRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('delega a renderização da tela ao ScreenRenderer com a config do device', () => {
    render(<DisplayShell config={config} onReconfigure={() => {}} />)

    const stub = screen.getByTestId('screen-renderer-stub')
    expect(stub).toHaveAttribute('data-device-id', 'dev-9')
    expect(stub).toHaveAttribute('data-screen-app', 'tv')
  })

  it('infraestrutura do shell segue intacta (atalho de manutenção Ctrl+Alt+K)', () => {
    render(<DisplayShell config={config} onReconfigure={() => {}} />)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, altKey: true })
    expect(screen.getByText('Manutenção')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, altKey: true })
    expect(screen.queryByText('Manutenção')).not.toBeInTheDocument()
  })

  it('troca o módulo pelo menu de manutenção e persiste a escolha', async () => {
    render(<DisplayShell config={config} onReconfigure={() => {}} />)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, altKey: true })
    expect(screen.getByText('Painel de Chamados')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /painel de chamados/i }))

    await vi.waitFor(() => {
      expect(screen.getByTestId('screen-renderer-stub')).toHaveAttribute(
        'data-screen-app',
        'chamados-dashboard',
      )
    })

    const loaded = await loadConfig()
    expect(loaded?.screenApp).toBe('chamados-dashboard')
  })

  it('trocar de módulo não altera deviceId nem workspace persistidos', async () => {
    render(<DisplayShell config={config} onReconfigure={() => {}} />)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, altKey: true })
    fireEvent.click(screen.getByRole('button', { name: /tv corporativa/i }))

    const loaded = await loadConfig()
    expect(loaded?.deviceId).toBe('dev-9')
    expect(loaded?.workspace?.id).toBe('ws-1')
  })
})
