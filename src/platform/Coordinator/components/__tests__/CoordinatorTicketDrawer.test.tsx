/**
 * Testes do `CoordinatorTicketDrawer` (Central do Coordenador).
 *
 * Cobra:
 * - Abertura com dados essenciais do chamado.
 * - Estados de carregamento da lista de técnicos.
 * - Fail-closed: erro ao buscar assignees ⇒ lista vazia, nunca dado errado.
 * - Lista de responsáveis ESCOPADA ao workspace do chamado (técnico de outro
 *   campus não aparece no seletor).
 * - Fechar (botão Fechar / ação operacional).
 * - Atribuição feliz, remoção de responsável (unassign) e botão desabilitado
 *   quando nada mudou.
 *
 * A fronteira de segurança real é o servidor (hardening testado em
 * `test_chamados_assign_workspace_hardening.py`); aqui validamos o escopo da
 * UI (consistente com o servidor, nunca mais permissivo).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { CoordinatorTicketDrawer, type CoordinatorTicketDrawerProps } from '../CoordinatorTicketDrawer'
import { getWorkspaceAssignees, type WorkspaceAssignee } from '../../../../core/permissions/workspaceAssigneesService'
import type { Ticket } from '../../../../apps/chamados/types'

vi.mock('../../../../core/permissions/workspaceAssigneesService', () => ({
  getWorkspaceAssignees: vi.fn(),
}))

const NOW = new Date('2026-08-13T10:00:00Z')
const HOUR = 1000 * 60 * 60

const TECH_A: WorkspaceAssignee = { userId: 'tech-a', profileId: 'p-a', name: 'Técnico A', roleId: 'r-tech' }
const TECH_B: WorkspaceAssignee = { userId: 'tech-b', profileId: 'p-b', name: 'Técnico B', roleId: 'r-tech' }

function makeTicket(over: Partial<Ticket> & Pick<Ticket, 'id' | 'workspace_id'>): Ticket {
  return {
    ticketNumber: 7,
    roomId: 'r1',
    roomName: 'Sala 101',
    assetName: 'Computador',
    assetPatrimony: 'PAT-001',
    problemCategory: 'Internet',
    problemDescription: 'sem conexão',
    status: 'aberto',
    priority: 'alta',
    reportedBy: 'Prof. Ana',
    reportedByEmail: 'ana@labhub.local',
    assignedTo: '',
    assignedToUserId: '',
    createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    updatedAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    resolvedAt: null,
    ...over,
  }
}

function renderDrawer(over: Partial<CoordinatorTicketDrawerProps> = {}) {
  const onClose = vi.fn()
  const onAssigned = vi.fn()
  const openOperational = vi.fn()
  render(
    <CoordinatorTicketDrawer
      ticket={null}
      unitName="Campus Pira"
      slaConfigs={{}}
      openOperational={null}
      onClose={onClose}
      onAssigned={onAssigned}
      {...over}
    />,
  )
  return { onClose, onAssigned, openOperational }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  // Padrão: nenhum assignee, nenhum fetch de PATCH.
  vi.mocked(getWorkspaceAssignees).mockResolvedValue([])
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body ?? '{}'))
      const patched = makeTicket({
        id: 'ticket-1',
        workspace_id: 'ws-a',
        roomName: 'Sala 101',
        assetName: 'Computador',
        ...body,
        updatedAt: '2026-08-13T11:00:00Z',
      })
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ticket: patched }),
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tickets: [] }),
    })
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CoordinatorTicketDrawer', () => {
  it('abre com os dados essenciais do chamado', async () => {
    const ticket = makeTicket({ id: 'ticket-1', workspace_id: 'ws-a' })
    renderDrawer({ ticket, unitName: 'Campus Pira', openOperational: null })
    await act(async () => {})

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(`#${ticket.ticketNumber} — ${ticket.assetName}`)).toBeInTheDocument()
    expect(screen.getByText('Prof. Ana')).toBeInTheDocument()
    expect(screen.getByText('Campus Pira')).toBeInTheDocument()
    expect(screen.getByText('Sala 101 · Computador · PAT-001')).toBeInTheDocument()
    expect(screen.getByText('Internet')).toBeInTheDocument()
    expect(screen.getByText('sem conexão')).toBeInTheDocument()
  })

  it('mostra a data de última atualização do chamado', async () => {
    const ticket = makeTicket({ id: 'ticket-1', workspace_id: 'ws-a' })
    renderDrawer({ ticket, unitName: 'Campus Pira', openOperational: null })
    await act(async () => {})

    const dialog = screen.getByRole('dialog')
    // Label presente e valor formatado (ano sempre presente; dia/mês variam com o fuso no jsdom).
    expect(within(dialog).getByText('Última atualização')).toBeInTheDocument()
    expect(dialog.textContent).toContain('2026')
  })

  it('mostra loading enquanto a lista de técnicos da unidade carrega', async () => {
    vi.mocked(getWorkspaceAssignees).mockImplementation(
      () => new Promise<WorkspaceAssignee[]>(() => {}),
    )
    renderDrawer({ ticket: makeTicket({ id: 'ticket-1', workspace_id: 'ws-a' }) })

    expect(screen.getByText('Carregando técnicos da unidade…')).toBeInTheDocument()
  })

  it('fail-closed: erro ao buscar técnicos ⇒ lista vazia, nunca dado errado', async () => {
    vi.mocked(getWorkspaceAssignees).mockRejectedValue(new Error('net down'))
    renderDrawer({ ticket: makeTicket({ id: 'ticket-1', workspace_id: 'ws-a' }) })
    await act(async () => {})

    const select = screen.getByTestId('coordinator-ticket-assignee-select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    // Apenas a opção neutra é exibida.
    expect(Array.from(select.options).map((o) => o.value)).toEqual([''])
    expect(screen.getByText('Nenhum técnico ativo encontrado nesta unidade.')).toBeInTheDocument()
  })

  it('seletor lista apenas técnicos ATIVOS do workspace DO CHAMADO (outro campus não aparece)', async () => {
    vi.mocked(getWorkspaceAssignees).mockImplementation((wsId: string) =>
      wsId === 'ws-a' ? Promise.resolve([TECH_A]) : Promise.resolve([TECH_B]),
    )

    // Chamado de ws-a: o técnico de ws-b (MEMBRO de outra unidade) não aparece.
    renderDrawer({ ticket: makeTicket({ id: 'ticket-1', workspace_id: 'ws-a' }) })
    await act(async () => {})
    let select = screen.getByTestId('coordinator-ticket-assignee-select') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'tech-a'])
    expect(select).not.toHaveTextContent('Técnico B')

    // Chamado de ws-b: o técnico de ws-a é que não aparece.
    cleanup()
    renderDrawer({ ticket: makeTicket({ id: 'ticket-2', workspace_id: 'ws-b' }) })
    await act(async () => {})
    select = screen.getByTestId('coordinator-ticket-assignee-select') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'tech-b'])
    expect(select).not.toHaveTextContent('Técnico A')
  })

  it('botão de salvar fica desabilitado quando nada mudou', async () => {
    const ticket = makeTicket({ id: 'ticket-1', workspace_id: 'ws-a', assignedTo: 'Técnico A', assignedToUserId: 'tech-a' })
    vi.mocked(getWorkspaceAssignees).mockResolvedValue([TECH_A])
    renderDrawer({ ticket })
    await act(async () => {})

    expect(screen.getByTestId('coordinator-ticket-assign-btn')).toBeDisabled()
  })

  it('atribui técnico da unidade: PATCH com assignedToUserId + onAssigned com ticket atualizado', async () => {
    vi.mocked(getWorkspaceAssignees).mockResolvedValue([TECH_A])
    const ticket = makeTicket({ id: 'ticket-1', workspace_id: 'ws-a' })
    const { onAssigned } = renderDrawer({ ticket })
    await act(async () => {})

    fireEvent.change(screen.getByTestId('coordinator-ticket-assignee-select'), {
      target: { value: TECH_A.userId },
    })
    fireEvent.click(screen.getByTestId('coordinator-ticket-assign-btn'))
    await act(async () => {})

    const patchCalls = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).includes('/api/chamados/ticket-1') && init?.method === 'PATCH',
    )
    expect(patchCalls).toHaveLength(1)
    const body = JSON.parse(String(patchCalls[0][1]?.body))
    expect(body).toMatchObject({ assignedTo: 'Técnico A', assignedToUserId: 'tech-a' })

    expect(onAssigned).toHaveBeenCalledTimes(1)
    const updated = onAssigned.mock.calls[0][0] as Ticket
    expect(updated.assignedToUserId).toBe('tech-a')
    expect(screen.getByRole('status')).toHaveTextContent('Responsável atualizado com sucesso.')
  })

  it('remove responsável (unassign): PATCH com assignedToUserId vazio + sucesso', async () => {
    vi.mocked(getWorkspaceAssignees).mockResolvedValue([TECH_A])
    const ticket = makeTicket({
      id: 'ticket-1',
      workspace_id: 'ws-a',
      assignedTo: 'Técnico A',
      assignedToUserId: 'tech-a',
    })
    const { onAssigned } = renderDrawer({ ticket })
    await act(async () => {})

    fireEvent.change(screen.getByTestId('coordinator-ticket-assignee-select'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByTestId('coordinator-ticket-assign-btn'))
    await act(async () => {})

    const patchCalls = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).includes('/api/chamados/ticket-1') && init?.method === 'PATCH',
    )
    expect(patchCalls).toHaveLength(1)
    const body = JSON.parse(String(patchCalls[0][1]?.body))
    expect(body).toMatchObject({ assignedTo: '', assignedToUserId: '' })

    expect(onAssigned).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Responsável atualizado com sucesso.')
  })

  it('Fechar chama onClose', async () => {
    const ticket = makeTicket({ id: 'ticket-1', workspace_id: 'ws-a' })
    const { onClose } = renderDrawer({ ticket })
    await act(async () => {})

    fireEvent.click(screen.getAllByText('Fechar')[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('ação operacional abre o módulo e fecha o drawer', async () => {
    const ticket = makeTicket({ id: 'ticket-1', workspace_id: 'ws-a' })
    const openOperational = vi.fn()
    const { onClose } = renderDrawer({ ticket, openOperational })
    await act(async () => {})

    fireEvent.click(screen.getByTestId('coordinator-ticket-open-operational'))

    expect(openOperational).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})