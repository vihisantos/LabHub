import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/useChecklists', () => ({ useChecklistTemplates: vi.fn() }))
vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))

// RBAC 2.0 (F2-D-K): o gate é a Action `pcare.checklist.create`.
const { mockUseCanAccessAction } = vi.hoisted(() => ({ mockUseCanAccessAction: vi.fn() }))
vi.mock('../../../../core/permissions/usePermissions', () => ({
  useCanAccessAction: (...args: unknown[]) => mockUseCanAccessAction(...args),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ templateId: 'tpl-1' }) }
})

import { useChecklistTemplates } from '../../hooks/useChecklists'
import { usePCs } from '../../hooks/usePCs'
import { ChecklistExecute } from '../ChecklistExecute'

const mockTemplate = {
  id: 'tpl-1',
  name: 'Limpeza Geral',
  labName: 'Lab A',
  items: [
    { id: 'item-1', label: 'Limpar teclado', category: 'cleaning', optional: false },
    { id: 'item-2', label: 'Limpar monitor', category: 'cleaning', optional: true },
  ],
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-01-10T00:00:00Z',
}

const mockPCs = [
  { id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' },
  { id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002' },
]

function renderExecute() {
  return render(<MemoryRouter initialEntries={['/pc-care/checklists/tpl-1/execute']}><ChecklistExecute /></MemoryRouter>)
}

describe('ChecklistExecute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useChecklistTemplates as any).mockReturnValue({ templates: [mockTemplate] })
    ;(usePCs as any).mockReturnValue({ pcs: mockPCs })
    // Default: Action concedida (o gate por Action em si tem bloco próprio abaixo).
    mockUseCanAccessAction.mockReturnValue({ allowed: true, loading: false })
  })

  it('renderiza nome do template', () => {
    renderExecute()
    expect(screen.getByText('Limpeza Geral')).toBeInTheDocument()
  })

  it('exibe contagem de itens', () => {
    renderExecute()
    expect(screen.getByText(/2 itens/)).toBeInTheDocument()
  })

  it('exibe itens do checklist', () => {
    renderExecute()
    expect(screen.getByText('Limpar teclado')).toBeInTheDocument()
    expect(screen.getByText('Limpar monitor')).toBeInTheDocument()
  })

  it('exibe item opcional', () => {
    renderExecute()
    expect(screen.getByText('(opcional)')).toBeInTheDocument()
  })

  it('exibe seletor de PC', () => {
    renderExecute()
    expect(screen.getByText('Selecionar PC')).toBeInTheDocument()
  })

  it('exibe "Iniciar Checklist" desabilitado sem PC selecionado', () => {
    renderExecute()
    const btn = screen.getByText('Iniciar Checklist')
    expect(btn).toBeDisabled()
  })

  it('exibe "Template não encontrado" para template inválido', () => {
    ;(useChecklistTemplates as any).mockReturnValue({ templates: [] })
    renderExecute()
    expect(screen.getByText('Template não encontrado')).toBeInTheDocument()
  })

  it('navega para /pc-care/checklists ao clicar Voltar no template não encontrado', () => {
    ;(useChecklistTemplates as any).mockReturnValue({ templates: [] })
    renderExecute()
    screen.getByText('Voltar').click()
    expect(mockNavigate).toHaveBeenCalledWith('/pc-care/checklists')
  })

  it('exibe "Nenhum PC encontrado" quando não há PCs do lab', () => {
    ;(usePCs as any).mockReturnValue({ pcs: [{ id: 'pc-3', labName: 'Lab C', pcNumber: 'PC-003' }] })
    renderExecute()
    expect(screen.getByText('Nenhum PC encontrado para este laboratório.')).toBeInTheDocument()
  })
})

/**
 * F2-D-K — o gate da execução migrou de `isFullAccess('pc-care')` para a Action
 * `pcare.checklist.create` (a mesma que o RLS exige em `pc_checklists_insert`,
 * migration 079).
 */
describe('ChecklistExecute — gate por Action (RBAC 2.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useChecklistTemplates as any).mockReturnValue({ templates: [mockTemplate] })
    ;(usePCs as any).mockReturnValue({ pcs: mockPCs })
    mockUseCanAccessAction.mockReturnValue({ allowed: true, loading: false })
  })

  it('consulta exatamente pcare.checklist.create (nenhum app_access/legado)', () => {
    renderExecute()
    const acoes = mockUseCanAccessAction.mock.calls.map((c) => c[0])
    expect(acoes).toEqual(['pcare.checklist.create'])
  })

  it('SEM a Action ⇒ execução bloqueada com "Acesso somente leitura"', () => {
    mockUseCanAccessAction.mockReturnValue({ allowed: false, loading: false })
    renderExecute()
    expect(screen.getByText('Acesso somente leitura')).toBeInTheDocument()
    expect(screen.queryByText('Iniciar Checklist')).not.toBeInTheDocument()
  })

  it('fail-closed enquanto a Action não responde (loading ⇒ sem execução, sem "somente leitura")', () => {
    mockUseCanAccessAction.mockReturnValue({ allowed: false, loading: true })
    renderExecute()
    expect(screen.queryByText('Iniciar Checklist')).not.toBeInTheDocument()
    expect(screen.queryByText('Acesso somente leitura')).not.toBeInTheDocument()
    expect(screen.getByText('Verificando permissão…')).toBeInTheDocument()
  })

  it('COM a Action ⇒ a execução começa normalmente', () => {
    renderExecute()
    expect(screen.getByText('Iniciar Checklist')).toBeInTheDocument()
    expect(screen.queryByText('Acesso somente leitura')).not.toBeInTheDocument()
  })

  it('template inexistente tem precedência sobre o gate (não é caso de permissão)', () => {
    ;(useChecklistTemplates as any).mockReturnValue({ templates: [] })
    mockUseCanAccessAction.mockReturnValue({ allowed: false, loading: false })
    renderExecute()
    expect(screen.getByText('Template não encontrado')).toBeInTheDocument()
  })
})
