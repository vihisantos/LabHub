import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WorkspaceSettingsModal } from '../WorkspaceSettingsModal'
import type { Workspace } from '../../../../core/workspaces/types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
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

describe('WorkspaceSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockUpdate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  })

  it('abre o formulário preenchido com os dados do workspace', () => {
    render(
      <WorkspaceSettingsModal
        workspace={makeWorkspace({
          name: 'Campus B',
          location: 'Santana',
          spreadsheet_url: 'https://sharepoint/x.xlsx',
          lab_count: 6,
          color: '#ec4899',
        })}
        open
        onClose={() => {}}
      />,
    )

    expect(screen.getByPlaceholderText('Ex: Anhembi Piracicaba')).toHaveValue('Campus B')
    expect(screen.getByPlaceholderText('Ex: Piracicaba, SP')).toHaveValue('Santana')
    expect(
      screen.getByPlaceholderText('https://anhembi.sharepoint.com/.../planilha.xlsx'),
    ).toHaveValue('https://sharepoint/x.xlsx')
    expect(screen.getByRole('spinbutton')).toHaveValue(6)
  })

  it('preenche os dados do workspace ao abrir depois de montado (modal sempre montado no WorkspaceGate)', async () => {
    const { rerender } = render(
      <WorkspaceSettingsModal workspace={null} open={false} onClose={() => {}} />,
    )

    rerender(
      <WorkspaceSettingsModal
        workspace={makeWorkspace({ name: 'Campus A', location: 'Piracicaba' })}
        open
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('ws-1', {
        name: 'Campus A',
        location: 'Piracicaba',
        spreadsheet_url: '',
        lab_count: 2,
        color: '',
      })
    })
  })

  it('reflete os dados de outro workspace ao trocar de seleção', () => {
    const { rerender } = render(
      <WorkspaceSettingsModal
        workspace={makeWorkspace({ id: 'ws-1', name: 'Campus A', lab_count: 4 })}
        open
        onClose={() => {}}
      />,
    )

    rerender(
      <WorkspaceSettingsModal
        workspace={makeWorkspace({ id: 'ws-2', name: 'Campus B', lab_count: 12 })}
        open
        onClose={() => {}}
      />,
    )

    expect(screen.getByPlaceholderText('Ex: Anhembi Piracicaba')).toHaveValue('Campus B')
    expect(screen.getByRole('spinbutton')).toHaveValue(12)
  })
})
