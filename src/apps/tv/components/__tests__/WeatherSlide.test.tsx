import { render, screen, waitFor, act } from '@testing-library/react'
import { WeatherSlide } from '../WeatherSlide'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

const CITY_DATA: Record<string, { temp: number; desc: string; id?: number }> = {
  'Piracicaba': { temp: 26, desc: 'céu limpo' },
  'Campinas': { temp: 24, desc: 'nublado', id: 802 },
  'Limeira': { temp: 27, desc: 'chuva', id: 500 },
  'São Paulo': { temp: 23, desc: 'parcialmente nublado', id: 801 },
  'Americana': { temp: 25, desc: 'nevoeiro', id: 741 },
}

function mockFetchByCity() {
  return vi.fn().mockImplementation((url: string) => {
    const cityKey = Object.keys(CITY_DATA).find((k) => url.includes(k))
    const data = cityKey ? CITY_DATA[cityKey] : { temp: 25, desc: 'céu limpo' }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        main: { temp: data.temp },
        weather: [{ id: data.id ?? 800, description: data.desc }],
      }),
    })
  })
}

describe('WeatherSlide', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('não renderiza nada quando não há API key', () => {
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', '')
    const { container } = render(<WeatherSlide />)
    expect(container.innerHTML).toBe('')
  })

  it('não renderiza nada enquanto carrega dados', () => {
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { container } = render(<WeatherSlide />)
    expect(container.innerHTML).toBe('')
  })

  it('renderiza todas as 5 cidades', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = mockFetchByCity()

    await act(async () => {
      render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(screen.getByText('Piracicaba')).toBeInTheDocument()
    })
    expect(screen.getByText('Campinas')).toBeInTheDocument()
    expect(screen.getByText('Limeira')).toBeInTheDocument()
    expect(screen.getByText('São Paulo')).toBeInTheDocument()
    expect(screen.getByText('Americana')).toBeInTheDocument()
  })

  it('renderiza temperaturas corretas por cidade', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = mockFetchByCity()

    await act(async () => {
      render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(screen.getByText('26°')).toBeInTheDocument()
    })
    expect(screen.getByText('24°')).toBeInTheDocument()
    expect(screen.getByText('27°')).toBeInTheDocument()
    expect(screen.getByText('23°')).toBeInTheDocument()
    expect(screen.getByText('25°')).toBeInTheDocument()
  })

  it('renderiza saudação de acordo com horário', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = mockFetchByCity()

    await act(async () => {
      render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(screen.getByText(/Campus!/)).toBeInTheDocument()
    })
  })

  it('renderiza "Boa tarde" no período da tarde', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = mockFetchByCity()
    vi.setSystemTime(new Date('2026-06-25T18:00:00Z'))

    await act(async () => {
      render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(screen.getByText('Boa tarde, Campus!')).toBeInTheDocument()
    })
  })

  it('renderiza "Boa noite" no período noturno', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = mockFetchByCity()
    vi.setSystemTime(new Date('2026-06-26T01:00:00Z'))

    await act(async () => {
      render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(screen.getByText('Boa noite, Campus!')).toBeInTheDocument()
    })
  })

  it('não renderiza nada quando fetch retorna erro', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const { container } = await act(async () => {
      return render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })

  it('não renderiza nada quando fetch falha na rede', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'))

    const { container } = await act(async () => {
      return render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })

  it('renderiza label da região', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    globalThis.fetch = mockFetchByCity()

    await act(async () => {
      render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(screen.getByText('REGIÃO DE PIRACICABA')).toBeInTheDocument()
    })
  })

  it('faz fetch para todas as 5 cidades', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')
    const fetchMock = mockFetchByCity()
    globalThis.fetch = fetchMock

    await act(async () => {
      render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5)
    })

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('Piracicaba,BR'))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('Campinas,BR'))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('Limeira,BR'))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('São Paulo,BR'))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('Americana,BR'))
  })

  it('arredonda temperaturas', async () => {
    vi.useRealTimers()
    vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key')

    const roundData: Record<string, { temp: number; desc: string }> = {
      'Piracicaba': { temp: 27.8, desc: 'quente' },
      'Campinas': { temp: 22.2, desc: 'fresco' },
      'Limeira': { temp: 19.5, desc: 'frio' },
      'São Paulo': { temp: 30.1, desc: 'muito quente' },
      'Americana': { temp: 25.0, desc: 'ameno' },
    }

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const cityKey = Object.keys(roundData).find((k) => url.includes(k))
      const data = cityKey ? roundData[cityKey] : { temp: 25, desc: 'ok' }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          main: { temp: data.temp },
          weather: [{ id: 800, description: data.desc }],
        }),
      })
    })

    await act(async () => {
      render(<WeatherSlide />)
    })

    await waitFor(() => {
      expect(screen.getByText('28°')).toBeInTheDocument()
    })
    expect(screen.getByText('22°')).toBeInTheDocument()
    expect(screen.getByText('20°')).toBeInTheDocument()
    expect(screen.getByText('30°')).toBeInTheDocument()
    expect(screen.getByText('25°')).toBeInTheDocument()
  })
})
