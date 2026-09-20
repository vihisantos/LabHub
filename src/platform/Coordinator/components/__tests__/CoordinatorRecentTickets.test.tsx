import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CoordinatorRecentTickets } from '../CoordinatorRecentTickets'
import type { Ticket } from '../../../../apps/chamados/types'

function ticket(id: string, over: Partial<Ticket> = {}): Ticket {
  return {
    id,
    ticketNumber: 7,
    workspace_id: 'ws1',
    roomId: 'r1',
    roomName: 'Sala 101',
    assetName: 'Computador',
    problemCategory: 'Internet',
    problemDescription: '',
    status: 'aberto',
    priority: 'normal',
    reportedBy: '',
    reportedByEmail: '',
    assignedTo: '',
    assignedToUserId: 'u-tech',
    archived: false,
    resolvedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('CoordinatorRecentTickets — lista apresentacional de recentes (C2, PR B)', () => {
  it('lista com tickets: sala, categoria, número e status aparecem', () => {
    render(<CoordinatorRecentTickets tickets={[ticket('tk-1')]} />)

    expect(screen.getByTestId('overview-recents')).toBeInTheDocument()
    expect(screen.getByText('Sala 101 — Internet')).toBeTruthy()
    expect(screen.getByText('#7')).toBeTruthy()
    expect(screen.getByText('Aberto')).toBeTruthy()
  })

  it('lista vazia: mensagem honesta e nenhum item', () => {
    render(<CoordinatorRecentTickets tickets={[]} />)

    expect(
      screen.getByText(/Nenhum chamado no cache ainda/),
    ).toBeTruthy()
    expect(screen.queryByTestId(/^overview-recent-/)).toBeNull()
  })

  it('nome da unidade vem da função passada por prop (não conhece workspaces)', () => {
    const resolveUnitName = vi.fn((workspaceId?: string) => (workspaceId === 'ws1' ? 'Campus A' : 'Fora'))
    render(<CoordinatorRecentTickets tickets={[ticket('tk-1', { workspace_id: 'ws1' })]} resolveUnitName={resolveUnitName} />)

    expect(screen.getByText('Campus A')).toBeTruthy()
    expect(resolveUnitName).toHaveBeenCalledWith('ws1')
  })

  it('sem função de unidade: badge não é renderizado', () => {
    render(<CoordinatorRecentTickets tickets={[ticket('tk-1')]} />)

    expect(screen.queryByText('Campus A')).toBeNull()
    expect(screen.queryByText('Unidade fora do escopo')).toBeNull()
  })

  it('com onOpenTicket os itens viram botões que abrem o detail existente', () => {
    const onOpenTicket = vi.fn()
    render(<CoordinatorRecentTickets tickets={[ticket('tk-1'), ticket('tk-2', { ticketNumber: 8, problemCategory: 'Projetor' })]} onOpenTicket={onOpenTicket} />)

    const first = screen.getByTestId('overview-recent-tk-1')
    expect(first.tagName).toBe('BUTTON')

    fireEvent.click(first)
    expect(onOpenTicket).toHaveBeenCalledWith('tk-1')
  })

  it('sem onOpenTicket os itens são estáticos (span, sem navegação inventada)', () => {
    render(<CoordinatorRecentTickets tickets={[ticket('tk-1')]} />)

    const item = screen.getByTestId('overview-recent-tk-1')
    expect(item.tagName).toBe('SPAN')
    expect(within(screen.getByTestId('overview-recents')).queryByRole('button')).toBeNull()
  })

  it('vários tickets: todos renderizados com testids individuais na ordem fornecida', () => {
    render(
      <CoordinatorRecentTickets
        tickets={[
          ticket('tk-a', { roomName: 'Sala A', problemCategory: 'Áudio', ticketNumber: 1 }),
          ticket('tk-b', { roomName: 'Sala B', problemCategory: 'Projetor', ticketNumber: 2 }),
          ticket('tk-c', { roomName: 'Sala C', problemCategory: 'Computador', ticketNumber: 3 }),
        ]}
      />,
    )

    const panel = screen.getByTestId('overview-recents')
    const titles = within(panel).getAllByText(/Sala [ABC] — .*/)
    expect(titles).toHaveLength(3)
    expect(panel.textContent).toContain('Sala A — Áudio')
    expect(panel.textContent).toContain('Sala B — Projetor')
    expect(panel.textContent).toContain('Sala C — Computador')
    expect(screen.getByTestId('overview-recent-tk-a')).toBeInTheDocument()
    expect(screen.getByTestId('overview-recent-tk-b')).toBeInTheDocument()
    expect(screen.getByTestId('overview-recent-tk-c')).toBeInTheDocument()
  })
})