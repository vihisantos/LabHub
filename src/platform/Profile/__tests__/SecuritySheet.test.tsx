import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/helpers'

const mockSecurity = vi.hoisted(() => ({
  listPasskeys: vi.fn(),
  registerPasskey: vi.fn(),
  renamePasskey: vi.fn(),
  deletePasskey: vi.fn(),
  listFactors: vi.fn(),
  enrollWebauthn: vi.fn(),
  unenrollFactor: vi.fn(),
  browserSupportsPasskey: vi.fn(),
}))

vi.mock('../../../core/auth/securityService', () => ({
  securityService: {
    listPasskeys: mockSecurity.listPasskeys,
    registerPasskey: mockSecurity.registerPasskey,
    renamePasskey: mockSecurity.renamePasskey,
    deletePasskey: mockSecurity.deletePasskey,
    listFactors: mockSecurity.listFactors,
    enrollWebauthn: mockSecurity.enrollWebauthn,
    unenrollFactor: mockSecurity.unenrollFactor,
  },
  browserSupportsPasskey: mockSecurity.browserSupportsPasskey,
}))

import { SecuritySheet } from '../SecuritySheet'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  mockSecurity.browserSupportsPasskey.mockReturnValue(true)
  mockSecurity.listPasskeys.mockResolvedValue([])
  mockSecurity.listFactors.mockResolvedValue({ webauthn: [], totp: [], all: [] })
})

describe('SecuritySheet', () => {
  it('lista as passkeys cadastradas', async () => {
    mockSecurity.listPasskeys.mockResolvedValue([
      { id: 'pk-1', friendlyName: 'iPhone', createdAt: '2026-01-01T00:00:00Z' },
    ])
    renderWithProviders(<SecuritySheet open onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('iPhone')).toBeInTheDocument()
    })
  })

  it('cadastra uma nova passkey', async () => {
    mockSecurity.registerPasskey.mockResolvedValue({ ok: true })
    mockSecurity.listPasskeys.mockResolvedValue([
      { id: 'pk-1', friendlyName: 'iPhone', createdAt: '2026-01-01T00:00:00Z' },
    ])
    renderWithProviders(<SecuritySheet open onClose={() => {}} />)
    fireEvent.click(screen.getByText('Cadastrar'))

    await waitFor(() => {
      expect(mockSecurity.registerPasskey).toHaveBeenCalled()
      expect(screen.getByText('iPhone')).toBeInTheDocument()
    })
  })

  it('remove uma passkey', async () => {
    mockSecurity.listPasskeys.mockResolvedValue([
      { id: 'pk-1', friendlyName: 'iPhone', createdAt: '2026-01-01T00:00:00Z' },
    ])
    mockSecurity.deletePasskey.mockResolvedValue({ ok: true })
    renderWithProviders(<SecuritySheet open onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('iPhone')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByTitle('Remover')[0])

    await waitFor(() => {
      expect(mockSecurity.deletePasskey).toHaveBeenCalledWith('pk-1')
      expect(screen.queryByText('iPhone')).not.toBeInTheDocument()
    })
  })

  it('ativa a verificação em duas etapas (MFA WebAuthn)', async () => {
    mockSecurity.enrollWebauthn.mockResolvedValue({ ok: true })
    mockSecurity.listFactors.mockResolvedValue({
      webauthn: [{ id: 'f1', friendlyName: 'Biometria de verificação', factorType: 'webauthn', createdAt: '2026-01-01T00:00:00Z' }],
      totp: [],
      all: [],
    })
    renderWithProviders(<SecuritySheet open onClose={() => {}} />)
    fireEvent.click(screen.getByText('Ativar'))

    await waitFor(() => {
      expect(mockSecurity.enrollWebauthn).toHaveBeenCalled()
      expect(screen.getByText('Biometria de verificação')).toBeInTheDocument()
    })
  })

  it('desativa a verificação em duas etapas', async () => {
    mockSecurity.listFactors.mockResolvedValue({
      webauthn: [{ id: 'f1', friendlyName: 'Biometria', factorType: 'webauthn', createdAt: '2026-01-01T00:00:00Z' }],
      totp: [],
      all: [],
    })
    mockSecurity.unenrollFactor.mockResolvedValue({ ok: true })
    renderWithProviders(<SecuritySheet open onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Biometria')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByTitle('Remover')[0])

    await waitFor(() => {
      expect(mockSecurity.unenrollFactor).toHaveBeenCalledWith('f1')
      expect(screen.queryByText('Biometria')).not.toBeInTheDocument()
    })
  })
})
