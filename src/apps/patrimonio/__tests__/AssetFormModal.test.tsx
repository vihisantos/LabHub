import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockCreate, mockUpdate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}))

// Mantém enums/rótulos/erros reais; troca só a fronteira de rede.
vi.mock('../../../core/patrimonio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../core/patrimonio')>()
  return {
    ...actual,
    assetsRepository: { ...actual.assetsRepository, create: mockCreate, update: mockUpdate },
  }
})

import { AssetFormModal } from '../components/AssetFormModal'
import { PatrimonioError, type PatrimonioAsset } from '../../../core/patrimonio'
import type { PatrimonioReferences } from '../hooks/usePatrimonioReferences'

function asset(over: Partial<PatrimonioAsset> = {}): PatrimonioAsset {
  return {
    id: 'a-1',
    workspace_id: 'ws-1',
    asset_tag: 'PAT-001',
    serial_number: null,
    equipment_type: 'Notebook',
    manufacturer: 'Dell',
    model: 'Latitude',
    name: 'Notebook Dell',
    location_id: 'l-1',
    responsible_id: 'r-1',
    status: 'em_uso',
    condition: 'bom',
    notes: '',
    metadata: {},
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function references(over: Partial<PatrimonioReferences> = {}): PatrimonioReferences {
  return {
    locations: [
      {
        id: 'l-1',
        workspace_id: 'ws-1',
        predio: '',
        andar: '',
        nome: 'Sala 101',
        complemento: '',
        notes: '',
        created_at: '',
        updated_at: '',
      },
    ],
    responsibles: [
      {
        id: 'r-1',
        workspace_id: 'ws-1',
        nome: 'Fulano',
        matricula: null,
        email: null,
        profile_id: null,
        notes: '',
        created_at: '',
        updated_at: '',
      },
    ],
    loading: false,
    error: null,
    locationLabel: (id) => (id === 'l-1' ? 'Sala 101' : null),
    responsibleLabel: (id) => (id === 'r-1' ? 'Fulano' : null),
    reload: vi.fn(),
    ...over,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type ModalProps = React.ComponentProps<typeof AssetFormModal>

function renderModal(props: Partial<ModalProps> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onSaved = props.onSaved ?? vi.fn()
  const base: ModalProps = {
    open: true,
    workspaceId: 'ws-1',
    initial: null,
    references: references(),
    onClose,
    onSaved,
    ...props,
  }
  const utils = render(<AssetFormModal {...base} />)
  return { ...utils, base, onClose, onSaved }
}

async function fillValid() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nome do equipamento'), 'Notebook Dell')
  await user.selectOptions(screen.getByLabelText('Tipo de equipamento'), 'Notebook')
  await user.selectOptions(screen.getByLabelText('Local'), 'l-1')
  return user
}

describe('AssetFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Setup global usa fake timers; userEvent precisa de timers reais.
    vi.useRealTimers()
  })

  it('cria com os campos informados e o workspace explícito', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    mockCreate.mockResolvedValue(asset())
    renderModal({ onSaved, onClose })

    const user = await fillValid()
    await user.selectOptions(screen.getByLabelText('Responsável'), 'r-1')
    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }))

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Notebook Dell',
        equipment_type: 'Notebook',
        location_id: 'l-1',
        responsible_id: 'r-1',
        status: 'draft',
        condition: 'bom',
      }),
      'ws-1',
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('usa texto livre quando o tipo é "Outro"', async () => {
    mockCreate.mockResolvedValue(asset({ equipment_type: 'Nobreak' }))
    renderModal()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nome do equipamento'), 'Nobreak sala')
    await user.selectOptions(screen.getByLabelText('Tipo de equipamento'), 'Outro')
    await user.type(screen.getByLabelText('Tipo personalizado'), 'Nobreak')
    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }))

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ equipment_type: 'Nobreak' }),
      'ws-1',
    )
  })

  it('nome obrigatório ⇒ erro local e sem round-trip', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome do equipamento.')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('tipo obrigatório ⇒ erro local', async () => {
    renderModal()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome do equipamento'), 'Notebook')
    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o tipo do equipamento.')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('patrimônio duplicado (conflict) ⇒ mensagem específica', async () => {
    const onSaved = vi.fn()
    mockCreate.mockRejectedValue(new PatrimonioError('conflict'))
    renderModal({ onSaved })

    const user = await fillValid()
    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um bem com este patrimônio/etiqueta nesta unidade.',
    )
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('falha de rede permite reenviar com sucesso', async () => {
    const onSaved = vi.fn()
    mockCreate
      .mockRejectedValueOnce(new PatrimonioError('query_failed'))
      .mockResolvedValueOnce(asset())
    renderModal({ onSaved })

    const user = await fillValid()
    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede ao salvar.')

    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }))
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('sem unidade ativa ⇒ formulário bloqueado', () => {
    renderModal({ workspaceId: null })
    expect(screen.getByLabelText('Nome do equipamento')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cadastrar bem' })).toBeDisabled()
  })

  it('mudança de unidade durante o preenchimento ⇒ bloqueia o envio', async () => {
    const onSaved = vi.fn()
    const { rerender, base } = renderModal()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome do equipamento'), 'Notebook')

    rerender(<AssetFormModal {...base} workspaceId="ws-2" onSaved={onSaved} />)

    expect(screen.getByText(/A unidade de trabalho mudou/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Cadastrar bem' })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('local que saiu das referências da unidade ⇒ erro de validação', async () => {
    const { rerender, base } = renderModal()
    const user = await fillValid()

    // Referências recarregadas sem o local antes selecionado (dado obsoleto).
    rerender(<AssetFormModal {...base} references={references({ locations: [] })} />)
    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O local selecionado não pertence a esta unidade.',
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('modo edição: pré-preenche, esconde custódia e envia update', async () => {
    const onSaved = vi.fn()
    const initial = asset()
    mockUpdate.mockResolvedValue(asset({ name: 'Novo nome' }))
    renderModal({ initial, onSaved })

    expect(screen.getByLabelText('Nome do equipamento')).toHaveValue('Notebook Dell')
    expect(screen.getByLabelText('Tipo de equipamento')).toHaveValue('Notebook')
    // Custódia não é editável aqui: vira texto, não select.
    expect(screen.queryByLabelText('Local')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Responsável')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Nome do equipamento'))
    await user.type(screen.getByLabelText('Nome do equipamento'), 'Novo nome')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ name: 'Novo nome' }),
      'ws-1',
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('previne envio duplicado e mostra estado de carregamento', async () => {
    const onSaved = vi.fn()
    const d = deferred<PatrimonioAsset>()
    mockCreate.mockReturnValueOnce(d.promise)
    renderModal({ onSaved })

    await fillValid()
    const submit = screen.getByRole('button', { name: 'Cadastrar bem' })

    // Dois cliques no MESMO tick: o guard (ref) barra o segundo.
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Cadastrando...' })).toBeDisabled()

    await act(async () => {
      d.resolve(asset())
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})