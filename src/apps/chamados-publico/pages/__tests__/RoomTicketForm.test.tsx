import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('../../hooks/usePublicWorkspaces', () => ({ usePublicWorkspaces: vi.fn() }))
vi.mock('../../../../core/workspaces/store', () => ({
  workspaceStore: { activeWorkspaceId: null },
}))
vi.mock('../../../../core/auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../../../chamados/services/roomService', () => ({
  roomService: { getAllUnfiltered: vi.fn() },
}))
vi.mock('../../../chamados/services/ticketService', () => ({
  ticketService: { create: vi.fn(), query: vi.fn().mockReturnValue([]) },
}))
vi.mock('../../components/OnboardingTour', () => ({
  OnboardingTour: () => null,
  isTourDone: () => true,
  markTourDone: vi.fn(),
}))
vi.mock('../../utils/photo', () => ({ uploadPhoto: vi.fn(), uploadPhotos: vi.fn() }))

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
import { useAuth } from '../../../../core/auth/useAuth'
import { roomService } from '../../../chamados/services/roomService'
import { ticketService } from '../../../chamados/services/ticketService'
import { uploadPhoto } from '../../utils/photo'
import { RoomTicketForm } from '../RoomTicketForm'

const WS_A = 'ws-a'
const WS_B = 'ws-b'

const ROOMS = [
  { id: 'r1', name: 'Sala 101', workspace_id: WS_B },
  { id: 'r2', name: 'Lab 2', workspace_id: WS_B },
  { id: 'r3', name: 'Sala 202', workspace_id: WS_A },
  { id: 'r4', name: 'Sala Antiga', workspace_id: undefined },
]

function renderForm() {
  return render(<RoomTicketForm />)
}

function getRoomInput() {
  return screen.getByLabelText('2 · Qual a sala? *') as HTMLInputElement
}

describe('RoomTicketForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.setParams({})
    ;(usePublicWorkspaces as any).mockReturnValue({
      workspaces: [
        { id: WS_A, name: 'Campus A' },
        { id: WS_B, name: 'Campus B' },
      ],
      loading: false,
    })
    ;(useAuth as any).mockReturnValue({ user: { name: 'Professor' } })
    ;(roomService.getAllUnfiltered as any).mockReturnValue(ROOMS)
  })

  it('pré-seleciona o campus vindo da URL (?workspace=)', () => {
    mockSearchParams.setParams({ room: 'Sala 101', workspace: WS_B })
    renderForm()

    expect(getRoomInput()).toHaveValue('Sala 101')
    expect(screen.getByText('Sala vinda do QR Code — ajuste se necessário')).toBeInTheDocument()
  })

  it('sugere salas do campus selecionado + salas legadas (sem workspace)', () => {
    mockSearchParams.setParams({ room: '', workspace: WS_B })
    renderForm()

    const input = getRoomInput()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Sala' } })

    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText('Sala Antiga')).toBeInTheDocument()
    expect(screen.queryByText('Sala 202')).not.toBeInTheDocument()
  })

  it('preenche a sala ao clicar em uma sugestão', () => {
    mockSearchParams.setParams({ room: '', workspace: WS_B })
    renderForm()

    const input = getRoomInput()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Lab' } })

    fireEvent.mouseDown(screen.getByText('Lab 2'))
    expect(input).toHaveValue('Lab 2')
  })

  it('navega com setas e seleciona com Enter', () => {
    mockSearchParams.setParams({ room: '', workspace: WS_B })
    renderForm()

    const input = getRoomInput()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Lab' } })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('Lab 2')
  })

  it('fecha a lista com Escape', () => {
    mockSearchParams.setParams({ room: '', workspace: WS_B })
    renderForm()

    const input = getRoomInput()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Lab' } })

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Lab 2')).not.toBeInTheDocument()
  })

  it('mostra mensagem amigável e permite tentar novamente quando a API de campus falha', () => {
    const reload = vi.fn()
    ;(usePublicWorkspaces as any).mockReturnValue({
      workspaces: [],
      loading: false,
      error: true,
      reload,
    })

    renderForm()

    expect(screen.getByText(/Não foi possível carregar os campi/i)).toBeInTheDocument()
    expect(screen.queryByText('Campus A')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }))
    expect(reload).toHaveBeenCalled()
  })
})

describe('RoomTicketForm (criação de chamado)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.setParams({ room: '', workspace: '' })
    ;(usePublicWorkspaces as any).mockReturnValue({
      workspaces: [
        { id: WS_A, name: 'Campus A' },
        { id: WS_B, name: 'Campus B' },
      ],
      loading: false,
    })
    ;(useAuth as any).mockReturnValue({ user: { name: 'Professor' } })
    ;(roomService.getAllUnfiltered as any).mockReturnValue(ROOMS)
    ;(ticketService.create as any).mockResolvedValue({ id: 't-99', ticketNumber: 99 })
  })

  function fillForm(selectCampus = true) {
    if (selectCampus) fireEvent.click(screen.getByText('Campus A'))
    fireEvent.change(getRoomInput(), { target: { value: 'Sala 101' } })
    fireEvent.click(screen.getByText('Área Acadêmica'))
    fireEvent.click(screen.getByText('Computador'))
    fireEvent.change(screen.getByPlaceholderText(/A internet da sala/i), {
      target: { value: 'A internet caiu' },
    })
  }

  it('cria o chamado com o campus escolhido e todos os campos', async () => {
    renderForm()
    fillForm()

    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })
    expect(submit).not.toBeDisabled()
    fireEvent.click(submit)

    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WS_A,
        roomName: 'Sala 101',
        problemArea: 'academica',
        problemCategory: 'Computador',
        problemDescription: 'A internet caiu',
        reportedBy: 'Professor',
        status: 'aberto',
      })
    )
    expect(mockNavigate).toHaveBeenCalledWith('/chamados-publico/success/t-99')
  })

  it('não cria o chamado sem selecionar o campus e mostra erros', () => {
    renderForm()
    fillForm(false)

    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })
    fireEvent.click(submit)
    expect(ticketService.create).not.toHaveBeenCalled()
    expect(screen.getByText('Preencha os campos obrigatórios:')).toBeInTheDocument()
  })

  it('não cria o chamado sem descrever o problema e mostra erros', () => {
    renderForm()
    fillForm()
    fireEvent.change(screen.getByPlaceholderText(/A internet da sala/i), {
      target: { value: '' },
    })

    const submit = screen.getByRole('button', { name: 'Abrir Chamado' })
    fireEvent.click(submit)
    expect(ticketService.create).not.toHaveBeenCalled()
    expect(screen.getByText('Preencha os campos obrigatórios:')).toBeInTheDocument()
  })

  it('mostra o botão de anexar foto (opcional) e envia a foto no chamado', async () => {
    ;(uploadPhoto as any).mockResolvedValue('data:image/jpeg;base64,foto')
    const { container } = renderForm()
    fillForm()

    expect(screen.getByText('Anexar foto (opcional)')).toBeInTheDocument()

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } })
    })
    await act(async () => {})

    expect(screen.getByText(/Foto adicionada/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Chamado' }))
    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(
      expect.objectContaining({ photos: 'data:image/jpeg;base64,foto' })
    )
  })

  it('remove a foto antes de enviar', async () => {
    ;(uploadPhoto as any).mockResolvedValue('data:image/jpeg;base64,foto')
    const { container } = renderForm()
    fillForm()

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } })
    })
    await act(async () => {})
    expect(screen.getByText(/Foto adicionada/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remover foto' }))
    expect(screen.queryByText(/Foto adicionada/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Chamado' }))
    await act(async () => {})

    expect(ticketService.create).toHaveBeenCalledWith(expect.objectContaining({ photos: '' }))
  })
})
