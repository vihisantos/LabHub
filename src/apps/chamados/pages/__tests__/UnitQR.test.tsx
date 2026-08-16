import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'

const mockCanManageQr = vi.hoisted(() => vi.fn())
const mockToDataURL = vi.hoisted(() => vi.fn())
const mockRenderPosterPng = vi.hoisted(() => vi.fn())
const mockSaveAs = vi.hoisted(() => vi.fn())
const mockWriteText = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => ({
    role: { id: 'r', name: 'Administrador', key: 'admin', appAccess: {} },
    getLevel: () => 'full',
    canAccessApp: () => true,
    isFullAccess: () => true,
    canManageQr: mockCanManageQr,
  }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: mockToDataURL } }))
vi.mock('../../utils/posterToPng', () => ({ renderPosterPng: mockRenderPosterPng }))
vi.mock('file-saver', () => ({ saveAs: mockSaveAs }))

import { UnitQR } from '../UnitQR'

beforeEach(() => {
  vi.clearAllMocks()
  mockCanManageQr.mockReturnValue(true)
  mockToDataURL.mockResolvedValue('data:image/png;base64,QR')
  mockRenderPosterPng.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    configurable: true,
  })
})

describe('UnitQR', () => {
  it('bloqueia sem permissão', () => {
    mockCanManageQr.mockReturnValue(false)
    renderWithProviders(<UnitQR />)

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument()
    expect(screen.getByText('Voltar ao painel')).toBeInTheDocument()
  })

  it('gera o pôster com o QR da unidade', async () => {
    renderWithProviders(<UnitQR />)
    await act(async () => {})

    expect(mockToDataURL).toHaveBeenCalledWith(
      expect.stringContaining('/chamados-publico/new'),
      expect.any(Object),
    )
    expect(screen.getByText('Abrir Chamado')).toBeInTheDocument()
    expect(screen.getByText('QR único de chamados')).toBeInTheDocument()
  })

  it('copia o link para a área de transferência', async () => {
    mockWriteText.mockResolvedValue(undefined)
    renderWithProviders(<UnitQR />)
    await act(async () => {})

    fireEvent.click(screen.getByText('Copiar link'))
    await act(async () => {})

    expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('/chamados-publico/new'))
    expect(screen.getByText('Link copiado!')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Copiar link')).toBeInTheDocument()
  })

  it('baixa o pôster como PNG', async () => {
    renderWithProviders(<UnitQR />)
    await act(async () => {})

    fireEvent.click(screen.getByText('Baixar pôster'))
    await act(async () => {})

    expect(mockRenderPosterPng).toHaveBeenCalledWith(expect.stringContaining('/chamados-publico/new'))
    expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'qr-chamados-poster.png')
  })
})
