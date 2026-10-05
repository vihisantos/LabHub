import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../test/helpers'

const mockUseTickets = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useTickets', () => ({ useTickets: () => mockUseTickets() }))
vi.mock('../../../lib/useOnlineSync', () => ({ useOnlineSync: vi.fn() }))
vi.mock('../../../lib/useFastSync', () => ({ useFastSync: vi.fn() }))
vi.mock('../components/ChamadosBottomNav', () => ({ ChamadosBottomNav: () => null }))
vi.mock('../components/PushStatusCard', () => ({ PushStatusCard: () => null }))
vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-a', name: 'Campus A' } }),
}))
vi.mock('../../../core/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-admin', name: 'Admin Teste' } }),
}))

import { ChamadosApp } from '../index'

const FILA_PLACEHOLDER = 'Buscar por #, sala, ativo ou problema...'

function renderApp(path: string) {
  // Mesma montagem do App principal: ChamadosApp fica sob /chamados/*
  return renderWithProviders(
    <Routes>
      <Route path="/chamados/*" element={<ChamadosApp />} />
    </Routes>,
    { initialEntries: [path] },
  )
}

describe('ChamadosApp — raiz /chamados e deep links da Central do Coordenador (P0)', () => {
  beforeEach(() => {
    mockUseTickets.mockReturnValue({
      tickets: [],
      loading: false,
      syncing: false,
      reload: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      claim: vi.fn(),
      remove: vi.fn(),
    })
  })

  it('/chamados sem filtro continua exibindo o Dashboard', () => {
    renderApp('/chamados')
    expect(screen.getByText('Relatórios')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(FILA_PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('?status=aberto abre a fila filtrada em vez do Dashboard', () => {
    renderApp('/chamados?status=aberto')
    expect(screen.getByPlaceholderText(FILA_PLACEHOLDER)).toBeInTheDocument()
    expect(screen.queryByText('Relatórios')).not.toBeInTheDocument()
  })

  it('?status=em_andamento também abre a fila', () => {
    renderApp('/chamados?status=em_andamento')
    expect(screen.getByPlaceholderText(FILA_PLACEHOLDER)).toBeInTheDocument()
  })

  it('?unassigned=1 abre a fila', () => {
    renderApp('/chamados?unassigned=1')
    expect(screen.getByPlaceholderText(FILA_PLACEHOLDER)).toBeInTheDocument()
  })

  it('?sla=near abre a fila', () => {
    renderApp('/chamados?sla=near')
    expect(screen.getByPlaceholderText(FILA_PLACEHOLDER)).toBeInTheDocument()
  })

  it('?sla=overdue abre a fila', () => {
    renderApp('/chamados?sla=overdue')
    expect(screen.getByPlaceholderText(FILA_PLACEHOLDER)).toBeInTheDocument()
  })

  it('?priority=alta abre a fila', () => {
    renderApp('/chamados?priority=alta')
    expect(screen.getByPlaceholderText(FILA_PLACEHOLDER)).toBeInTheDocument()
  })

  it('/chamados/meus abre a ÁREA PESSOAL, não a fila operacional', () => {
    renderApp('/chamados/meus')
    // Página própria: pesquisa simples, sem nenhuma busca operacional.
    expect(screen.getByPlaceholderText('Pesquisar chamado...')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(FILA_PLACEHOLDER)).not.toBeInTheDocument()
    expect(screen.queryByText('Relatórios')).not.toBeInTheDocument()
    // E nenhuma ferramenta da fila (filtros/ordenação) aparece aqui.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Meus Atendimentos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Ativos/ })).not.toBeInTheDocument()
    // Não é a fila: os "Meus Atendimentos" da fila são outro conceito.
    expect(screen.getByText(/Chamados que/)).toBeInTheDocument()
  })

  it('/chamados/meus?status=resolvido NÃO injeta filtro operacional na área pessoal', () => {
    renderApp('/chamados/meus?status=resolvido')
    // A área pessoal não tem filtro de status: a query param é ignorada.
    expect(screen.getByPlaceholderText('Pesquisar chamado...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Resolvido/ })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(FILA_PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('a rota da fila continua sendo a tela da TI', () => {
    renderApp('/chamados/tickets')
    expect(screen.getByPlaceholderText(FILA_PLACEHOLDER)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Pesquisar chamado...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Meus Atendimentos' })).toBeInTheDocument()
    // E a fila não oferece a área pessoal como filtro.
    expect(screen.queryByRole('button', { name: 'Meus Chamados' })).not.toBeInTheDocument()
  })

  it('filtro desconhecido mantém o Dashboard (nenhum default alterado)', () => {
    renderApp('/chamados?foo=bar')
    expect(screen.getByText('Relatórios')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(FILA_PLACEHOLDER)).not.toBeInTheDocument()
  })
})