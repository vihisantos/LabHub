import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/useChecklists', () => ({ useChecklistTemplates: vi.fn() }))
vi.mock('../../components/EmptyState', () => ({ EmptyState: ({ title, description, action }: any) => (
  <div data-testid="empty-state">
    <p>{title}</p>
    <p>{description}</p>
    {action && <button onClick={action.onClick}>{action.label}</button>}
  </div>
)}))
vi.mock('../../components/Skeletons', () => ({ SkeletonCard: () => <div data-testid="skeleton" /> }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { useChecklistTemplates } from '../../hooks/useChecklists'
import { ChecklistTemplates } from '../ChecklistTemplates'

const mockTemplates = [
  {
    id: 'tpl-1',
    name: 'Limpeza Geral',
    labName: 'Lab A',
    items: [
      { id: 'item-1', label: 'Limpar teclado', category: 'cleaning', optional: false },
    ],
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'tpl-2',
    name: 'Restauração Total',
    labName: 'Lab B',
    items: [
      { id: 'item-2', label: 'Formatar sistema', category: 'restoration', optional: false },
      { id: 'item-3', label: 'Instalar SO', category: 'restoration', optional: false },
    ],
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
  },
]

function renderTemplates() {
  return render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>)
}

describe('ChecklistTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useChecklistTemplates as any).mockReturnValue({
      templates: mockTemplates,
      loading: false,
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    })
  })

  it('renderiza título', () => {
    renderTemplates()
    expect(screen.getByText('Checklists')).toBeInTheDocument()
  })

  it('exibe botão "+ Novo Template"', () => {
    renderTemplates()
    expect(screen.getByText('+ Novo Template')).toBeInTheDocument()
  })

  it('exibe lista de templates', () => {
    renderTemplates()
    expect(screen.getByText('Limpeza Geral')).toBeInTheDocument()
    expect(screen.getByText('Restauração Total')).toBeInTheDocument()
  })

  it('exibe contagem de itens', () => {
    renderTemplates()
    expect(screen.getByText(/1 itens/)).toBeInTheDocument()
    expect(screen.getByText(/2 itens/)).toBeInTheDocument()
  })

  it('exibe skeleton durante loading', () => {
    ;(useChecklistTemplates as any).mockReturnValue({ templates: [], loading: true, create: vi.fn(), update: vi.fn(), remove: vi.fn() })
    renderTemplates()
    expect(screen.getAllByTestId('skeleton').length).toBe(3)
  })

  it('exibe empty state quando não há templates', () => {
    ;(useChecklistTemplates as any).mockReturnValue({ templates: [], loading: false, create: vi.fn(), update: vi.fn(), remove: vi.fn() })
    renderTemplates()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText('Nenhum checklist')).toBeInTheDocument()
  })

  it('abre formulário ao clicar "+ Novo Template"', () => {
    renderTemplates()
    fireEvent.click(screen.getByText('+ Novo Template'))
    expect(screen.getByText('Criar Template')).toBeInTheDocument()
  })

  it('fecha formulário ao clicar "Cancelar"', () => {
    renderTemplates()
    fireEvent.click(screen.getByText('+ Novo Template'))
    expect(screen.getByText('Criar Template')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText('Criar Template')).not.toBeInTheDocument()
  })

  it('mostra formulário de edição ao clicar "Editar"', () => {
    renderTemplates()
    const editBtns = screen.getAllByText('Editar')
    fireEvent.click(editBtns[0])
    expect(screen.getByText('Editar Template')).toBeInTheDocument()
  })

  it('navega para execução ao clicar "Executar"', () => {
    renderTemplates()
    const execBtns = screen.getAllByText('Executar')
    fireEvent.click(execBtns[0])
    expect(mockNavigate).toHaveBeenCalledWith('/pcare/checklists/tpl-1/execute')
  })

  it('abre confirm dialog ao clicar "Excluir"', () => {
    renderTemplates()
    const deleteBtns = screen.getAllByText('Excluir')
    fireEvent.click(deleteBtns[0])
    expect(screen.getByText('Remover template')).toBeInTheDocument()
  })

  it('exibe nome do lab nos templates', () => {
    renderTemplates()
    expect(screen.getByText(/Lab A/)).toBeInTheDocument()
    expect(screen.getByText(/Lab B/)).toBeInTheDocument()
  })
})
