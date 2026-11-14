import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DrivePrerequisiteGate } from '../DrivePrerequisiteGate'

type Status = {
  installed: boolean
  running: boolean
  configured: boolean
  accountConfirmed: boolean
  folderPath: string | null
  mediaCount: number
  ready: boolean
  message: string
}

function setTauri(invoke: (command: string, args?: Record<string, unknown>) => unknown) {
  window.__TAURI__ = { core: { invoke } } as unknown as typeof window.__TAURI__
}

beforeEach(() => vi.useRealTimers())

afterEach(() => {
  vi.clearAllMocks()
  delete window.__TAURI__
  vi.useRealTimers()
})

describe('DrivePrerequisiteGate', () => {
  it('bloqueia quando o Google Drive não está instalado e oferece o site oficial', async () => {
    const status: Status = { installed: false, running: false, configured: false, accountConfirmed: false, folderPath: null, mediaCount: 0, ready: false, message: 'Google Drive para computador não foi encontrado neste computador.' }
    setTauri(vi.fn().mockResolvedValue(status))
    render(<DrivePrerequisiteGate onReady={vi.fn()} />)

    expect(await screen.findByText(status.message)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://www.google.com/drive/download/' })).toHaveAttribute('href', 'https://www.google.com/drive/download/')
    expect(screen.getByRole('button', { name: /validar pasta e continuar/i })).toBeDisabled()
  })

  it('só conclui após seleção, confirmação da conta e leitura bem-sucedida da pasta', async () => {
    const pending: Status = { installed: true, running: true, configured: false, accountConfirmed: false, folderPath: null, mediaCount: 0, ready: false, message: 'Confirme a conta e valide a pasta.' }
    const ready: Status = { installed: true, running: true, configured: true, accountConfirmed: true, folderPath: 'G:\\My Drive\\LabHub TV', mediaCount: 2, ready: true, message: 'Google Drive e pasta de mídia disponíveis.' }
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'drive_prerequisite_status') return invoke.mock.calls.filter(([name]) => name === command).length > 1 ? ready : pending
      if (command === 'configure_drive_folder') return { configured: true, folderPath: ready.folderPath }
      if (command === 'open_folder_dialog') return 'G:\\My Drive\\LabHub TV'
      throw new Error(`unexpected command ${command}`)
    })
    setTauri(invoke)
    const onReady = vi.fn()
    render(<DrivePrerequisiteGate onReady={onReady} />)

    await screen.findByText(pending.message)
    fireEvent.click(screen.getByRole('button', { name: /selecionar pasta/i }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('open_folder_dialog'))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /validar pasta e continuar/i }))

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(invoke).toHaveBeenCalledWith('configure_drive_folder', { folderPath: ready.folderPath, accountConfirmed: true })
  })
})