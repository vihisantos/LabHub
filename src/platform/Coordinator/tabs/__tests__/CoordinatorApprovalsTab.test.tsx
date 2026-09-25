import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import {
  CoordinatorApprovalsTab,
  formatRequestDate,
  type CoordinatorApprovalsTabProps,
} from '../CoordinatorApprovalsTab'
import type {
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../../../core/permissions/coordinatorService'
import type { Membership } from '../../../../core/permissions/membership'

const rolesById = new Map<string, CoordinatorRoleOption>([
  ['role-technician', { id: 'role-technician', slug: 'tec', name: 'Técnico' }],
  ['role-lider', { id: 'role-lider', slug: 'lider', name: 'Líder' }],
])

function mem(id: string, profileId: string, over: Partial<Membership> = {}): Membership {
  return {
    id,
    profile_id: profileId,
    workspace_id: 'ws1',
    role_id: 'role-technician',
    status: 'pending',
    managed_by: null,
    created_at: '2026-01-05T10:00:00Z',
    updated_at: '2026-01-05T10:00:00Z',
    ...over,
  }
}

function prof(id: string, name: string): CoordinatorRequest['profile'] {
  return { id: `u-${id}`, name, email: `${id}@labhub.app`, status: 'active', roleId: 'role-technician' }
}

function request(id: string, name: string, over: Partial<Membership> = {}): CoordinatorRequest {
  return { membership: mem(`ms-${id}`, `u-${id}`, over), profile: prof(id, name) }
}

function unit(id: string, unitName: string): CoordinatedUnit {
  return { coordination: mem(`coordination-${id}`, 'u-coord', { role_id: 'role-lider' }), unitId: id, unitName, leaders: [] }
}

const ws1 = unit('ws1', 'Campus A')
const ws2 = unit('ws2', 'Campus B')

const baseProps: CoordinatorApprovalsTabProps = {
  units: [ws1],
  requestsByUnit: { ws1: [request('p1', 'Clara Pendente')] },
  requestsLoading: false,
  requestsFailed: false,
  onRetryRequests: vi.fn(),
  onApproveRequest: vi.fn(),
  onRejectRequest: vi.fn(),
  pending: null,
  rolesById,
}

function renderTab(over: Partial<CoordinatorApprovalsTabProps> = {}) {
  render(<CoordinatorApprovalsTab {...baseProps} {...over} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CoordinatorApprovalsTab — fila de aprovações READ-ONLY sobre o escopo (V1)', () => {
  it('renderiza o cabeçalho da aba Aprovações', () => {
    renderTab()
    expect(screen.getByTestId('tab-approvals')).toBeInTheDocument()
    expect(screen.getByText('Aprovações')).toBeTruthy()
  })

  it('lista o nome do solicitante', () => {
    renderTab()
    expect(screen.getByText('Clara Pendente')).toBeTruthy()
  })

  it('lista o e-mail do solicitante', () => {
    renderTab()
    expect(screen.getByText('p1@labhub.app')).toBeTruthy()
  })

  it('mostra a unidade do pedido (agrupamento)', () => {
    renderTab()
    expect(within(screen.getByTestId('approvals-unit-ws1')).getByText('Campus A')).toBeTruthy()
  })

  it('mostra a data do pedido formatada a partir do created_at', () => {
    renderTab()
    expect(screen.getByText(/Solicitado em 05\/01\/2026/)).toBeTruthy()
  })

  it('mostra o selo Pendente para cada solicitação', () => {
    renderTab()
    expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0)
  })

  it('exibe o cargo somente quando resolvível via rolesById', () => {
    renderTab({
      requestsByUnit: {
        ws1: [
          request('p1', 'Clara Pendente', { role_id: 'role-technician' }),
          request('p2', 'Rute Sem Cargo', { role_id: 'role-desconhecido' }),
        ],
      },
    })

    const clara = screen.getByTestId('approvals-request-ms-p1')
    expect(within(clara).getByText('Técnico')).toBeTruthy()
    const rute = screen.getByTestId('approvals-request-ms-p2')
    expect(within(rute).queryByText('Técnico')).toBeNull()
  })

  it('busca por nome filtra a fila (client-side, sobre dados do escopo)', () => {
    renderTab({
      requestsByUnit: {
        ws1: [request('p1', 'Clara Pendente'), request('p2', 'Bruno Líder')],
      },
    })
    fireEvent.change(screen.getByTestId('approvals-search'), { target: { value: 'clara' } })

    expect(screen.getByText('Clara Pendente')).toBeTruthy()
    expect(screen.queryByText('Bruno Líder')).toBeNull()
  })

  it('busca por e-mail filtra a fila', () => {
    renderTab({
      requestsByUnit: {
        ws1: [request('p1', 'Clara Pendente'), request('p2', 'Bruno Líder')],
      },
    })
    fireEvent.change(screen.getByTestId('approvals-search'), { target: { value: 'p2@labhub' } })

    expect(screen.queryByText('Clara Pendente')).toBeNull()
    expect(screen.getByText('Bruno Líder')).toBeTruthy()
  })

  it('filtro por unidade restringe ao escopo selecionado', () => {
    renderTab({ units: [ws1, ws2], requestsByUnit: { ws1: [request('p1', 'Clara Pendente')], ws2: [request('p3', 'Dora Outra')] } })
    fireEvent.change(screen.getByTestId('approvals-unit-filter'), { target: { value: 'ws1' } })

    expect(screen.getByText('Clara Pendente')).toBeTruthy()
    expect(screen.queryByText('Dora Outra')).toBeNull()
  })

  it('sem solicitações → EmptyState honesto "Nenhuma solicitação pendente"', () => {
    renderTab({ requestsByUnit: {} })
    expect(screen.getByText('Nenhuma solicitação pendente')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Aprovar/ })).toBeNull()
  })

  it('com filtro sem correspondência → EmptyState de filtro sem resultado', () => {
    renderTab({ requestsByUnit: { ws1: [request('p1', 'Clara Pendente')] } })
    fireEvent.change(screen.getByTestId('approvals-search'), { target: { value: 'zzz' } })

    expect(screen.getByText('Nenhuma solicitação encontrada')).toBeTruthy()
    expect(screen.getByText(/Ajuste a busca ou o filtro/)).toBeTruthy()
  })

  it('loading → skeletons espelhando KPIs e linhas (sem fila falsa)', () => {
    renderTab({ requestsLoading: true })
    expect(screen.getByTestId('approvals-loading')).toBeInTheDocument()
    expect(document.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Aprovar/ })).toBeNull()
  })

  it('falha no carregamento → ErrorState honesto', () => {
    renderTab({ requestsFailed: true })
    expect(screen.getByText(/Não foi possível carregar as solicitações pendentes/)).toBeTruthy()
  })

  it('"Tentar novamente" dispara onRetryRequests', () => {
    renderTab({ requestsFailed: true })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(baseProps.onRetryRequests).toHaveBeenCalled()
  })

  it('Aprovar chama onApproveRequest com a solicitação', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }))
    expect(baseProps.onApproveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ membership: expect.objectContaining({ id: 'ms-p1' }) }),
    )
  })

  it('Rejeitar chama onRejectRequest com a solicitação', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /Rejeitar/ }))
    expect(baseProps.onRejectRequest).toHaveBeenCalledWith(
      expect.objectContaining({ membership: expect.objectContaining({ id: 'ms-p1' }) }),
    )
  })

  it('pendência ativa desabilita as ações da fila inteira', () => {
    renderTab({
      requestsByUnit: { ws1: [request('p1', 'Clara Pendente'), request('p2', 'Bruno Líder')] },
      pending: 'approve-ms-p1',
    })

    const buttons = screen.getAllByRole('button', { name: /Aprovar|Rejeitar/ })
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) expect(button).toBeDisabled()
  })

  it('agrupa e consolida por unidade, com KPIs totais do escopo', () => {
    renderTab({
      units: [ws1, ws2],
      requestsByUnit: { ws1: [request('p1', 'Clara Pendente')], ws2: [request('p3', 'Dora Outra')] },
    })

    expect(screen.getByTestId('approvals-unit-ws1')).toBeInTheDocument()
    expect(screen.getByTestId('approvals-unit-ws2')).toBeInTheDocument()
    expect(within(screen.getByTestId('approvals-summary-pending')).getByText('2')).toBeTruthy()
    expect(within(screen.getByTestId('approvals-summary-units')).getByText('2')).toBeTruthy()
  })

  it('nunca exibe solicitação de unidade fora do escopo (fail-closed)', () => {
    renderTab({
      requestsByUnit: {
        ws1: [request('p1', 'Clara Pendente')],
        ws999: [request('fora', 'Fora do Escopo')],
      },
    })

    expect(screen.queryByText('Fora do Escopo')).toBeNull()
    expect(screen.getAllByText('Pendente').length).toBe(1)
  })

  it('formatRequestDate é determinístico (data do calendário, sem conversão de fuso)', () => {
    expect(formatRequestDate('2026-01-05T10:00:00Z')).toBe('05/01/2026')
    expect(formatRequestDate('2026-12-31')).toBe('31/12/2026')
    expect(formatRequestDate('invalida')).toBe('—')
  })
})