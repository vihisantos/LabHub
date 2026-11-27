import { useState, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { CloudSun, Wind, Thermometer, Droplets } from 'lucide-react'
import { listLocalMedia, toLocalUrl, type LocalMediaFile } from '../services/localProgramming'
import {
  discoverWeatherVideos,
  WEATHER_CODE_DESCRIPTIONS,
  weatherVisual,
  type WeatherVideoKey,
} from '../services/weatherPresentation'

/**
 * Coordenadas de Piracicaba, SP, Brasil (Open-Meteo)
 */
const CITY = {
  name: 'Piracicaba,BR',
  label: 'Piracicaba',
  lat: -22.7253,
  lon: -47.6492,
}

/**
 * Fuso do campus — o slide mostra dados de Piracicaba sempre em America/Sao_Paulo,
 * independente da configuração de fuso do Windows da TV.
 */
const TV_TIME_ZONE = 'America/Sao_Paulo'

interface WeatherData {
  city: string
  temp: number
  feelsLike?: number
  humidity?: number
  windSpeed: number
  windDirection: number
  description: string
  weatherCode: number
  isDay: boolean
  tempMin?: number
  tempMax?: number
  /** Probabilidade máxima de precipitação do dia (open-meteo `daily`). */
  rainProbability?: number
  /** Momento da última leitura bem-sucedida da API. */
  updatedAt?: number
}

const CACHE_KEY = 'tv_weather_cache'
/** Atualização dos dados a cada 15 minutos (também usada para identificar cache velho). */
const CACHE_DURATION_MS = 15 * 60 * 1000

const CARDINALS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO']

function cardinal(degrees: number): string {
  return CARDINALS[Math.round(((degrees % 360) / 45)) % 8]
}

function formatUpdatedAt(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TV_TIME_ZONE,
  })
}

function isStale(data: WeatherData): boolean {
  return !data.updatedAt || Date.now() - data.updatedAt >= CACHE_DURATION_MS
}

/**
 * Weather Slide 2.0 — clima em tela cheia com vídeo local da pasta `Clima/` do
 * Drive, ícones animados Meteocons (MIT) e dados da Open-Meteo.
 *
 * O vídeo nunca entra no rodízio acadêmico: os caminhos vêm de um filtro
 * exclusivo da pasta `Clima/`, relidos a cada exibição do slide. Sem vídeo
 * disponível, o fundo neutro animado continua legível na TV.
 *
 * Duração e frequência são controladas pelo TvDisplay (15s, a cada 8
 * conteúdos); este componente apenas busca dados a cada 15 min.
 */
export function WeatherSlideEnhanced() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weatherVideos, setWeatherVideos] = useState<Partial<Record<WeatherVideoKey, string>>>({})
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Cada montagem relê o Drive: trocas de vídeo não ficam presas em cache.
    void listLocalMedia()
      .then((files: LocalMediaFile[]) => {
        if (!cancelled) setWeatherVideos(discoverWeatherVideos(files))
      })
      .catch(() => { if (!cancelled) setWeatherVideos({}) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    // Cache primeiro: pinta o slide na hora e só depois busca dados novos.
    const cached = getFromLocalStorage()
    if (cached) {
      setWeather(cached)
      setLoading(false)
    }

    const fetchWeather = async () => {
      controller?.abort()
      controller = new AbortController()
      const timeout = setTimeout(function() { controller?.abort() }, 5000)
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${CITY.lat}&longitude=${CITY.lon}` +
          '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m' +
          '&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max&timezone=America%2FSao_Paulo' +
          '&wind_speed_unit=kmh&temperature_unit=celsius&precipitation_unit=mm&forecast_days=1',
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('API error')
        const data = await response.json()

        // Aceita o formato `current` (atual) e `current_weather` (legado/cache antigo).
        const current = data.current ?? data.current_weather
        const temperature = current?.temperature_2m ?? current?.temperature
        if (temperature == null) throw new Error('No weather data')

        const code: number = current.weather_code ?? current.weathercode
        const weatherData: WeatherData = {
          city: CITY.label,
          temp: Math.round(temperature),
          feelsLike: current.apparent_temperature != null
            ? Math.round(current.apparent_temperature)
            : undefined,
          humidity: current.relative_humidity_2m != null ? Math.round(current.relative_humidity_2m) : undefined,
          windSpeed: Math.round(current.wind_speed_10m ?? current.windspeed ?? 0),
          windDirection: current.wind_direction_10m ?? current.winddirection ?? 0,
          description: WEATHER_CODE_DESCRIPTIONS[code]?.description ?? 'Condição indisponível',
          weatherCode: code,
          isDay: (current.is_day ?? 1) === 1,
          tempMin: data.daily?.temperature_2m_min?.[0] != null ? Math.round(data.daily.temperature_2m_min[0]) : undefined,
          tempMax: data.daily?.temperature_2m_max?.[0] != null ? Math.round(data.daily.temperature_2m_max[0]) : undefined,
          rainProbability: data.daily?.precipitation_probability_max?.[0] != null
            ? Math.round(data.daily.precipitation_probability_max[0])
            : undefined,
          updatedAt: Date.now(),
        }

        if (cancelled) return
        setWeather(weatherData)
        setLoading(false)
        setError(null)
        saveToLocalStorage(weatherData)
      } catch {
        if (cancelled) return
        // Offline: um cache expirado é melhor que nenhum dado climático.
        const fallback = getFromLocalStorage(Number.MAX_SAFE_INTEGER) ?? weather
        if (fallback) {
          setWeather(fallback)
          setError(null)
        } else {
          setError('Dados climáticos indisponíveis')
        }
        setLoading(false)
      } finally {
        clearTimeout(timeout)
      }
    }

    void fetchWeather()
    const timer = setInterval(() => { void fetchWeather() }, CACHE_DURATION_MS)
    return () => { cancelled = true; controller?.abort(); clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez no mount; o cache é lido dentro do efeito
  }, [])

  const visual = weather
    ? weatherVisual(weather.weatherCode, weather.isDay)
    : weatherVisual(0, true)
  const videoKey = visual.videoKey
  const videoPath = videoKey && !videoFailed ? weatherVideos[videoKey] : undefined
  const videoSrc = videoPath ? toLocalUrl(videoPath) : null
  const stale = weather ? isStale(weather) : false

  // Uma mídia quebrada não inibe a próxima condição/vídeo trocado no Drive.
  useEffect(function() { setVideoFailed(false) }, [videoKey, weatherVideos])

  return (
    <SlideShell
      isDay={weather?.isDay ?? true}
      badge="Clima agora"
      videoSrc={videoSrc}
      onVideoError={() => setVideoFailed(true)}
    >
      <style>{WEATHER_ANIMATIONS}</style>
      <main className="labhub-weather-main" style={styles.main}>
        <div style={styles.iconTile}>
          <img
            className="labhub-weather-icon"
            src={`${import.meta.env.BASE_URL}meteocons/${visual.icon}`}
            alt={weather ? visual.description : 'Condição meteorológica'}
            style={styles.icon}
          />
          {weather && (
            <span style={visual.category === 'storm' ? styles.conditionStorm : styles.condition}>
              {visual.description}
            </span>
          )}
          {loading && !weather && <span style={styles.loadingText}>Carregando clima…</span>}
          {!loading && !weather && (
            <span style={styles.description}>{error ?? 'Dados climáticos indisponíveis'}</span>
          )}
        </div>

        <div style={styles.readout}>
          <div style={styles.cityRow}>
            <span style={styles.city}>{CITY.label}</span>
            <span style={styles.region}>SP · Brasil</span>
          </div>

          <div style={styles.tempRow}>
            <span style={styles.temp}>{weather ? `${weather.temp}°` : '--°'}</span>
            {weather && <span style={styles.tempUnit}>C</span>}
          </div>

          {weather?.feelsLike != null && (
            <span style={styles.feelsLike}>Sensação de {weather.feelsLike}°</span>
          )}

          <div style={styles.chips}>
            {weather?.tempMin != null && weather.tempMax != null && (
              <div style={styles.chip}>
                <Thermometer size={20} style={styles.chipIcon} />
                <span>{weather.tempMin}° / {weather.tempMax}°</span>
              </div>
            )}
            {weather && (
              <div style={styles.chip}>
                <Wind size={20} style={styles.chipIcon} />
                <span>{weather.windSpeed} km/h · {cardinal(weather.windDirection)}</span>
              </div>
            )}
            {weather?.humidity != null && (
              <div style={styles.chip}>
                <Droplets size={20} style={styles.chipIcon} />
                <span>{weather.humidity}%</span>
              </div>
            )}
            {weather?.rainProbability != null && (
              <div style={styles.chip}>
                <span style={styles.chipIcon}>☂</span>
                <span>Previsão de chuva · {weather.rainProbability}%</span>
              </div>
            )}
          </div>
        </div>
      </main>

      <SlideFooter
        right={
          !weather
            ? 'Sem conexão com a API'
            : stale
              ? `Dados desatualizados${weather.updatedAt ? ` · ${formatUpdatedAt(weather.updatedAt)}` : ''}`
              : weather.updatedAt
                ? `Atualizado às ${formatUpdatedAt(weather.updatedAt)}`
                : '—'
        }
      />
    </SlideShell>
  )
}

/**
 * Esqueleto compartilhado com o ClockSlide: fundo, header e faixas.
 * O vídeo fica abaixo do conteúdo, com máscara escura para legibilidade.
 */
function SlideShell({
  isDay,
  badge,
  videoSrc,
  onVideoError,
  children,
}: {
  isDay: boolean
  badge: string
  videoSrc: string | null
  onVideoError?: () => void
  children: ReactNode
}) {
  return (
    <div style={{ ...styles.container, background: isDay ? DAY_BG : NIGHT_BG }}>
      {videoSrc && (
        <video
          className="labhub-weather-video"
          key={videoSrc}
          src={videoSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onError={onVideoError}
        />
      )}
      <div style={styles.videoScrim} />
      <div className="labhub-weather-orb-a" style={styles.glowA} />
      <div className="labhub-weather-orb-b" style={styles.glowB} />
      <div style={styles.hairline} />

      <header style={styles.header}>
        <div style={styles.badge}>
          <CloudSun size={20} strokeWidth={2.2} />
          <span>{badge}</span>
        </div>
        <div style={styles.brandRow}>
          <span style={styles.brandMark} />
          <span style={styles.brand}>LabHub TV</span>
        </div>
      </header>

      {children}
    </div>
  )
}

function SlideFooter({ right }: { right: string }) {
  return (
    <>
      <div style={styles.divider} />
      <footer style={styles.footer}>
        <span>Piracicaba · SP</span>
        <span>{right}</span>
      </footer>
    </>
  )
}

const DAY_BG = 'linear-gradient(135deg, #0f2027 0%, #1d3a4a 45%, #244b52 100%)'
const NIGHT_BG = 'linear-gradient(135deg, #0b1220 0%, #152238 45%, #1c2a40 100%)'

/** Animações só de transform/opacity: baratas mesmo em TVs com GPU modesta. */
const WEATHER_ANIMATIONS = `
.labhub-weather-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.82; animation: labhub-weather-fade 900ms ease-out both; }
.labhub-weather-main { animation: labhub-weather-rise 650ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.labhub-weather-orb-a { animation: labhub-weather-drift-a 18s ease-in-out infinite alternate; }
.labhub-weather-orb-b { animation: labhub-weather-drift-b 22s ease-in-out infinite alternate; }
.labhub-weather-icon { width: 100%; height: 100%; object-fit: contain; animation: labhub-weather-float 6s ease-in-out infinite; filter: drop-shadow(0 18px 32px rgba(0,0,0,0.28)); }
@keyframes labhub-weather-fade { from { opacity: 0; } to { opacity: 0.82; } }
@keyframes labhub-weather-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes labhub-weather-drift-a { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(3rem,2rem,0) scale(1.08); } }
@keyframes labhub-weather-drift-b { from { transform: translate3d(0,0,0) scale(1.04); } to { transform: translate3d(-2rem,-3rem,0) scale(0.96); } }
@keyframes labhub-weather-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@media (prefers-reduced-motion: reduce) {
  .labhub-weather-video, .labhub-weather-main, .labhub-weather-orb-a, .labhub-weather-orb-b, .labhub-weather-icon { animation: none; }
}
`

function saveToLocalStorage(data: WeatherData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }))
  } catch { /* cache é opcional */ }
}

function getFromLocalStorage(maxAgeMs: number = CACHE_DURATION_MS): WeatherData | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (typeof parsed?.timestamp === 'number' && Date.now() - parsed.timestamp < maxAgeMs) {
        return parsed.data as WeatherData
      }
    }
  } catch { /* cache corrompido: ignora */ }
  return null
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 'clamp(1.75rem, 4vh, 3rem) clamp(2rem, 5vw, 4.5rem)',
    boxSizing: 'border-box',
    overflow: 'hidden',
    color: '#f8fafc',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
  },
  videoScrim: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(90deg, rgba(7,14,24,0.88) 0%, rgba(7,14,24,0.62) 52%, rgba(7,14,24,0.28) 100%)',
    pointerEvents: 'none',
  },
  glowA: {
    position: 'absolute',
    width: '44rem',
    height: '44rem',
    borderRadius: '9999px',
    background: 'radial-gradient(circle, rgba(56, 189, 248, 0.18) 0%, transparent 70%)',
    top: '-18rem',
    left: '-12rem',
    pointerEvents: 'none',
  },
  glowB: {
    position: 'absolute',
    width: '38rem',
    height: '38rem',
    borderRadius: '9999px',
    background: 'radial-gradient(circle, rgba(45, 212, 191, 0.14) 0%, transparent 70%)',
    bottom: '-14rem',
    right: '-10rem',
    pointerEvents: 'none',
  },
  hairline: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: 4,
    background: 'linear-gradient(90deg, #38bdf8 0%, #2dd4bf 45%, #818cf8 75%, transparent 100%)',
    opacity: 0.9,
  },
  header: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    zIndex: 1,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.55rem',
    padding: '0.5rem 1.05rem',
    borderRadius: 9999,
    background: 'rgba(255, 255, 255, 0.12)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#e0f2fe',
    fontSize: 'clamp(0.95rem, 1.15vw, 1.15rem)',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  brandRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  brandMark: {
    width: 10,
    height: 10,
    borderRadius: 9999,
    background: 'linear-gradient(135deg, #2dd4bf, #818cf8)',
  },
  brand: {
    fontSize: 'clamp(0.85rem, 1vw, 1rem)',
    fontWeight: 700,
    color: 'rgba(226, 232, 240, 0.7)',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  main: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(2rem, 5vw, 4.5rem)',
    minHeight: 0,
    zIndex: 1,
  },
  iconTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    width: 'clamp(190px, 20vw, 280px)',
    height: 'clamp(190px, 20vw, 280px)',
    padding: 'clamp(1rem, 1.5vw, 1.5rem)',
    boxSizing: 'border-box',
    borderRadius: 'clamp(28px, 3vw, 40px)',
    background: 'rgba(255, 255, 255, 0.10)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    boxShadow: '0 22px 55px rgba(0, 0, 0, 0.18)',
  },
  icon: {
    display: 'block',
    width: '72%',
    height: '72%',
  },
  condition: {
    fontSize: 'clamp(1.05rem, 1.5vw, 1.45rem)',
    fontWeight: 600,
    color: '#e2e8f0',
    textAlign: 'center',
  },
  conditionStorm: {
    fontSize: 'clamp(1.05rem, 1.5vw, 1.45rem)',
    fontWeight: 700,
    color: '#fca5a5',
    textAlign: 'center',
  },
  readout: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 'clamp(0.35rem, 1vh, 0.7rem)',
    minWidth: 0,
  },
  cityRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  city: {
    fontSize: 'clamp(1.7rem, 2.8vw, 2.6rem)',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-0.01em',
  },
  region: {
    fontSize: 'clamp(0.95rem, 1.2vw, 1.2rem)',
    fontWeight: 600,
    color: 'rgba(226, 232, 240, 0.7)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  tempRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.25rem',
  },
  temp: {
    fontSize: 'clamp(5rem, 11vw, 10rem)',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 0.9,
    color: '#ffffff',
    letterSpacing: '-0.05em',
    textShadow: '0 18px 45px rgba(0, 0, 0, 0.28)',
  },
  tempUnit: {
    fontSize: 'clamp(1.6rem, 3vw, 2.75rem)',
    fontWeight: 700,
    color: 'rgba(226, 232, 240, 0.8)',
    marginTop: 'clamp(0.4rem, 2vw, 1.2rem)',
  },
  feelsLike: {
    fontSize: 'clamp(1rem, 1.3vw, 1.25rem)',
    fontWeight: 500,
    color: 'rgba(226, 232, 240, 0.85)',
  },
  description: {
    fontSize: 'clamp(1.1rem, 1.6vw, 1.5rem)',
    color: '#e2e8f0',
    fontWeight: 500,
  },
  loadingText: {
    fontSize: 'clamp(1.2rem, 1.8vw, 1.6rem)',
    color: '#e2e8f0',
    fontWeight: 500,
  },
  chips: {
    display: 'flex',
    gap: '0.65rem',
    flexWrap: 'wrap',
    marginTop: 'clamp(0.35rem, 1.2vh, 0.8rem)',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.55rem 1rem',
    borderRadius: 9999,
    background: 'rgba(255, 255, 255, 0.12)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#f1f5f9',
    fontSize: 'clamp(0.95rem, 1.15vw, 1.15rem)',
    fontWeight: 600,
  },
  chipIcon: {
    color: '#7dd3fc',
  },
  divider: {
    position: 'relative',
    height: 1,
    width: '100%',
    background: 'rgba(255, 255, 255, 0.18)',
    marginBottom: 'clamp(0.75rem, 1.6vh, 1.25rem)',
    zIndex: 1,
  },
  footer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
    color: 'rgba(226, 232, 240, 0.75)',
    fontSize: 'clamp(0.85rem, 1vw, 1rem)',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    zIndex: 1,
  },
}
