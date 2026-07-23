import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))
vi.mock('../../components/PCPhotoUpload', () => ({ PCPhotoUpload: () => <div data-testid="photo-upload" /> }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'pc-1' }) }
})

import { usePCs } from '../../hooks/usePCs'
import { PCForm } from '../PCForm'

const mockPC = {
  id: 'pc-1',
  labName: 'Lab A',
  pcNumber: 'PC-001',
  assetTag: 'TAG-001',
  roomLocation: 'Sala 101',
  specs: { cpu: 'i5-10400', ram: '8GB DDR4', storage: 'SSD 240GB' },
  config: { osType: 'windows', osVersion: '10', osEdition: 'pro', pcType: 'desktop', domain: '' },
  cleaningStatus: 'pending',
  restorationStatus: 'pending',
  softwareInstalled: ['Chrome', 'VS Code'],
  partsReplaced: [],
  observations: 'PC em bom estado',
  photos: [],
  lastIntervention: null,
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000000, nanoseconds: 0 },
}

function renderForm() {
  return render(<MemoryRouter initialEntries={['/pc-care/pcs/pc-1/edit']}><PCForm /></MemoryRouter>)
}

describe('PCForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(usePCs as any).mockReturnValue({ pcs: [mockPC], update: vi.fn() })
  })

  it('renderiza título "Editar PC"', () => {
    renderForm()
    expect(screen.getByText('Editar PC')).toBeInTheDocument()
  })

  it('exibe seção Identificação', () => {
    renderForm()
    expect(screen.getByText('Identificação')).toBeInTheDocument()
  })

  it('exibe seção Especificações', () => {
    renderForm()
    expect(screen.getByText('Especificações')).toBeInTheDocument()
  })

  it('exibe seção Configuração do Sistema', () => {
    renderForm()
    expect(screen.getByText('Configuração do Sistema')).toBeInTheDocument()
  })

  it('exibe seção Status', () => {
    renderForm()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('exibe seção Software Instalado com softwares', () => {
    renderForm()
    expect(screen.getByText('Chrome')).toBeInTheDocument()
    expect(screen.getByText('VS Code')).toBeInTheDocument()
  })

  it('exibe seção Fotos', () => {
    renderForm()
    expect(screen.getByTestId('photo-upload')).toBeInTheDocument()
  })

  it('exibe seção Observações', () => {
    renderForm()
    expect(screen.getByText('Observações')).toBeInTheDocument()
  })

  it('exibe campo de laboratório preenchido', () => {
    renderForm()
    const labInput = screen.getByDisplayValue('Lab A')
    expect(labInput).toBeInTheDocument()
  })

  it('exibe botões Cancelar e Salvar', () => {
    renderForm()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()
    expect(screen.getByText('Salvar')).toBeInTheDocument()
  })

  it('navega para /pc-care/pcs ao clicar Cancelar', () => {
    renderForm()
    screen.getByText('Cancelar').click()
    expect(mockNavigate).toHaveBeenCalledWith('/pc-care/pcs')
  })

  it('exibe "PC não encontrado" para PC inválido', () => {
    ;(usePCs as any).mockReturnValue({ pcs: [], update: vi.fn() })
    renderForm()
    expect(screen.getByText('PC não encontrado')).toBeInTheDocument()
  })

  it('exibe input de software com placeholder', () => {
    renderForm()
    expect(screen.getByPlaceholderText('Digite o nome do software...')).toBeInTheDocument()
  })

  it('exibe seção Observações com valor preenchido', () => {
    renderForm()
    const textarea = screen.getByDisplayValue('PC em bom estado')
    expect(textarea).toBeInTheDocument()
  })
})
