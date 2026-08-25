import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DisplayShell } from '../DisplayShell'
import type { DeviceConfig } from '../config'

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
})
