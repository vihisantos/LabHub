import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspaceGate } from '../WorkspaceGate'
import type { Workspace } from '../../../core/workspaces/types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
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

describe('WorkspaceGate — edição restrita ao admin absoluto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  })

  it('não mostra opções de edição nem "Nova escola" para quem não é admin absoluto', () => {
    render(<WorkspaceGate workspaces={[makeWorkspace()]} canCreate={false} onSelect={() => {}} />)

    expect(screen.queryAllByLabelText('Opções do workspace')).toHaveLength(0)
    expect(screen.queryByText('Nova escola')).not.toBeInTheDocument()
  })

  it('clique com botão direito no card não abre o menu de edição sem permissão', () => {
    render(<WorkspaceGate workspaces={[makeWorkspace()]} canCreate={false} onSelect={() => {}} />)

    const card = screen.getByRole('button', { name: /Campus A/ })
    fireEvent.contextMenu(card)

    expect(screen.queryByText('Configurar')).not.toBeInTheDocument()
    expect(screen.queryByText('Apps')).not.toBeInTheDocument()
  })

  it('mostra "Nova escola" e as opções de edição apenas para o admin absoluto', () => {
    const onSelect = vi.fn()
    render(<WorkspaceGate workspaces={[makeWorkspace()]} canCreate onSelect={onSelect} />)

    expect(screen.getByText('Nova escola')).toBeInTheDocument()
    const manageButtons = screen.getAllByLabelText('Opções do workspace')
    expect(manageButtons).toHaveLength(1)

    fireEvent.click(manageButtons[0])
    expect(screen.getByText('Configurar')).toBeInTheDocument()
    expect(screen.getByText('Apps')).toBeInTheDocument()
    expect(screen.getByText('Excluir workspace')).toBeInTheDocument()

    // Clicar no card ainda seleciona o workspace normalmente
    fireEvent.click(screen.getByRole('button', { name: /Campus A/ }))
    expect(onSelect).toHaveBeenCalled()
  })
})
