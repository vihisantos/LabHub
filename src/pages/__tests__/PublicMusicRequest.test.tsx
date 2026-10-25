import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PublicMusicRequestPage } from '../PublicMusicRequest'

/**
 * Testes do formulário público de pedidos de música com Cloudflare Turnstile.
 *
 * A API do widget é pré-injetada em `window.turnstile` (evita carregar o
 * script real no jsdom); os testes disparam os callbacks do widget
 * (callback / expired-callback / error-callback) para exercitar os estados
 * de carregamento, sucesso, expiração, erro e nova tentativa.
 */

type TurnstileOpts = {
  sitekey: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
}

let lastOpts: TurnstileOpts | null = null
let postBody: Record<string, unknown> | null = null
let postResponseFactory: () => { ok: boolean; status: number; json: () => Promise<unknown> }
const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url)
  if (u.includes('/api/tv/public/request/context')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ workspace_name: 'Unidade X', form_issued_at_signed: 'sig-1' }),
    }
  }
  if (init?.method === 'POST') {
    postBody = JSON.parse(String(init.body))
    return postResponseFactory()
  }
  throw new Error('fetch inesperado: ' + u)
})

function mountPage() {
  return render(
    <MemoryRouter initialEntries={['/pedir-musica/qr-token-1']}>
      <Routes>
        <Route path="/pedir-musica/:token" element={<PublicMusicRequestPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function renderReady() {
  mountPage()
  await waitFor(() => expect(screen.getByPlaceholderText(/youtube\.com\/watch/i)).toBeInTheDocument())
}

function resolveChallenge(token = 'tk-123') {
  lastOpts?.callback?.(token)
}

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText(/youtube\.com\/watch/i), {
    target: { value: 'https://youtu.be/abc12345678' },
  })
  fireEvent.click(screen.getByRole('button', { name: /Enviar pedido/ }))
}

beforeEach(() => {
  // o setup global usa fake timers; este teste é assíncrono (fetch/waitFor)
  vi.useRealTimers()
  lastOpts = null
  postBody = null
  postResponseFactory = () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok', message: 'Pedido enviado. Aguarde aprovação.' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  window.turnstile = {
    render: vi.fn((el: HTMLElement, opts: TurnstileOpts) => {
      lastOpts = opts
      expect(el).toBeInstanceOf(HTMLElement)
      return 'widget-1'
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete window.turnstile
  lastOpts = null
  postBody = null
})

describe('PublicMusicRequestPage — Turnstile habilitado', () => {
  it('renderiza o desafio e envia turnstile_token no POST', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-x')
    await renderReady()

    expect(screen.getByTestId('turnstile-container')).toBeInTheDocument()
    await waitFor(() => expect(lastOpts?.sitekey).toBe('site-key-x'))

    // botão bloqueado antes do desafio ser resolvido
    expect(screen.getByRole('button', { name: /Enviar pedido/ })).toBeDisabled()

    resolveChallenge('tk-123')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Enviar pedido/ })).toBeEnabled(),
    )

    fillAndSubmit()
    await waitFor(() => expect(postBody).not.toBeNull())
    expect(postBody?.turnstile_token).toBe('tk-123')
    // comportamento preservado: QR, assinatura temporal e honeypot
    expect(postBody?.token).toBe('qr-token-1')
    expect(postBody?.form_issued_at_signed).toBe('sig-1')
    expect(postBody?.honeypot).toBe('')
  })

  it('bloqueia o envio enquanto o desafio não é resolvido', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-x')
    await renderReady()

    fillAndSubmit() // sem token: guard fail-closed no cliente
    await new Promise((r) => setTimeout(r, 20))
    expect(postBody).toBeNull()
  })

  it('expiração invalida o token e re-renderiza um desafio novo', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-x')
    await renderReady()

    resolveChallenge('tk-1')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Enviar pedido/ })).toBeEnabled(),
    )

    await waitFor(() => expect(lastOpts).not.toBeNull())
    lastOpts?.['expired-callback']?.()
    await waitFor(() =>
      expect(window.turnstile!.render).toHaveBeenCalledTimes(2),
    )
    expect(screen.getByRole('button', { name: /Enviar pedido/ })).toBeDisabled()
  })

  it('erro do desafio oferece nova tentativa', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-x')
    await renderReady()

    await waitFor(() => expect(lastOpts).not.toBeNull())
    lastOpts?.['error-callback']?.()
    const retry = await screen.findByRole('button', { name: /Tentar novamente/ })
    expect(screen.getByRole('button', { name: /Enviar pedido/ })).toBeDisabled()

    fireEvent.click(retry)
    await waitFor(() =>
      expect(window.turnstile!.render).toHaveBeenCalledTimes(2),
    )
  })

  it('resposta 400 do backend invalida o desafio e exibe o erro', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-x')
    postResponseFactory = () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Verificação falhou. Tente novamente.' }),
    })
    await renderReady()

    resolveChallenge('tk-1')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Enviar pedido/ })).toBeEnabled(),
    )
    fillAndSubmit()
    await waitFor(() => expect(postBody).not.toBeNull())

    // o desafio consumido é invalidado e o formulário sai do estado pronto
    // (o QR continua válido: o usuário resolve um desafio novo ao reabrir)
    expect(screen.getByText(/Verificação falhou/)).toBeInTheDocument()
    expect(screen.queryByTestId('turnstile-container')).not.toBeInTheDocument()
    // nenhuma re-submissão automática com o token consumido
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })
})

describe('PublicMusicRequestPage — Turnstile desativado (sem site key)', () => {
  it('não renderiza o desafio e envia o POST sem turnstile_token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    await renderReady()

    expect(screen.queryByTestId('turnstile-container')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enviar pedido/ })).toBeEnabled()

    fillAndSubmit()
    await waitFor(() => expect(postBody).not.toBeNull())
    expect(postBody?.turnstile_token).toBeUndefined()
    expect(postBody?.token).toBe('qr-token-1')
  })
})
