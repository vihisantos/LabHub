import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('../../../../core/workspaces/useWorkspaces', () => ({ useWorkspaces: vi.fn() }))
vi.mock('../../../../core/workspaces/store', () => ({
  workspaceStore: { activeWorkspaceId: null },
}))
vi.mock('../../../chamados/hooks/useRooms', () => ({ useRooms: vi.fn() }))
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

import { useWorkspaces } from '../../../../core/workspaces/useWorkspaces'
import { useRooms } from '../../../chamados/hooks/useRooms'
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
    ;(useWorkspaces as any).mockReturnValue({
      workspaces: [
        { id: WS_A, name: 'Campus A' },
        { id: WS_B, name: 'Campus B' },
      ],
      loading: false,
    })
    ;(useRooms as any).mockReturnValue({ rooms: ROOMS })
    ;(useRoomAssets as any).mockReturnValue({ assets: [ASSET] })
    ;(useProblemTemplates as any).mockReturnValue({
      getByAssetType: () => ({ categories: ['Internet', 'Outro'] }),
    })
    ;(ticketService.create as any).mockResolvedValue({ id: 't-1', ticketNumber: 1 })
  })

  it('pré-seleciona o campus da sala quando não vem ?workspace=', () => {
    renderForm()
    expect(screen.getByText('Qual o campus? *')).toBeInTheDocument()
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
})
