import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'
import type { Ticket } from '../../types'

vi.mock('../../../lib/useOnlineSync', () => ({ useOnlineSync: vi.fn() }))
vi.mock('../../../lib/useFastSync', () => ({ useFastSync: vi.fn() }))

let mockOpenCount = 0
vi.mock('../../components/ChamadosBottomNav', () => ({
  ChamadosBottomNav: ({ openCount }: { openCount?: number }) => {
    mockOpenCount = openCount ?? 0
    return <div>nav</div>
  },
}))

const mockUseTickets = vi.fn((): { tickets: Ticket[]; loading: boolean; syncing: boolean; reload: () => void } => ({
  tickets: [], loading: false, syncing: false, reload: vi.fn(),
}))
vi.mock('../../hooks/useTickets', () => ({
  useTickets: () => mockUseTickets(),
}))

const mockUseWorkspace = vi.fn((): { workspace: { id: string; name: string } | null } => ({ workspace: { id: 'ws-a', name: 'Campus A' } }))
vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}))

import { ChamadosLayout } from '../ChamadosLayout'

function renderLayout(path: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<ChamadosLayout />}>
        <Route path="/chamados" element={<div>dashboard</div>} />
        <Route path="/chamados/tickets" element={<div>tickets</div>} />
        <Route path="/chamados/tickets/:id" element={<div>detalhe</div>} />
        <Route path="/chamados/reports" element={<div>reports</div>} />
        <Route path="/chamados/settings" element={<div>settings</div>} />
      </Route>
    </Routes>,
    { initialEntries: [path] },
  )
}

describe('ChamadosLayout', () => {
  it('mostra o título correspondente à rota', () => {
    renderLayout('/chamados/tickets')
    expect(screen.getByRole('heading', { level: 1, name: 'Chamados' })).toBeInTheDocument()
    expect(screen.getByText('tickets')).toBeInTheDocument()
  })

  it('usa título do dashboard na raiz /chamados', () => {
    renderLayout('/chamados')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('usa título de relatórios e configurações', () => {
    const { unmount } = renderLayout('/chamados/reports')
    expect(screen.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeInTheDocument()
    unmount()
    renderLayout('/chamados/settings')
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
  })

  it('mostra botão voltar apenas em páginas de detalhe', () => {
    renderLayout('/chamados/tickets/t-1')
    expect(screen.getByLabelText('Voltar')).toBeInTheDocument()
  })

  it('sem botão voltar em listagens', () => {
    renderLayout('/chamados/tickets')
    expect(screen.queryByLabelText('Voltar')).not.toBeInTheDocument()
  })

  it('alterna silenciamento de alertas sonoros', () => {
    renderLayout('/chamados')
    const toggle = screen.getByLabelText('Silenciar alertas sonoros')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Ativar alertas sonoros')).toBeInTheDocument()
  })

  it('botão de alternar tema presente', () => {
    renderLayout('/chamados')
    expect(screen.getByLabelText('Alternar tema')).toBeInTheDocument()
  })

  // ── Badge workspace filtering ──────────────────────────────────────────────

  const makeTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
    id: 't1', ticketNumber: 1, workspace_id: 'ws-a', roomId: 'r1', roomName: 'Lab',
    assetId: '', assetSource: 'stock', assetName: '', assetPatrimony: '',
    problemCategory: 'Internet', problemArea: 'academica',
    problemDescription: 'Sem rede', status: 'aberto',
    priority: 'normal', reportedBy: 'Prof', reportedByEmail: '',
    assignedTo: '', assignedToUserId: '', createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z', resolvedAt: null, ...overrides,
  })

  beforeEach(() => {
    mockUseTickets.mockReturnValue({
      tickets: [], loading: false, syncing: false, reload: vi.fn(),
    })
    mockUseWorkspace.mockReturnValue({ workspace: { id: 'ws-a', name: 'Campus A' } })
  })

  it('badge=1 para ticket ativo no workspace atual', () => {
    mockUseTickets.mockReturnValue({
      tickets: [makeTicket()], loading: false, syncing: false, reload: vi.fn(),
    })
    renderLayout('/chamados')
    expect(mockOpenCount).toBe(1)
  })

  it('badge=0 para ticket ativo em outro workspace', () => {
    mockUseTickets.mockReturnValue({
      tickets: [makeTicket({ workspace_id: 'ws-other' })],
      loading: false, syncing: false, reload: vi.fn(),
    })
    renderLayout('/chamados')
    expect(mockOpenCount).toBe(0)
  })

  it('badge=0 para ticket fechado no workspace atual', () => {
    mockUseTickets.mockReturnValue({
      tickets: [makeTicket({ status: 'fechado' })],
      loading: false, syncing: false, reload: vi.fn(),
    })
    renderLayout('/chamados')
    expect(mockOpenCount).toBe(0)
  })

  it('badge=0 para ticket resolvido no workspace atual', () => {
    mockUseTickets.mockReturnValue({
      tickets: [makeTicket({ status: 'resolvido' })],
      loading: false, syncing: false, reload: vi.fn(),
    })
    renderLayout('/chamados')
    expect(mockOpenCount).toBe(0)
  })

  it('badge=0 para ticket archived', () => {
    mockUseTickets.mockReturnValue({
      tickets: [makeTicket({ archived: true })],
      loading: false, syncing: false, reload: vi.fn(),
    })
    renderLayout('/chamados')
    expect(mockOpenCount).toBe(0)
  })

  it('badge=1 mesmo com ticket ativo eliminado por filtro de UI (minha fila)', () => {
    // Badge é métrica estrutural — filtros de UI não o afetam
    mockUseTickets.mockReturnValue({
      tickets: [makeTicket({ assignedToUserId: 'other-user' })],
      loading: false, syncing: false, reload: vi.fn(),
    })
    renderLayout('/chamados')
    expect(mockOpenCount).toBe(1)
  })

  it('badge=0 para ticket stale de workspace anterior', () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        makeTicket({ id: 't-active', workspace_id: 'ws-a' }),
        makeTicket({ id: 't-stale', workspace_id: 'ws-old', ticketNumber: 2 }),
      ],
      loading: false, syncing: false, reload: vi.fn(),
    })
    renderLayout('/chamados')
    expect(mockOpenCount).toBe(1)
  })

  it('badge=0 quando workspace é null (loading)', () => {
    mockUseWorkspace.mockReturnValue({ workspace: null })
    mockUseTickets.mockReturnValue({
      tickets: [makeTicket()], loading: false, syncing: false, reload: vi.fn(),
    })
    renderLayout('/chamados')
    expect(mockOpenCount).toBe(0)
  })
})
