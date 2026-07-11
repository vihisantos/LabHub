import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/useMaintenance', () => ({ useMaintenance: vi.fn() }))
vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))
vi.mock('../../components/EmptyState', () => ({ EmptyState: ({ title, action }: any) => (
  <div data-testid="empty-state"><p>{title}</p>{action && <button onClick={action.onClick}>{action.label}</button>}</div>
)}))
vi.mock('../../components/Skeletons', () => ({ SkeletonCard: () => <div data-testid="skeleton" /> }))
vi.mock('../../components/PullToRefresh', () => ({ PullToRefresh: ({ children }: any) => <div>{children}</div> }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { useMaintenance } from '../../hooks/useMaintenance'
import { usePCs } from '../../hooks/usePCs'
import { Maintenance } from '../Maintenance'

const mockMaintenance = [
  { id: 'mnt-1', pcId: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001', type: 'cleaning', scheduledDate: new Date(Date.now() + 86400000).toISOString(), notes: '', completed: false, completedAt: null },
  { id: 'mnt-2', pcId: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002', type: 'restoration', scheduledDate: new Date(Date.now() - 86400000).toISOString(), notes: 'Urgente', completed: false, completedAt: null },
  { id: 'mnt-3', pcId: 'pc-3', labName: 'Lab C', pcNumber: 'PC-003', type: 'both', scheduledDate: new Date(Date.now() - 172800000).toISOString(), notes: '', completed: true, completedAt: new Date().toISOString() },
]

function renderMaintenance() {
  return render(<MemoryRouter><Maintenance /></MemoryRouter>)
}

describe('Maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useMaintenance as any).mockReturnValue({
      all: mockMaintenance,
      upcoming: mockMaintenance.filter((m) => !m.completed),
      loading: false,
      create: vi.fn(),
      complete: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
    })
    ;(usePCs as any).mockReturnValue({ pcs: [] })
  })

  it('renderiza título', () => {
    renderMaintenance()
    expect(screen.getByText('Manutenção')).toBeInTheDocument()
  })

  it('exibe botão "+ Agendar"', () => {
    renderMaintenance()
    expect(screen.getByText('+ Agendar')).toBeInTheDocument()
  })

  it('exibe seção de atrasadas', () => {
    renderMaintenance()
    expect(screen.getByText(/Atrasadas/)).toBeInTheDocument()
  })

  it('exibe seção de próximas', () => {
    renderMaintenance()
    expect(screen.getByText(/Próximas/)).toBeInTheDocument()
  })

  it('exibe seção de concluídas', () => {
    renderMaintenance()
    expect(screen.getByText('Concluídas')).toBeInTheDocument()
  })

  it('exibe skeleton durante loading', () => {
    ;(useMaintenance as any).mockReturnValue({ all: [], upcoming: [], loading: true, create: vi.fn(), complete: vi.fn(), remove: vi.fn(), reload: vi.fn() })
    renderMaintenance()
    expect(screen.getAllByTestId('skeleton').length).toBe(4)
  })

  it('exibe empty state quando vazio', () => {
    ;(useMaintenance as any).mockReturnValue({ all: [], upcoming: [], loading: false, create: vi.fn(), complete: vi.fn(), remove: vi.fn(), reload: vi.fn() })
    renderMaintenance()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('exibe botão "Concluir" em manutenções não completadas', () => {
    renderMaintenance()
    const concluirBtns = screen.getAllByText('Concluir')
    expect(concluirBtns.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe nome do lab nas manutenções', () => {
    renderMaintenance()
    expect(screen.getByText(/Lab A/)).toBeInTheDocument()
    expect(screen.getByText(/Lab B/)).toBeInTheDocument()
  })

  it('alterna para calendário', () => {
    renderMaintenance()
    fireEvent.click(screen.getByText('Grade'))
    // Calendar view shows month navigation and weekday headers
    expect(screen.getByText('Dom')).toBeInTheDocument()
    expect(screen.getByText('Seg')).toBeInTheDocument()
  })

  it('alterna de volta para lista', () => {
    renderMaintenance()
    fireEvent.click(screen.getByText('Grade'))
    fireEvent.click(screen.getByText('Lista'))
    expect(screen.getByText(/Atrasadas/)).toBeInTheDocument()
  })

  it('abre formulário ao clicar "+ Agendar"', () => {
    renderMaintenance()
    fireEvent.click(screen.getByText('+ Agendar'))
    expect(screen.getByText('Nova Manutenção')).toBeInTheDocument()
  })

  it('fecha formulário ao clicar "Cancelar"', () => {
    renderMaintenance()
    fireEvent.click(screen.getByText('+ Agendar'))
    expect(screen.getByText('Nova Manutenção')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText('Nova Manutenção')).not.toBeInTheDocument()
  })
})
