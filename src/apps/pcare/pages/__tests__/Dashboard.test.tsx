import { screen } from '@testing-library/react'
import { Dashboard } from '../Dashboard'
import { renderWithProviders, seedLocalStorage, makePC, makePart, makeMaintenance, makeActionLog } from '../../../../test/helpers'

function seedAll() {
  seedLocalStorage('pcs', [
    makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001', cleaningStatus: 'done', restorationStatus: 'done' }),
    makePC({ id: 'pc-2', labName: 'Lab A', pcNumber: 'PC-002', cleaningStatus: 'in_progress', restorationStatus: 'pending' }),
    makePC({ id: 'pc-3', labName: 'Lab B', pcNumber: 'PC-003', cleaningStatus: 'pending', restorationStatus: 'pending' }),
  ])
  seedLocalStorage('parts', [
    makePart({ id: 'part-1', name: 'Teclado', quantity: 1, minQuantity: 5 }),
    makePart({ id: 'part-2', name: 'Mouse', quantity: 10, minQuantity: 3 }),
  ])
  seedLocalStorage('maintenance', [
    makeMaintenance({ id: 'm-1', pcId: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001', type: 'cleaning', scheduledDate: new Date(Date.now() + 3600000).toISOString() }),
  ])
  seedLocalStorage('action_logs', [
    makeActionLog({ id: 'log-1', pcId: 'pc-1', type: 'status_changed', description: 'Status alterado para concluído', timestamp: new Date(Date.now() - 300000).toISOString() }),
    makeActionLog({ id: 'log-2', pcId: 'pc-2', type: 'pc_created', description: 'PC criado', timestamp: new Date(Date.now() - 600000).toISOString() }),
  ])
}

describe('Dashboard', () => {
  it('renderiza stat cards com valores corretos', () => {
    seedAll()
    renderWithProviders(<Dashboard />, { initialEntries: ['/pcare'] })

    expect(screen.getByText('Total de PCs')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Limpos')).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('33%')).toBeInTheDocument()
    expect(screen.getByText('Em andamento')).toBeInTheDocument()
    expect(screen.getByText('Pendentes')).toBeInTheDocument()
  })

  it('renderiza acoes rapidas', () => {
    seedAll()
    renderWithProviders(<Dashboard />, { initialEntries: ['/pcare'] })

    expect(screen.getByText('Novo PC')).toBeInTheDocument()
    expect(screen.getByText('QR Code')).toBeInTheDocument()
    expect(screen.getByText('Patrimônio')).toBeInTheDocument()
    expect(screen.getByText('Relatórios')).toBeInTheDocument()
    expect(screen.getByText('Checklists')).toBeInTheDocument()
    expect(screen.getByText('Gerar QR')).toBeInTheDocument()
  })

  it('mostra seção de manutenção agendada', () => {
    seedAll()
    renderWithProviders(<Dashboard />, { initialEntries: ['/pcare'] })

    expect(screen.getByText('Manutenções Agendadas')).toBeInTheDocument()
    expect(screen.getByText('Lab A — PC-001')).toBeInTheDocument()
  })

  it('mostra alerta de estoque baixo', () => {
    seedAll()
    renderWithProviders(<Dashboard />, { initialEntries: ['/pcare'] })

    expect(screen.getByText('Estoque baixo')).toBeInTheDocument()
    expect(screen.getByText(/1 item precisa/)).toBeInTheDocument()
  })

  it('mostra atividade recente', () => {
    seedAll()
    renderWithProviders(<Dashboard />, { initialEntries: ['/pcare'] })

    expect(screen.getByText('Atividade Recente')).toBeInTheDocument()
    expect(screen.getByText('Status alterado para concluído')).toBeInTheDocument()
    expect(screen.getByText('PC criado')).toBeInTheDocument()
  })

  it('mostra seção de progresso', () => {
    seedAll()
    renderWithProviders(<Dashboard />, { initialEntries: ['/pcare'] })

    expect(screen.getByText('Progresso')).toBeInTheDocument()
    expect(screen.getByText('Limpeza')).toBeInTheDocument()
    expect(screen.getByText('Restauração')).toBeInTheDocument()
    expect(screen.getAllByText('1/3').length).toBeGreaterThanOrEqual(2)
  })

  it('mostra seção de laboratórios quando há múltiplos', () => {
    seedAll()
    renderWithProviders(<Dashboard />, { initialEntries: ['/pcare'] })

    expect(screen.getByText('PCs por Laboratório')).toBeInTheDocument()
    expect(screen.getByText('Lab A')).toBeInTheDocument()
    expect(screen.getByText('Lab B')).toBeInTheDocument()
  })

  it('mostra empty state quando nao ha PCs', () => {
    renderWithProviders(<Dashboard />, { initialEntries: ['/pcare'] })

    expect(screen.getByText('Nenhum PC cadastrado ainda')).toBeInTheDocument()
    expect(screen.getByText('Adicionar primeiro PC')).toBeInTheDocument()
  })
})
