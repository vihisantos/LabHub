import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('../../hooks/usePublicWorkspaces', () => ({ usePublicWorkspaces: vi.fn() }))
vi.mock('../../../../core/workspaces/store', () => ({
  workspaceStore: { activeWorkspaceId: null },
}))
vi.mock('../../../chamados/services/roomService', () => ({ roomService: { getAllUnfiltered: vi.fn() } }))
vi.mock('../../../chamados/hooks/useRoomAssets', () => ({ useRoomAssets: vi.fn() }))
vi.mock('../../../chamados/hooks/useProblemTemplates', () => ({ useProblemTemplates: vi.fn() }))
vi.mock('../../../chamados/services/ticketService', () => ({
  ticketService: { create: vi.fn(), getOpenByAsset: vi.fn().mockReturnValue([]) },
}))

const mockNavigate = vi.fn()
const mockSearchParams = vi.hoisted(() => {
  let params: Record<string, string> = {}
  const setParams = (p: Record<string, string>) => {
    params = p
  }
  const getSearchParams = () => ({
    get: (key: string) => params[key] ?? null,
  })
  return { setParams, getSearchParams }
})
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams.getSearchParams()],
  }
})

import { usePublicWorkspaces } from '../../hooks/usePublicWorkspaces'
import { roomService } from '../../../chamados/services/roomService'
import { useRoomAssets } from '../../../chamados/hooks/useRoomAssets'
import { useProblemTemplates } from '../../../chamados/hooks/useProblemTemplates'
import { ticketService } from '../../../chamados/services/ticketService'
import { TicketForm } from '../TicketForm'

const WS_A = 'ws-a'
const WS_B = 'ws-b'

const ROOMS = [
  { id: 'r1', name: 'Sala 101', location: '', assetIds: [], workspace_id: WS_B, createdAt: '', updatedAt: '' },
]

const ASSET = {
  id: 'pc-1',
  source: 'stock',
  name: 'PC Aluno 01',
  patrimony: 'P-001',
  subcategory: 'Desktop',
  type: 'Desktop',
  room: 'Sala 101',
  category: 'Equipamentos',
}

function renderForm() {
  return render(<TicketForm />)
}

describe('TicketForm (campus)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.setParams({ room: 'r1', asset: 'pc-1', source: 'stock' })
    ;(usePublicWorkspaces as any).mockReturnValue({
      workspaces: [
        { id: WS_A, name: 'Campus A' },
        { id: WS_B, name: 'Campus B' },
      ],
      loading: false,
    })
    ;(roomService.getAllUnfiltered as any).mockReturnValue(ROOMS)
    ;(useRoomAssets as any).mockReturnValue({ assets: [ASSET] })
    ;(useProblemTemplates as any).mockReturnValue({
      getByAssetType: () => ({ categories: ['Internet', 'Outro'] }),
    })
    ;(ticketService.create as any).mockResolvedValue({ id: 't-1', ticketNumber: 1 })
  })

  it('pré-seleciona o campus da sala quando não vem ?workspace=', () => {
    renderForm()
    expect(screen.getByText(/campus\?/)).toBeInTheDocument()
    expect(screen.getByText('Campus B')).toBeInTheDocument()
    expect(screen.getByText('Campus A')).toBeInTheDocument()
  })

  it('pré-seleciona o campus vindo da URL (?workspace=) com prioridade', () => {
    mockSearchParams.setParams({ room: 'r1', asset: 'pc-1', source: 'stock', workspace: WS_A })
    renderForm()
    expect(screen.getByText('Campus A')).toBeInTheDocument()
  })

  it('cria o chamado com workspace_id do campus escolhido', async () => {
    mockSearchParams.setParams({ room: 'r1', asset: 'pc-1', source: 'stock' })
    renderForm()

    fireEvent.click(screen.getByText('Campus A'))
    fireEvent.click(screen.getByText('Internet'))
    fireEvent.change(screen.getByPlaceholderText('Nome do professor'), { target: { value: 'Prof. Maria' } })

    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })
    expect(submit).not.toBeDisabled()
    fireEvent.click(submit)

    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WS_A }))
    expect(mockNavigate).toHaveBeenCalledWith('/chamados-publico/success/t-1')
  })

  it('envia todos os dados do chamado (equipamento, sala, categoria e professor)', async () => {
    mockSearchParams.setParams({ room: 'r1', asset: 'pc-1', source: 'stock' })
    renderForm()

    fireEvent.click(screen.getByText('Campus A'))
    fireEvent.click(screen.getByText('Internet'))
    fireEvent.change(screen.getByPlaceholderText('Nome do professor'), { target: { value: 'Prof. Maria' } })
    fireEvent.change(screen.getByPlaceholderText(/O computador não liga/i), {
      target: { value: 'PC não liga após queda de luz' },
    })

    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })
    fireEvent.click(submit)

    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WS_A,
        roomId: 'r1',
        roomName: 'Sala 101',
        assetId: 'pc-1',
        assetSource: 'stock',
        assetName: 'PC Aluno 01',
        assetPatrimony: 'P-001',
        problemCategory: 'Internet',
        problemDescription: 'PC não liga após queda de luz',
        reportedBy: 'Prof. Maria',
        status: 'aberto',
      })
    )
    expect(mockNavigate).toHaveBeenCalledWith('/chamados-publico/success/t-1')
  })

  it('usa o campus pré-selecionado da sala (sem ?workspace=) no chamado', async () => {
    mockSearchParams.setParams({ room: 'r1', asset: 'pc-1', source: 'stock' })
    renderForm()

    fireEvent.click(screen.getByText('Internet'))
    fireEvent.change(screen.getByPlaceholderText('Nome do professor'), { target: { value: 'Prof. Maria' } })

    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })
    fireEvent.click(submit)

    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WS_B }))
  })

  it('sala sem workspace_id: não usa fallback e exige escolha manual de campus', async () => {
    ;(roomService.getAllUnfiltered as any).mockReturnValue([
      { id: 'r1', name: 'Sala 101', location: '', assetIds: [], workspace_id: '', createdAt: '', updatedAt: '' },
    ])
    mockSearchParams.setParams({ room: 'r1', asset: 'pc-1', source: 'stock' })
    renderForm()

    fireEvent.click(screen.getByText('Internet'))
    fireEvent.change(screen.getByPlaceholderText('Nome do professor'), { target: { value: 'Prof. Maria' } })

    // Sem ?workspace= e sem workspace na sala, o campus fica vazio
    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })

    // Clicking without campus shows errors
    fireEvent.click(submit)
    await act(async () => {})
    expect(ticketService.create).not.toHaveBeenCalled()
    expect(screen.getByText('Preencha os campos obrigatórios:')).toBeInTheDocument()

    // Escolhendo um campus manualmente, envia com o campus escolhido
    fireEvent.click(screen.getByText('Campus A'))
    fireEvent.click(submit)

    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WS_A }))
  })

  it('workspace da URL inexistente (deletado): cai para o workspace da sala quando existe', async () => {
    mockSearchParams.setParams({ room: 'r1', asset: 'pc-1', source: 'stock', workspace: 'ws-deletado' })
    renderForm()

    fireEvent.click(screen.getByText('Internet'))
    fireEvent.change(screen.getByPlaceholderText('Nome do professor'), { target: { value: 'Prof. Maria' } })

    // Campus da URL não existe → o chamado NÃO vai para ele; a sala manda (WS_B)
    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })
    expect(submit).not.toBeDisabled()
    fireEvent.click(submit)

    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WS_B }))
  })

  it('workspace da URL inexistente e sala sem workspace: exige escolha manual', async () => {
    ;(roomService.getAllUnfiltered as any).mockReturnValue([
      { id: 'r1', name: 'Sala 101', location: '', assetIds: [], workspace_id: '', createdAt: '', updatedAt: '' },
    ])
    mockSearchParams.setParams({ room: 'r1', asset: 'pc-1', source: 'stock', workspace: 'ws-deletado' })
    renderForm()

    fireEvent.click(screen.getByText('Internet'))
    fireEvent.change(screen.getByPlaceholderText('Nome do professor'), { target: { value: 'Prof. Maria' } })

    // Sem fonte confiável (URL inválida + sala sem workspace) → campus vazio
    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })

    // Clicking without campus shows errors
    fireEvent.click(submit)
    await act(async () => {})
    expect(ticketService.create).not.toHaveBeenCalled()
    expect(screen.getByText('Preencha os campos obrigatórios:')).toBeInTheDocument()

    // Escolhendo um campus válido manualmente, envia com ele
    fireEvent.click(screen.getByText('Campus B'))
    fireEvent.click(submit)

    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WS_B }))
  })
})
