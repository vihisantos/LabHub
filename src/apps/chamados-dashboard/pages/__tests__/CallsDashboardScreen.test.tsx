import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { CallsDashboardScreen } from '../CallsDashboardScreen'
import { CHAMADOS_POLL_MS } from '../../hooks/useChamadosDisplay'
import { tvApi } from '../../../tv/utils/apiBase'

/* Sessão do kiosk mockada — token vem do mecanismo existente do dispositivo */
const mockSupabase = vi.hoisted(() => ({
  auth: { getSession: vi.fn() },
}))

vi.mock('../../../../lib/supabase', () => ({ defaultDb: mockSupabase }))

const SNAPSHOT = {
  generatedAt: '2026-06-25T12:00:00Z',
  summary: {
    total: 3, open: 2, inProgress: 1, highPriority: 1,
    avgResolutionHours: 5.3, satisfaction: 4.2,
  },
  tickets: [
    {
      ticketNumber: 101, roomName: 'Lab 204', problemArea: 'Computador',
      problemCategory: 'Hardware', priority: 'alta', status: 'aberto',
      createdAt: '2026-06-25T10:00:00Z', resolvedAt: null,
    },
    {
      ticketNumber: 102, roomName: '', problemArea: 'academica',
      problemCategory: 'Projetor', priority: 'urgente', status: 'em_atendimento',
      createdAt: '2026-06-25T11:30:00Z', resolvedAt: null,
    },
    {
      ticketNumber: 103, roomName: 'Sala 12', problemArea: 'administrativa',
      problemCategory: 'Internet', priority: 'baixa', status: 'a_caminho',
      createdAt: '2026-06-25T09:00:00Z', resolvedAt: null,
    },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status === 200, status, json: async () => body } as unknown as Response
}

/** Consome microtasks e, com ms > 0, dispara ciclos de polling (fake timers). */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  mockSupabase.auth.getSession.mockReset()
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'kiosk-token' } } })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderWithSuccess(payload: unknown = SNAPSHOT) {
  fetchMock.mockResolvedValue(jsonResponse(payload))
  render(<CallsDashboardScreen />)
  await flush()
}

/** Card do resumo pelo rótulo — evita ambiguidade com badges da tabela. */
function summaryCard(label: string): HTMLElement {
  const section = screen.getByLabelText('Resumo da fila')
  const card = Array.from(section.children).find(
    (child) => child.querySelector('p')?.textContent === label,
  )
  if (!card) throw new Error(`Card "${label}" não encontrado`)
  return card as HTMLElement
}

describe('Carregamento e conteúdo', () => {
  it('mostra estado de loading discreto no primeiro carregamento', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<CallsDashboardScreen />)
    await flush()

    expect(screen.getByRole('status')).toHaveTextContent('Carregando painel')
    expect(screen.queryByText('Painel de Chamados')).not.toBeInTheDocument()
  })

  it('renderiza os cards do resumo da fila', async () => {
    await renderWithSuccess()

    expect(screen.getByText('Painel de Chamados')).toBeInTheDocument()
    expect(summaryCard('Total na fila')).toHaveTextContent('3')
    expect(summaryCard('Abertos')).toHaveTextContent('2')
    expect(summaryCard('Em atendimento')).toHaveTextContent('1')
    expect(summaryCard('Alta prioridade')).toHaveTextContent('1')
  })

  it('renderiza métricas de serviço formatadas em pt-BR', async () => {
    await renderWithSuccess()

    expect(screen.getByText('Tempo médio de resolução').parentElement).toHaveTextContent('5,3 h')
    expect(screen.getByText('Satisfação').parentElement).toHaveTextContent('4,2 / 5')
  })

  it('métrica null aparece como "—" e nunca como 0', async () => {
    const payload = {
      ...SNAPSHOT,
      summary: { ...SNAPSHOT.summary, avgResolutionHours: null, satisfaction: null },
    }
    await renderWithSuccess(payload)

    const metrics = screen.getByLabelText('Métricas de serviço')
    expect(metrics.textContent?.split('—')).toHaveLength(3) // duas métricas nulas
    expect(metrics.textContent).not.toMatch(/\d/)
  })

  it('renderiza a lista de chamados com os campos permitidos', async () => {
    await renderWithSuccess()

    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByText('Lab 204')).toBeInTheDocument()
    expect(screen.getByText('Hardware · Computador')).toBeInTheDocument()
    expect(screen.getByText('#103')).toBeInTheDocument()
    expect(screen.getByText('Internet · administrativa')).toBeInTheDocument()
  })

  it('usa labels amigáveis em PT-BR de status e prioridade', async () => {
    await renderWithSuccess()

    /* "Aberto" também é cabeçalho de coluna — o badge é verificado na linha */
    expect(screen.getByText('#101').closest('tr')).toHaveTextContent('Aberto')
    expect(screen.getByText('A caminho')).toBeInTheDocument()
    expect(screen.getAllByText('Em atendimento').length).toBeGreaterThan(0)
    expect(screen.getByText('Alta')).toBeInTheDocument()
    expect(screen.getByText('Urgente')).toBeInTheDocument()
    expect(screen.getByText('Baixa')).toBeInTheDocument()
  })

  it('exibe generatedAt convertido para horário local', async () => {
    await renderWithSuccess()

    expect(screen.getByLabelText(/Última atualização às \d{2}:\d{2}/)).toBeInTheDocument()
    expect(screen.getByText(/Atualizado às \d{2}:\d{2}/)).toBeInTheDocument()
  })

  it('lista vazia mostra estado neutro explicativo', async () => {
    await renderWithSuccess({ ...SNAPSHOT, tickets: [] })

    expect(screen.getByText('Nenhum chamado em aberto neste momento')).toBeInTheDocument()
  })

  it('não renderiza campos proibidos mesmo se a resposta os trouxer', async () => {
    const leaked = {
      ...SNAPSHOT,
      tickets: [{
        ...SNAPSHOT.tickets[0],
        reportedBy: 'LEAK-Joao',
        reportedByEmail: 'leak@escola.com',
        problemDescription: 'LEAK-descricao',
        assetPatrimony: 'LEAK-PAT',
        photos: 'LEAK-foto',
        workspace_id: 'ws-leak',
        roomId: 'room-leak',
      }],
    }
    await renderWithSuccess(leaked)

    expect(document.body.textContent).not.toContain('LEAK')
  })
})

describe('Falhas de API', () => {
  async function renderWithFailure(status: number) {
    fetchMock.mockResolvedValue(jsonResponse({}, status))
    render(<CallsDashboardScreen />)
    await flush()
  }

  it('401 indica que a sessão do dispositivo precisa ser renovada', async () => {
    await renderWithFailure(401)

    expect(screen.getByRole('alert')).toHaveTextContent('Sessão do dispositivo expirada')
    expect(screen.queryByText('Painel de Chamados')).not.toBeInTheDocument()
  })

  it('403 mostra estado de dispositivo não autorizado', async () => {
    await renderWithFailure(403)

    expect(screen.getByRole('alert')).toHaveTextContent('Dispositivo não autorizado')
  })

  it('429 mantém o último snapshot válido e avisa sobre o limite', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SNAPSHOT))
    fetchMock.mockResolvedValue(jsonResponse({}, 429))
    render(<CallsDashboardScreen />)
    await flush()
    await flush(CHAMADOS_POLL_MS)

    expect(screen.getByRole('alert')).toHaveTextContent('temporariamente limitada')
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument()
  })

  it('502 mantém dados anteriores e indica indisponibilidade', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SNAPSHOT))
    fetchMock.mockResolvedValue(jsonResponse({}, 502))
    render(<CallsDashboardScreen />)
    await flush()
    await flush(CHAMADOS_POLL_MS)

    expect(screen.getByRole('alert')).toHaveTextContent('temporariamente indisponível')
    expect(screen.getByText('#102')).toBeInTheDocument()
  })

  it('erro de rede mantém o snapshot e não quebra a tela', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SNAPSHOT))
    fetchMock.mockRejectedValue(new TypeError('network down'))
    render(<CallsDashboardScreen />)
    await flush()
    await flush(CHAMADOS_POLL_MS)

    expect(screen.getByRole('alert')).toHaveTextContent('sem conexão com a API')
    expect(screen.getByText('Painel de Chamados')).toBeInTheDocument()
  })

  it('erro sem nenhum snapshot anterior nunca fica em tela branca', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    render(<CallsDashboardScreen />)
    await flush()

    const alert = screen.getByRole('alert')
    expect(alert.textContent?.length ?? 0).toBeGreaterThan(5)
    expect(screen.getByText('Tentando novamente automaticamente…')).toBeInTheDocument()
  })
})

describe('Segurança do frontend', () => {
  it('chama exclusivamente o endpoint TV-safe, sem escopo do cliente', async () => {
    await renderWithSuccess()
    await flush(CHAMADOS_POLL_MS)

    expect(fetchMock).toHaveBeenCalled()
    for (const call of fetchMock.mock.calls) {
      const [url, init] = call as [string, RequestInit]
      expect(String(url)).toBe(tvApi('/api/tv/chamados/display'))
      expect(init.method).toBe('GET')
      expect(init.body).toBeUndefined()
      expect(String(url)).not.toContain('workspace')
      expect(String(url)).not.toContain('device_id')
    }
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer kiosk-token')
  })
})
