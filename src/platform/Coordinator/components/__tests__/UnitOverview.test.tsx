import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UnitOverview } from '../UnitOverview'
import type { CoordinatorUnitOverview } from '../../../../core/permissions/coordinatorService'

const overview: CoordinatorUnitOverview = {
  workspace: { id: 'ws1', name: 'Campus A' },
  tickets: { open: 2, in_progress: 3, unassigned: 4, high_priority: 2, urgent: 1 },
  recent: [
    {
      id: 'tk-1',
      ticketNumber: 7,
      roomName: 'Sala 101',
      problemCategory: 'Imprensa',
      status: 'em_atendimento',
      priority: 'alta',
      assignedToUserId: '',
      createdAt: '2026-01-11T00:00:00Z',
      updatedAt: '2026-01-11T00:00:00Z',
    },
  ],
}

function renderOverview(over: Partial<{ overview: CoordinatorUnitOverview | null; loading: boolean; failed: boolean; onRetry: () => void; onOpenChamados: (() => void) | null }> = {}) {
  const onRetry = over.onRetry ?? vi.fn()
  const onOpenChamados = over.onOpenChamados === undefined ? null : over.onOpenChamados
  render(
    <UnitOverview
      overview={over.overview === undefined ? overview : over.overview}
      loading={over.loading ?? false}
      failed={over.failed ?? false}
      onRetry={onRetry}
      onOpenChamados={onOpenChamados}
    />,
  )
  return { onRetry, onOpenChamados }
}

describe('UnitOverview — visão da unidade (RPC 070)', () => {
  it('mostra os cinco totais, o resumo e os recentes do RPC', () => {
    renderOverview()
    expect(screen.getByText('Visão da unidade')).toBeTruthy()
    expect(screen.getByTestId('unit-stat-open')).toHaveTextContent('Abertos2')
    expect(screen.getByTestId('unit-stat-in_progress')).toHaveTextContent('Em andamento3')
    expect(screen.getByTestId('unit-stat-unassigned')).toHaveTextContent('Sem responsável4')
    expect(screen.getByTestId('unit-stat-high_priority')).toHaveTextContent('Alta prioridade2')
    expect(screen.getByTestId('unit-stat-urgent')).toHaveTextContent('Urgentes1')
    expect(screen.getByText('Sala 101 — Imprensa')).toBeTruthy()
    expect(screen.getByText(/#7/)).toBeTruthy()
    expect(screen.getByText(/5 no total/)).toBeTruthy()
  })

  it('unidade vazia → zeros honestos, sem recentes e sem erro', () => {
    renderOverview({
      overview: {
        workspace: { id: 'ws1', name: 'Campus A' },
        tickets: { open: 0, in_progress: 0, unassigned: 0, high_priority: 0, urgent: 0 },
        recent: [],
      },
    })
    expect(screen.getByTestId('unit-stat-open')).toHaveTextContent('Abertos0')
    expect(screen.queryByText(/Sala 101/)).toBeNull()
    expect(screen.queryByText(/Não foi possível/)).toBeNull()
    expect(screen.getByText(/0 no total/)).toBeTruthy()
  })

  it('carregando → estado honesto sem inventar números', () => {
    renderOverview({ loading: true })
    expect(screen.getByText(/Carregando chamados da unidade/)).toBeTruthy()
    expect(screen.queryByTestId('unit-stat-open')).toBeNull()
  })

  it('falha (ex.: negado pelo RPC) → erro + retry chamado pelo usuário', () => {
    const { onRetry } = renderOverview({ failed: true })
    expect(screen.getByText(/Não foi possível carregar a visão desta unidade/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('Abrir chamados dispara o callback de navegação do app existente', () => {
    const onOpenChamados = vi.fn()
    renderOverview({ onOpenChamados })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamados' }))
    expect(onOpenChamados).toHaveBeenCalledTimes(1)
  })

  it('sem callback de navegação (unidade fora do contexto) → sem botão Abrir chamados', () => {
    renderOverview({ onOpenChamados: null })
    expect(screen.queryByRole('button', { name: 'Abrir chamados' })).toBeNull()
  })
})