import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopApp } from '../DesktopApp'

const rig = vi.hoisted(() => ({
  invoke: vi.fn(),
  supabase: {
    auth: {
      getSession: vi.fn(),
      verifyOtp: vi.fn(),
    },
  },
  config: {
    deviceId: 'dev-boot',
    name: 'TV Lab',
    workspace: { id: 'ws-1', name: 'Campus A' },
    createdAt: '2026-06-25T12:00:00Z',
    screenApp: 'tv',
  },
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: rig.invoke, isTauri: () => true }))
vi.mock('../../lib/supabase', () => ({ defaultDb: rig.supabase }))
vi.mock('../config', () => ({
  loadConfig: vi.fn(async () => rig.config),
  saveConfig: vi.fn(async () => {}),
}))
vi.mock('../DisplayShell', () => ({
  DisplayShell: () => <div data-testid="desktop-shell" />,
}))

beforeEach(() => {
  vi.useRealTimers()
  rig.invoke.mockReset()
  rig.invoke.mockImplementation(async (command: string) => (
    command === 'is_local_usb_auth_valid' ? true : null
  ))
  rig.supabase.auth.getSession.mockClear()
  rig.supabase.auth.verifyOtp.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('boot do Desktop — Fase 5', () => {
  it('abre a TV com autorização USB/local sem login Supabase, heartbeat ou Chamados', async () => {
    render(<DesktopApp />)

    expect(await screen.findByTestId('desktop-shell')).toBeTruthy()
    expect(rig.supabase.auth.getSession).not.toHaveBeenCalled()
    expect(rig.supabase.auth.verifyOtp).not.toHaveBeenCalled()

    const commands = rig.invoke.mock.calls.map(([command]) => command)
    expect(commands).toContain('is_local_usb_auth_valid')
    expect(commands.some((command) => /heartbeat|chamados|tv\/chamados/i.test(String(command)))).toBe(false)
  })
})
