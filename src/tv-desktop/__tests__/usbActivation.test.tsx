import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopApp } from '../DesktopApp'

const rig = vi.hoisted(() => ({
  api: {
    isLocalUsbAuthValid: vi.fn(),
    listUsbDrives: vi.fn(),
    findUsbWithKey: vi.fn(),
    validateUsbAuth: vi.fn(),
    activateWithUsb: vi.fn(),
    getLocalUsbAuth: vi.fn(),
  },
  config: {
    loadConfig: vi.fn(),
    saveConfig: vi.fn(),
  },
  supabase: {
    auth: {
      getSession: vi.fn(),
      verifyOtp: vi.fn(),
    },
  },
}))

vi.mock('../usbAuthApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../usbAuthApi')>()
  return { ...actual, ...rig.api }
})
vi.mock('../config', () => ({ loadConfig: rig.config.loadConfig, saveConfig: rig.config.saveConfig }))
vi.mock('../DisplayShell', () => ({ DisplayShell: () => <div data-testid="desktop-shell" /> }))
vi.mock('../../lib/supabase', () => ({ defaultDb: rig.supabase }))

const validConfig = {
  deviceId: 'dev-1',
  name: 'LabHub TV Local',
  workspace: { id: 'local-dev-1', name: 'LabHub TV Local' },
  createdAt: '2026-11-21T12:00:00Z',
  screenApp: 'tv' as const,
}

const localAuth = {
  deviceId: 'dev-1',
  keyId: 'key-1',
  expiresAt: Date.now() + 86_400_000,
  driveLetter: 'E:',
}

function mockMissingAuth() {
  rig.api.isLocalUsbAuthValid.mockResolvedValue(false)
  rig.api.getLocalUsbAuth.mockRejectedValue(new Error('Arquivo de autorização não encontrado'))
}

function mockValidUsb() {
  rig.api.listUsbDrives.mockResolvedValue(['E:'])
  rig.api.findUsbWithKey.mockResolvedValue('E:')
  rig.api.validateUsbAuth.mockResolvedValue({
    success: true,
    key_id: 'key-1',
    device_name: 'Pendrive LabHub',
    error: null,
  })
  rig.api.activateWithUsb.mockResolvedValue({ success: true, deviceId: 'dev-1' })
}

beforeEach(() => {
  vi.useRealTimers()
  Object.values(rig.api).forEach((fn) => fn.mockReset())
  rig.config.loadConfig.mockReset()
  rig.config.saveConfig.mockReset()
  rig.supabase.auth.getSession.mockClear()
  rig.supabase.auth.verifyOtp.mockClear()

  rig.api.isLocalUsbAuthValid.mockResolvedValue(false)
  rig.api.listUsbDrives.mockResolvedValue([])
  rig.api.findUsbWithKey.mockResolvedValue(null)
  rig.api.validateUsbAuth.mockResolvedValue({
    success: false,
    key_id: '',
    device_name: '',
    error: 'Credencial inválida',
  })
  rig.api.activateWithUsb.mockResolvedValue({ success: false })
  rig.api.getLocalUsbAuth.mockRejectedValue(new Error('Arquivo de autorização não encontrado'))
  rig.config.loadConfig.mockResolvedValue(null)
  rig.config.saveConfig.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Fase 5.3 — primeira execução e ativação USB', () => {
  it('abre a tela interativa na primeira instalação, sem configuração', async () => {
    mockMissingAuth()
    rig.config.loadConfig.mockResolvedValue(null)

    render(<DesktopApp />)

    expect(await screen.findByTestId('usb-activation-screen')).toBeTruthy()
    expect(screen.getByText('Ative seu LabHub TV')).toBeTruthy()
    expect(await screen.findByRole('button', { name: /Verificar pendrive/ })).toBeTruthy()
    expect(screen.queryByText(/Configuração ausente ou corrompida/)).toBeNull()
    expect(rig.api.activateWithUsb).not.toHaveBeenCalled()
    expect(rig.supabase.auth.getSession).not.toHaveBeenCalled()
    expect(rig.supabase.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('permanece na ativação quando não há pendrive', async () => {
    mockMissingAuth()
    rig.api.listUsbDrives.mockResolvedValue([])

    render(<DesktopApp />)

    expect(await screen.findByText(/Nenhum pendrive encontrado/)).toBeTruthy()
    expect(screen.getByTestId('usb-activation-screen')).toBeTruthy()
    const verifyButton = screen.getByRole('button', { name: /Verificar pendrive/ })
    expect(verifyButton).toBeTruthy()

    const callsAfterMount = rig.api.listUsbDrives.mock.calls.length
    fireEvent.click(verifyButton)
    expect(rig.api.listUsbDrives.mock.calls.length).toBeGreaterThan(callsAfterMount)
    expect(rig.api.validateUsbAuth).not.toHaveBeenCalled()
  })

  it('ativa com pendrive válido, persiste e abre a interface institucional', async () => {
    mockMissingAuth()
    mockValidUsb()
    rig.api.getLocalUsbAuth.mockReset()
    rig.api.getLocalUsbAuth
      .mockRejectedValueOnce(new Error('Arquivo de autorização não encontrado'))
      .mockResolvedValue(localAuth)
    rig.config.loadConfig.mockReset()
    rig.config.loadConfig.mockResolvedValueOnce(null).mockResolvedValue(validConfig)

    render(<DesktopApp />)

    expect(await screen.findByTestId('desktop-shell')).toBeTruthy()
    expect(rig.api.listUsbDrives).toHaveBeenCalled()
    expect(rig.api.findUsbWithKey).toHaveBeenCalled()
    expect(rig.api.validateUsbAuth).toHaveBeenCalledWith('E:')
    expect(rig.api.activateWithUsb).toHaveBeenCalledWith('E:')
    expect(rig.config.saveConfig).toHaveBeenCalledTimes(1)
    expect(rig.api.getLocalUsbAuth).toHaveBeenCalledTimes(2)
    expect(rig.supabase.auth.getSession).not.toHaveBeenCalled()
  })

  it('mantém a tela interativa e mostra erro quando o pendrive é inválido', async () => {
    mockMissingAuth()
    rig.api.listUsbDrives.mockResolvedValue(['E:'])
    rig.api.findUsbWithKey.mockResolvedValue('E:')
    rig.api.validateUsbAuth.mockResolvedValue({
      success: false,
      key_id: '',
      device_name: '',
      error: 'Chave pública não confiável - hash divergiu',
    })

    render(<DesktopApp />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Chave pública não confiável')
    expect(screen.getByTestId('usb-activation-screen')).toBeTruthy()
    expect(screen.queryByTestId('desktop-shell')).toBeNull()
    expect(rig.api.activateWithUsb).not.toHaveBeenCalled()
    expect(screen.queryByText(/Configuração ausente ou corrompida/)).toBeNull()
  })

  it('solicita nova ativação com mensagem específica quando a autorização expirou', async () => {
    rig.api.isLocalUsbAuthValid.mockResolvedValue(false)
    rig.api.getLocalUsbAuth.mockRejectedValue(new Error('Autorização expirada'))

    render(<DesktopApp />)

    expect(await screen.findByText(/A autorização deste dispositivo expirou/)).toBeTruthy()
    expect(screen.getByTestId('usb-activation-screen')).toBeTruthy()
  })

  it('oferece reativação quando a configuração está corrompida, sem apagar a autorização', async () => {
    rig.api.isLocalUsbAuthValid.mockResolvedValue(true)
    rig.config.loadConfig.mockResolvedValue(null)

    render(<DesktopApp />)

    expect(await screen.findByText(/configuração local estava inválida/)).toBeTruthy()
    expect(screen.getByTestId('usb-activation-screen')).toBeTruthy()
    expect(rig.api.getLocalUsbAuth).not.toHaveBeenCalled()
    expect(rig.config.saveConfig).not.toHaveBeenCalled()
  })

  it('mostra erro recuperável com tentativa nova em falha temporária de leitura', async () => {
    rig.api.isLocalUsbAuthValid
      .mockRejectedValueOnce(new Error('Falha ao ler auth: acesso negado'))
      .mockResolvedValue(true)
    rig.config.loadConfig.mockResolvedValue(validConfig)

    render(<DesktopApp />)

    expect(await screen.findByTestId('desktop-recoverable-error')).toBeTruthy()
    expect(screen.getByText(/Não foi possível ler o estado local/)).toBeTruthy()
    expect(screen.queryByText(/Configuração ausente ou corrompida/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByTestId('desktop-shell')).toBeTruthy()
  })

  it('recria a ativação após instalação limpa sem depender de dados anteriores', async () => {
    mockMissingAuth()
    mockValidUsb()
    rig.api.getLocalUsbAuth.mockReset()
    rig.api.getLocalUsbAuth
      .mockRejectedValueOnce(new Error('Arquivo de autorização não encontrado'))
      .mockResolvedValue(localAuth)
    rig.config.loadConfig.mockReset()
    rig.config.loadConfig.mockResolvedValueOnce(null).mockResolvedValue(validConfig)

    render(<DesktopApp />)

    expect(await screen.findByTestId('usb-activation-screen')).toBeTruthy()
    expect(await screen.findByTestId('desktop-shell')).toBeTruthy()
    expect(rig.api.activateWithUsb).toHaveBeenCalledTimes(1)
    expect(rig.config.saveConfig).toHaveBeenCalledTimes(1)
    const saved = rig.config.saveConfig.mock.calls[0][0]
    expect(saved.deviceId).toBe('dev-1')
    expect(saved.workspace.id).toBe('local-dev-1')
  })

  it('mantém a ativação válida após reiniciar, sem exigir o pendrive', async () => {
    rig.api.isLocalUsbAuthValid.mockResolvedValue(true)
    rig.config.loadConfig.mockResolvedValue(validConfig)

    render(<DesktopApp />)

    expect(await screen.findByTestId('desktop-shell')).toBeTruthy()
    expect(rig.api.listUsbDrives).not.toHaveBeenCalled()
    expect(rig.api.findUsbWithKey).not.toHaveBeenCalled()
    expect(rig.api.validateUsbAuth).not.toHaveBeenCalled()
    expect(rig.api.activateWithUsb).not.toHaveBeenCalled()
    expect(rig.api.getLocalUsbAuth).not.toHaveBeenCalled()
  })

  it('não exibe tela branca em nenhum estado e nunca usa login Supabase', async () => {
    mockMissingAuth()

    const { container } = render(<DesktopApp />)

    expect(await screen.findByTestId('usb-activation-screen')).toBeTruthy()
    expect(screen.queryByText(/Configuração ausente ou corrompida/)).toBeNull()
    expect(container.querySelector('[style*="background: #f6f8fb"]')).toBeNull()
    expect(rig.supabase.auth.getSession).not.toHaveBeenCalled()
    expect(rig.supabase.auth.verifyOtp).not.toHaveBeenCalled()
  })
})
