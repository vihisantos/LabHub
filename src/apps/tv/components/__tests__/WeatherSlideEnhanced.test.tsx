import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { WeatherSlideEnhanced } from '../WeatherSlideEnhanced'
import { listLocalMedia } from '../../services/localProgramming'

vi.mock('../../services/localProgramming', () => ({
  listLocalMedia: vi.fn(async () => []),
  toLocalUrl: (path: string) => path,
}))

interface CurrentOverrides {
  temperature_2m?: number
  relative_humidity_2m?: number
  apparent_temperature?: number
  is_day?: number
  weather_code?: number
  wind_speed_10m?: number
  wind_direction_10m?: number
}

function mockWeather(current: CurrentOverrides = {}, daily: Record<string, unknown> = {}) {
  const payload = {
    current: {
      temperature_2m: 25.5,
      relative_humidity_2m: 62,
      apparent_temperature: 27.1,
      is_day: 1,
      weather_code: 0,
      wind_speed_10m: 12.3,
      wind_direction_10m: 180,
      ...current,
    },
    daily: { temperature_2m_min: [18.2], temperature_2m_max: [29.7], ...daily },
  }

  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(payload),
  } as Response)
}

describe('WeatherSlideEnhanced', () => {
  beforeEach(() => {
    // O setup global liga fake timers; `waitFor` precisa de timers reais.
    vi.useRealTimers()
    // O cache vive no localStorage e sobrevive entre testes do mesmo arquivo.
    localStorage.clear()
    vi.mocked(listLocalMedia).mockReset()
    vi.mocked(listLocalMedia).mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exibe loading enquanto busca dados', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<WeatherSlideEnhanced />)

    expect(screen.getByText('Carregando clima…')).toBeInTheDocument()
  })

  it('mostra fallback quando a API falha', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(screen.getByText(/Dados climáticos indisponíveis/)).toBeInTheDocument()
    })
  })

  it('sem internet, usa cache expirado e não trava o slide', async () => {
    localStorage.setItem('tv_weather_cache', JSON.stringify({
      timestamp: Date.now() - (11 * 60 * 1000),
      data: {
        city: 'Piracicaba',
        temp: 21,
        feelsLike: 20,
        humidity: 55,
        windSpeed: 5,
        windDirection: 90,
        description: 'Céu claro',
        weatherCode: 0,
        isDay: false,
        tempMin: 15,
        tempMax: 25,
        updatedAt: Date.now() - (11 * 60 * 1000),
      },
    }))
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    render(<WeatherSlideEnhanced />)

    await waitFor(() => expect(screen.queryByText('Carregando clima…')).toBeNull())
    expect(await screen.findByText('Piracicaba')).toBeInTheDocument()
    expect(screen.getByText('21°')).toBeInTheDocument()
    expect(screen.queryByText(/Dados climáticos indisponíveis/)).not.toBeInTheDocument()
  })

  it('exibe nome da cidade (Piracicaba)', async () => {
    mockWeather()

    render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(screen.getByText('Piracicaba')).toBeInTheDocument()
    })
  })

  it('exibe temperatura arredondada', async () => {
    mockWeather({ temperature_2m: 27.8 })

    render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(screen.getByText('28°')).toBeInTheDocument()
    })
  })

  it('busca os dados uma única vez por ciclo (sem loop de refetch)', async () => {
    const fetchSpy = mockWeather()

    render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(screen.getByText('Piracicaba')).toBeInTheDocument()
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('mostra mín/máx, vento com direção e umidade reais', async () => {
    mockWeather()

    render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(screen.getByText('18° / 30°')).toBeInTheDocument()
    })
    expect(screen.getByText('12 km/h · S')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(screen.getByText('Sensação de 27°')).toBeInTheDocument()
  })

  it('distingue dia e noite no background', async () => {
    mockWeather({ is_day: 0 })

    const { container } = render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(screen.getByText('Piracicaba')).toBeInTheDocument()
    })

    // Fundo noturno em vez do fundo diurno
    expect(container.firstElementChild?.getAttribute('style')).toMatch(/rgb\(11, 18, 32\)|rgb\(15, 32, 39\)/)
  })

  it('destaca tempestades com descrição de alerta', async () => {
    mockWeather({ weather_code: 95 })

    render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(screen.getByText('Temporal com trovoadas')).toBeInTheDocument()
    })
  })

  it('classifica weather codes corretamente (WMO official)', async () => {
    const testCases = [
      { code: 0, description: 'Céu claro' },
      { code: 1, description: 'Poucas nuvens' },
      { code: 3, description: 'Nublado' },
      { code: 45, description: 'Nevoeiro' },
      { code: 51, description: 'Garoa leve' },
      { code: 61, description: 'Chuva leve' },
      { code: 65, description: 'Chuva forte' },
      { code: 80, description: 'Pancadas de chuva' },
      { code: 71, description: 'Neve leve' },
      { code: 95, description: 'Temporal com trovoadas' },
    ]

    for (const testCase of testCases) {
      localStorage.clear()
      mockWeather({ weather_code: testCase.code })

      const { unmount } = render(<WeatherSlideEnhanced />)

      await waitFor(() => {
        expect(screen.getByText(testCase.description)).toBeInTheDocument()
      })

      unmount()
      vi.restoreAllMocks()
    }
  })

  it('usa o vídeo da pasta Clima e o ícone Meteocons da condição', async () => {
    vi.mocked(listLocalMedia).mockResolvedValue([{
      name: 'chuva.mp4',
      path: 'G:\\Meu Drive\\LabHub -TV\\Clima\\chuva.mp4',
      relativePath: 'Clima/chuva.mp4',
      fileType: 'video',
      size: 1024,
    }])
    mockWeather({ weather_code: 61 })

    const { container } = render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'G:\\Meu Drive\\LabHub -TV\\Clima\\chuva.mp4')
    })
    expect(container.querySelector('video')).toHaveAttribute('loop')
    expect(container.querySelector('img')?.getAttribute('src')).toContain('meteocons/rain.svg')
    expect(screen.getByAltText('Chuva leve')).toBeInTheDocument()
  })

  it('seleciona a variante noturna quando is_day é zero', async () => {
    vi.mocked(listLocalMedia).mockResolvedValue([{
      name: 'ensolarado-noite.mp4',
      path: 'G:\\Meu Drive\\LabHub -TV\\Clima\\ensolarado-noite.mp4',
      relativePath: 'Clima/ensolarado-noite.mp4',
      fileType: 'video',
      size: 1024,
    }])
    mockWeather({ weather_code: 0, is_day: 0 })

    const { container } = render(<WeatherSlideEnhanced />)

    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute('src', 'G:\\Meu Drive\\LabHub -TV\\Clima\\ensolarado-noite.mp4')
    })
    expect(container.querySelector('img')?.getAttribute('src')).toContain('meteocons/clear-night.svg')
  })

  it('exibe a probabilidade de chuva como previsão', async () => {
    mockWeather({ weather_code: 3 }, { precipitation_probability_max: [72] })

    render(<WeatherSlideEnhanced />)

    expect(await screen.findByText('Previsão de chuva · 72%')).toBeInTheDocument()
  })

  it('identifica dados de cache antigos como desatualizados', async () => {
    localStorage.setItem('tv_weather_cache', JSON.stringify({
      timestamp: Date.now() - (16 * 60 * 1000),
      data: {
        city: 'Piracicaba',
        temp: 21,
        windSpeed: 5,
        windDirection: 90,
        description: 'Céu claro',
        weatherCode: 0,
        isDay: true,
        updatedAt: Date.now() - (16 * 60 * 1000),
      },
    }))
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    render(<WeatherSlideEnhanced />)

    expect(await screen.findByText(/Dados desatualizados/)).toBeInTheDocument()
  })
})
