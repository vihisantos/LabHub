import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'

const mockUpdate = vi.hoisted(() => vi.fn())
const mockGetUpdatedAt = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/workspaces/useWorkspaces', () => ({
  useWorkspaces: () => ({ update: mockUpdate }),
}))

vi.mock('../../../../core/appSettings/service', () => ({
  appSettingsService: { getUpdatedAt: mockGetUpdatedAt },
}))

import { appRegistry } from '../../../../appRegistry'
import type { AppModule } from '../../../../appRegistry'
import type { Workspace } from '../../../../core/workspaces/types'
import { WorkspaceAppSheet } from '../WorkspaceAppSheet'

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    name: 'Campus A',
    slug: 'campus-a',
    location: 'São Paulo',
    spreadsheet_url: '',
    color: '',
    disabled_apps: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const tv = appRegistry.find((a) => a.id === 'tv')!
const admin = appRegistry.find((a) => a.id === 'admin')!

const fakeConfigurableApp: AppModule = {
  id: 'tv',
  name: 'App de Teste',
  description: 'App com SettingsPanel para o smoke test',
  icon: () => null,
  route: '/x',
  color: '#123456',
  configurable: true,
  clearable: false,
  settings: { defaultSettings: {}, validateSettings: (v) => v as Record<string, never> },
  SettingsPanel: function Panel() {
    return <div data-testid="settings-panel-slot">PANEL_RENDERIZADO</div>
  },
}

function renderSheet(app: AppModule, workspace: Workspace = makeWorkspace(), handlers: Partial<{ onClose: () => void; onDisabledAppsChange: (l: string[]) => void }> = {}) {
  return (
    <WorkspaceAppSheet
      app={app}
      workspace={workspace}
      open
      onClose={handlers.onClose ?? (() => {})}
      onDisabledAppsChange={handlers.onDisabledAppsChange}
    />
  )
}

describe('WorkspaceAppSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockUpdate.mockResolvedValue(undefined)
    mockGetUpdatedAt.mockResolvedValue('2026-08-20T12:00:00Z')
  })

  it('abre e mostra o app com status ativo', () => {
    renderWithProviders(renderSheet(tv))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('TV')).toBeInTheDocument()
    expect(screen.getByText('Ativo neste workspace')).toBeInTheDocument()
  })

  it('mostra status desativado conforme disabled_apps do workspace', () => {
    renderWithProviders(renderSheet(tv, makeWorkspace({ disabled_apps: ['tv'] })))
    expect(screen.getByText('Desativado neste workspace')).toBeInTheDocument()
    expect(screen.getByText('Ativar neste workspace')).toBeInTheDocument()
  })

  it('toggle desativa via mecanismo existente (disabled_apps) e sincroniza o pai', async () => {
    const onDisabledAppsChange = vi.fn()
    renderWithProviders(
      <WorkspaceAppSheet
        app={tv}
        workspace={makeWorkspace()}
        open
        onClose={() => {}}
        onDisabledAppsChange={onDisabledAppsChange}
      />,
    )
    fireEvent.click(screen.getByText('Desativar neste workspace'))
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('ws-1', { disabled_apps: ['tv'] })
      expect(onDisabledAppsChange).toHaveBeenCalledWith(['tv'])
    })
  })

  it('Escape fecha', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <WorkspaceAppSheet app={tv} workspace={makeWorkspace()} open onClose={onClose} />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('foco inicial entra no dialog e volta ao elemento anterior ao fechar', async () => {
    const view = renderWithProviders(
      <>
        <button type="button" data-testid="trigger">
          Abrir
        </button>
        <WorkspaceAppSheet app={tv} workspace={makeWorkspace()} open={false} onClose={() => {}} />
      </>,
    )
    const trigger = screen.getByTestId('trigger')
    trigger.focus()

    view.rerender(
      <>
        <button type="button" data-testid="trigger">
          Abrir
        </button>
        <WorkspaceAppSheet app={tv} workspace={makeWorkspace()} open onClose={() => {}} />
      </>,
    )

    const dialog = screen.getByRole('dialog')
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    view.rerender(
      <>
        <button type="button" data-testid="trigger">
          Abrir
        </button>
        <WorkspaceAppSheet app={tv} workspace={makeWorkspace()} open={false} onClose={() => {}} />
      </>,
    )
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('focus trap mantém o Tab dentro do dialog (Shift+Tab no primeiro volta ao último)', async () => {
    renderWithProviders(renderSheet(tv))
    const dialog = screen.getByRole('dialog')
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
    const buttons = Array.from(dialog.querySelectorAll('button:not([disabled])'))
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })

  it('configuração sem painel fica desabilitada com aviso, sem inventar formulário', () => {
    renderWithProviders(renderSheet(tv))
    const configureButton = screen.getByText('Configurar').closest('button')!
    expect(configureButton).toBeDisabled()
    expect(screen.getByText('Configuração disponível em breve')).toBeInTheDocument()
  })

  it('app com SettingsPanel futuro tem slot correto renderizado pelo shell', async () => {
    renderWithProviders(renderSheet(fakeConfigurableApp))
    fireEvent.click(screen.getByText('Configurar'))
    expect(await screen.findByTestId('settings-panel-slot')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Voltar'))
    expect(screen.queryByTestId('settings-panel-slot')).not.toBeInTheDocument()
    expect(await screen.findByText('Desativar neste workspace')).toBeInTheDocument()
  })

  it('clearable=false esconde limpar dados; clearable=true mostra ação preparada e desabilitada', () => {
    const { unmount } = renderWithProviders(renderSheet(fakeConfigurableApp))
    expect(screen.queryByText('Limpar dados deste workspace')).not.toBeInTheDocument()
    unmount()

    renderWithProviders(renderSheet(tv))
    const purgeButton = screen.getByText('Limpar dados deste workspace').closest('button')!
    expect(purgeButton).toBeDisabled()
  })

  it('app sempre-ativo (admin/dashboard) mostra status fixo e sem toggle', () => {
    renderWithProviders(renderSheet(admin))
    expect(screen.getByText('Sempre ativo neste workspace')).toBeInTheDocument()
    expect(screen.queryByText('Desativar neste workspace')).not.toBeInTheDocument()
  })

  it('mostra a última alteração vinda do core/appSettings quando existir', async () => {
    renderWithProviders(renderSheet(fakeConfigurableApp))
    await waitFor(() => {
      expect(mockGetUpdatedAt).toHaveBeenCalledWith('tv')
    })
  })
})
