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

// RBAC 2.0 (F2-D-G): o gate de escrita desta tela é por Action
// (pcare.checklist.create/edit/delete — migration 079), não mais
// `isFullAccess('pc-care')`. O mock permite negar Action por Action.
const { mockUseCanAccessAction } = vi.hoisted(() => ({ mockUseCanAccessAction: vi.fn() }))
vi.mock('../../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: (..._args: unknown[]) => mockUseCanAccessAction(..._args),
  useAppAccess: () => ({
    getLevel: () => 'full',
    canAccessApp: () => true,
    isFullAccess: () => true,
    canAccessByAction: async () => true,
  }),
}))

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
    // Default = todas as Actions concedidas (o mock global de
    // src/test/mocks.ts faz o mesmo; aqui é explícito por Action).
    mockUseCanAccessAction.mockReturnValue({ allowed: true, loading: false })
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
    expect(mockNavigate).toHaveBeenCalledWith('/pc-care/checklists/tpl-1/execute')
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

describe('ChecklistTemplates — RBAC 2.0 por Action (F2-D-G)', () => {
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

  /** Concede tudo menos `denied` (ou tudo, se `denied` for undefined). */
  function grantAllExcept(denied?: string) {
    mockUseCanAccessAction.mockImplementation((action: string) => ({
      allowed: action !== denied,
      loading: false,
    }))
  }

  it('consulta exatamente as 3 Actions de checklist (nenhum app_access/legado)', () => {
    grantAllExcept()
    renderTemplates()
    const acoes = mockUseCanAccessAction.mock.calls.map((c) => c[0])
    expect(acoes).toEqual([
      'pcare.checklist.create',
      'pcare.checklist.edit',
      'pcare.checklist.delete',
    ])
  })

  it('sem pcare.checklist.create => não há botão de novo template nem empty-state action', () => {
    grantAllExcept('pcare.checklist.create')
    ;(useChecklistTemplates as any).mockReturnValue({ templates: [], loading: false, create: vi.fn(), update: vi.fn(), remove: vi.fn() })
    renderTemplates()
    expect(screen.queryByText('+ Novo Template')).not.toBeInTheDocument()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('sem pcare.checklist.edit => não há botão Editar', () => {
    grantAllExcept('pcare.checklist.edit')
    renderTemplates()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    // as demais Actions seguem concedidas
    expect(screen.getAllByText('Excluir').length).toBeGreaterThan(0)
  })

  it('sem pcare.checklist.delete => não há botão Excluir', () => {
    grantAllExcept('pcare.checklist.delete')
    renderTemplates()
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument()
    expect(screen.getAllByText('Editar').length).toBeGreaterThan(0)
  })

  it('sem nenhuma Action => tela some apenas as ações de escrita, mantém a leitura', () => {
    mockUseCanAccessAction.mockReturnValue({ allowed: false, loading: false })
    renderTemplates()
    expect(screen.getByText('Limpeza Geral')).toBeInTheDocument()
    expect(screen.queryByText('+ Novo Template')).not.toBeInTheDocument()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument()
  })

  it('fail-closed enquanto a consulta não responde (loading=true esconde a escrita)', () => {
    mockUseCanAccessAction.mockReturnValue({ allowed: false, loading: true })
    renderTemplates()
    expect(screen.queryByText('+ Novo Template')).not.toBeInTheDocument()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument()
  })

  it('perdeu pcare.checklist.edit com o form aberto => o submit não grava', () => {
    const update = vi.fn()
    ;(useChecklistTemplates as any).mockReturnValue({
      templates: mockTemplates, loading: false, create: vi.fn(), update, remove: vi.fn(),
    })
    grantAllExcept()
    const { rerender } = renderTemplates()

    // Abre a edição com a Action concedida…
    fireEvent.click(screen.getAllByText('Editar')[0])
    expect(screen.getByText('Editar Template')).toBeInTheDocument()

    // …a Action é revogada (ex.: membership suspensa) e o componente re-renderiza.
    grantAllExcept('pcare.checklist.edit')
    rerender(<MemoryRouter><ChecklistTemplates /></MemoryRouter>)

    fireEvent.click(screen.getByText('Salvar'))
    expect(update).not.toHaveBeenCalled()
  })

  it('perdeu pcare.checklist.create com o form de criação aberto => o submit não grava', () => {
    const create = vi.fn()
    ;(useChecklistTemplates as any).mockReturnValue({
      templates: mockTemplates, loading: false, create, update: vi.fn(), remove: vi.fn(),
    })
    grantAllExcept()
    const { rerender } = renderTemplates()

    fireEvent.click(screen.getByText('+ Novo Template'))
    fireEvent.change(screen.getByPlaceholderText('Limpeza completa'), { target: { value: 'Novo' } })
    expect(screen.getByText('Criar Template')).toBeInTheDocument()

    grantAllExcept('pcare.checklist.create')
    rerender(<MemoryRouter><ChecklistTemplates /></MemoryRouter>)

    fireEvent.click(screen.getByText('Criar Template'))
    expect(create).not.toHaveBeenCalled()
  })
})
