import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const realProviderSpy = vi.hoisted(() => vi.fn())

/* Trava arquitetural da Fase 2.1: se qualquer código dentro do Admin Web
 * voltar a montar o MusicPlayerProvider (player real com áudio + iframe
 * YouTube), este teste precisa FALHAR. O Admin é só comando; quem toca é o
 * TV Desktop. */
vi.mock('../contexts/MusicPlayerContext', () => ({
  MusicPlayerProvider: ({ children }: { children: React.ReactNode }) => {
    realProviderSpy()
    return <div data-testid="real-music-player">{children}</div>
  },
  useMusicPlayer: () => {
    throw new Error('useMusicPlayer não pode ser usado dentro do Admin Web (Fase 2.1)')
  },
}))

vi.mock('../contexts/MusicPlayerCommandContext', () => ({
  MusicPlayerCommandProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-music-provider">{children}</div>
  ),
  useMusicPlayerCommand: () => ({
    playNext: vi.fn(),
  }),
}))

vi.mock('../pages/Admin', () => ({
  AdminView: () => <div data-testid="admin-view">AdminView</div>,
}))

import { TvApp } from '../index'

describe('Guarda arquitetural — Admin WEB não reproduz música (Fase 2.1)', () => {
  it('TvApp (Admin) monta o provider de COMANDO, nunca o MusicPlayerProvider real', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TvApp />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('admin-view')).toBeInTheDocument()
    expect(screen.getByTestId('command-music-provider')).toBeInTheDocument()
    expect(screen.queryByTestId('real-music-player')).not.toBeInTheDocument()
    expect(realProviderSpy).not.toHaveBeenCalled()
  })

  it('nenhum iframe de áudio é montado na árvore do Admin', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TvApp />
      </MemoryRouter>,
    )

    expect(document.querySelector('iframe')).toBeNull()
  })
})