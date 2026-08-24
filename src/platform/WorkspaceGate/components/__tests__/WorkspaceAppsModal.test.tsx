import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WorkspaceAppsModal } from '../WorkspaceAppsModal'
import type { Workspace } from '../../../../core/workspaces/types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useDragControls: () => ({ start: () => {} }),
}))

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }))

vi.mock('../../../../core/workspaces/useWorkspaces', () => ({
  useWorkspaces: () => ({ update: mockUpdate }),
}))

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

const PLANILHA_PLACEHOLDER = 'https://anhembi.sharepoint.com/.../planilha.xlsx?download=1'

describe('WorkspaceAppsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockUpdate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  })

  it('pré-preenche o campo de planilha com a URL do workspace', () => {
    render(
      <WorkspaceAppsModal
        workspace={makeWorkspace({ spreadsheet_url: 'https://sharepoint/campus-a.xlsx?download=1' })}
        open
        onClose={() => {}}
      />,
    )
    expect(screen.getByPlaceholderText(PLANILHA_PLACEHOLDER)).toHaveValue(
      'https://sharepoint/campus-a.xlsx?download=1',
    )
  })

  it('pré-preenche a quantidade de labs do workspace', () => {
    render(
      <WorkspaceAppsModal
        workspace={makeWorkspace({ lab_count: 10 })}
        open
        onClose={() => {}}
      />,
    )
    expect(screen.getByLabelText('Quantidade de labs (ReservaLab)')).toHaveValue(10)
  })

  it('salva o link da planilha junto com os apps desativados', async () => {
    render(
      <WorkspaceAppsModal
        workspace={makeWorkspace({ disabled_apps: ['tv'] })}
        open
        onClose={() => {}}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(PLANILHA_PLACEHOLDER), {
      target: { value: 'https://sharepoint/campus-a.xlsx?download=1' },
    })
    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('ws-1', {
        disabled_apps: ['tv'],
        spreadsheet_url: 'https://sharepoint/campus-a.xlsx?download=1',
        lab_count: 2,
      })
    })
  })

  it('mantém a planilha existente ao salvar sem editar', async () => {
    render(
      <WorkspaceAppsModal
        workspace={makeWorkspace({ spreadsheet_url: 'https://sharepoint/atual.xlsx', disabled_apps: [] })}
        open
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('ws-1', {
        disabled_apps: [],
        spreadsheet_url: 'https://sharepoint/atual.xlsx',
        lab_count: 2,
      })
    })
  })

  it('salva a quantidade de labs editada', async () => {
    render(
      <WorkspaceAppsModal
        workspace={makeWorkspace({ lab_count: 2 })}
        open
        onClose={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText('Quantidade de labs (ReservaLab)'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('ws-1', {
        disabled_apps: [],
        spreadsheet_url: '',
        lab_count: 10,
      })
    })
  })

  it('preserva os apps já desativados ao abrir e salvar (modal sempre montado no WorkspaceGate)', async () => {
    const { rerender } = render(<WorkspaceAppsModal workspace={null} open={false} onClose={() => {}} />)

    rerender(
      <WorkspaceAppsModal
        workspace={makeWorkspace({ disabled_apps: ['tv'] })}
        open
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('ws-1', {
        disabled_apps: ['tv'],
        spreadsheet_url: '',
        lab_count: 2,
      })
    })
  })

  it('reflete os apps desativados de outro workspace ao trocar de seleção', async () => {
    const { rerender } = render(
      <WorkspaceAppsModal
        workspace={makeWorkspace({ id: 'ws-1' })}
        open
        onClose={() => {}}
      />,
    )

    rerender(
      <WorkspaceAppsModal
        workspace={makeWorkspace({ id: 'ws-2', disabled_apps: ['stock'] })}
        open
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('ws-2', {
        disabled_apps: ['stock'],
        spreadsheet_url: '',
        lab_count: 2,
      })
    })
  })
})
