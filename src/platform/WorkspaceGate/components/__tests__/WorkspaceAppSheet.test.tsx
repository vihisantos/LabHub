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

import { appRegistry, plannedApps } from '../../../../appRegistry'
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

const admin = appRegistry.find((a) => a.id === 'admin')!

// App configurável real do registry (chamados) usado como fixture para
// validar toggle e configuração, sem depender de módulos removidos.
const configurableApp: AppModule = {
  ...appRegistry.find((a) => a.id === 'chamados')!,
  configurable: true,
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
    renderWithProviders(renderSheet(configurableApp))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Chamados')).toBeInTheDocument()
    expect(screen.getByText('Ativo neste workspace')).toBeInTheDocument()
  })

  it('mostra status desativado conforme disabled_apps do workspace', () => {
    renderWithProviders(renderSheet(configurableApp, makeWorkspace({ disabled_apps: ['chamados'] })))
    expect(screen.getByText('Desativado neste workspace')).toBeInTheDocument()
    expect(screen.getByText('Ativar neste workspace')).toBeInTheDocument()
  })

  it('toggle desativa via mecanismo existente (disabled_apps) e sincroniza o pai', async () => {
    const onDisabledAppsChange = vi.fn()
    renderWithProviders(
      <WorkspaceAppSheet
        app={configurableApp}
        workspace={makeWorkspace()}
        open
        onClose={() => {}}
        onDisabledAppsChange={onDisabledAppsChange}
      />,
    )
    fireEvent.click(screen.getByText('Desativar neste workspace'))
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('ws-1', { disabled_apps: ['chamados'] })
      expect(onDisabledAppsChange).toHaveBeenCalledWith(['chamados'])
    })
  })

  it('Escape fecha', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <WorkspaceAppSheet app={configurableApp} workspace={makeWorkspace()} open onClose={onClose} />,
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
        <WorkspaceAppSheet app={configurableApp} workspace={makeWorkspace()} open={false} onClose={() => {}} />
      </>,
    )
    const trigger = screen.getByTestId('trigger')
    trigger.focus()

    view.rerender(
      <>
        <button type="button" data-testid="trigger">
          Abrir
        </button>
        <WorkspaceAppSheet app={configurableApp} workspace={makeWorkspace()} open onClose={() => {}} />
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
        <WorkspaceAppSheet app={configurableApp} workspace={makeWorkspace()} open={false} onClose={() => {}} />
      </>,
    )
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('focus trap mantém o Tab dentro do dialog (Shift+Tab no primeiro volta ao último)', async () => {
    renderWithProviders(renderSheet(configurableApp))
    const dialog = screen.getByRole('dialog')
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
    const buttons = Array.from(dialog.querySelectorAll('button:not([disabled])'))
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })

  it('configuração sem painel fica desabilitada com aviso, sem inventar formulário', () => {
    const appSemPainel = plannedApps.find((a) => a.id === 'chamados-dashboard')!
    renderWithProviders(renderSheet(appSemPainel))
    const configureButton = screen.getByText('Configurar').closest('button')!
    expect(configureButton).toBeDisabled()
    expect(screen.getByText('Configuração disponível em breve')).toBeInTheDocument()
  })

  it('app configurável registra definição e painel próprios de configuração', () => {
    expect(configurableApp.settings).toBeDefined()
    expect(typeof configurableApp.SettingsPanel).toBe('function')
    renderWithProviders(renderSheet(configurableApp))
    const configureButton = screen.getByText('Configurar').closest('button')!
    expect(configureButton).toBeEnabled()
  })

  it('app com SettingsPanel futuro tem slot correto renderizado pelo shell', async () => {
    renderWithProviders(renderSheet(configurableApp))
    fireEvent.click(screen.getByText('Configurar'))
    expect(await screen.findByTestId('settings-panel-slot')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Voltar'))
    expect(screen.queryByTestId('settings-panel-slot')).not.toBeInTheDocument()
    expect(await screen.findByText('Desativar neste workspace')).toBeInTheDocument()
  })

  it('app sempre-ativo (admin/dashboard) mostra status fixo e sem toggle', () => {
    renderWithProviders(renderSheet(admin))
    expect(screen.getByText('Sempre ativo neste workspace')).toBeInTheDocument()
    expect(screen.queryByText('Desativar neste workspace')).not.toBeInTheDocument()
  })

  it('mostra a última alteração vinda do core/appSettings quando existir', async () => {
    renderWithProviders(renderSheet(configurableApp))
    await waitFor(() => {
      expect(mockGetUpdatedAt).toHaveBeenCalledWith('chamados')
    })
  })
})
