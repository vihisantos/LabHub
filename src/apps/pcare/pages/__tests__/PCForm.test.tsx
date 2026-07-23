import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/useAssets', () => ({ useAssets: vi.fn() }))
vi.mock('../../components/PCPhotoUpload', () => ({ PCPhotoUpload: () => <div data-testid="photo-upload" /> }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'pc-1' }) }
})

import { useAssets } from '../../hooks/useAssets'
import { PCForm } from '../PCForm'

const mockAsset = {
  id: 'pc-1',
  assetTag: 'TAG-001',
  equipmentType: 'Desktop',
  manufacturer: 'Dell',
  model: 'OptiPlex 7090',
  serialNumber: 'SN-123',
  location: 'Sala 101',
  status: 'in_use',
  observations: 'PC em bom estado',
  technical: {
    operatingSystem: 'windows',
    architecture: 'intel',
    processor: 'i5-10400',
    memory: '8GB DDR4',
    storageType: 'ssd_sata',
    storageCapacity: '240GB',
    storageBrand: 'Kingston',
  },
  network: {
    hostname: 'PC-001',
    macEthernet: '00:11:22:33:44:55',
    macWifi: '',
    ip: '192.168.1.100',
    domain: 'lab.local',
  },
  parentAssetId: null,
  childAssetIds: [],
  photos: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

function renderForm() {
  return render(<MemoryRouter initialEntries={['/pc-care/assets/pc-1/edit']}><PCForm /></MemoryRouter>)
}

describe('PCForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAssets as any).mockReturnValue({ assets: [mockAsset], create: vi.fn(), update: vi.fn() })
  })

  it('renderiza título "Editar ativo"', () => {
    renderForm()
    expect(screen.getByText('Editar ativo')).toBeInTheDocument()
  })

  it('exibe seção Identificação', () => {
    renderForm()
    expect(screen.getByText('Identificação')).toBeInTheDocument()
  })

  it('exibe seção Informações técnicas', () => {
    renderForm()
    expect(screen.getByText('Informações técnicas')).toBeInTheDocument()
  })

  it('exibe seção Rede', () => {
    renderForm()
    expect(screen.getByText('Rede')).toBeInTheDocument()
  })

  it('exibe seção Observações', () => {
    renderForm()
    expect(screen.getByText('Observações')).toBeInTheDocument()
  })

  it('exibe campo de localização preenchido', () => {
    renderForm()
    const locationInput = screen.getByDisplayValue('Sala 101')
    expect(locationInput).toBeInTheDocument()
  })

  it('exibe botões Cancelar e Salvar', () => {
    renderForm()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()
    expect(screen.getByText('Salvar ativo')).toBeInTheDocument()
  })

  it('navega ao clicar Cancelar', () => {
    renderForm()
    screen.getByText('Cancelar').click()
    expect(mockNavigate).toHaveBeenCalled()
  })

  it('exibe "Ativo não encontrado" para ativo inválido', () => {
    ;(useAssets as any).mockReturnValue({ assets: [], create: vi.fn(), update: vi.fn() })
    renderForm()
    expect(screen.getByText('Ativo não encontrado.')).toBeInTheDocument()
  })

  it('exibe seção Observações com valor preenchido', () => {
    renderForm()
    const textarea = screen.getByDisplayValue('PC em bom estado')
    expect(textarea).toBeInTheDocument()
  })
})
