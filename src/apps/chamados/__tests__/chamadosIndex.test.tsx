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

  it('filtro desconhecido mantém o Dashboard (nenhum default alterado)', () => {
    renderApp('/chamados?foo=bar')
    expect(screen.getByText('Relatórios')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(FILA_PLACEHOLDER)).not.toBeInTheDocument()
  })
})