import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Cloud, CloudRain, CloudSun, Sun, CloudSnow, CloudLightning, CloudDrizzle } from 'lucide-react'

interface WeatherData {
  city: string
  temp: number
  description: string
  icon: number
}

const CITIES = [
  'Piracicaba,BR',
  'Campinas,BR',
  'Limeira,BR',
  'São Paulo,BR',
  'Americana,BR',
] as const

const CITY_LABELS: Record<string, string> = {
  'Piracicaba,BR': 'Piracicaba',
  'Campinas,BR': 'Campinas',
  'Limeira,BR': 'Limeira',
  'São Paulo,BR': 'São Paulo',
  'Americana,BR': 'Americana',
}

function weatherIcon(id: number) {
  if (id >= 200 && id < 300) return CloudLightning
  if (id >= 300 && id < 400) return CloudDrizzle
  if (id >= 500 && id < 600) return CloudRain
  if (id >= 600 && id < 700) return CloudSnow
  if (id >= 700 && id < 800) return Cloud
  if (id === 800) return Sun
  if (id === 801) return CloudSun
  return Cloud
}

function greeting(h: number) {
  if (h >= 5 && h < 12) return 'Bom dia, Campus!'
  if (h >= 12 && h < 18) return 'Boa tarde, Campus!'
  return 'Boa noite, Campus!'
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WeatherSlideProps {}

export function WeatherSlide(_props: WeatherSlideProps) {
  const [weathers, setWeathers] = useState<WeatherData[]>([])
  const [error, setError] = useState(false)
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY
    if (!apiKey) { setError(true); return }
    let cancelled = false

    const fetchAll = async () => {
      try {
        const results = await Promise.all(
          CITIES.map(async (city) => {
            const res = await fetch(
              `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=pt&appid=${apiKey}`
            )
            if (!res.ok) throw new Error()
            const data = await res.json()
            return {
              city,
              temp: Math.round(data.main.temp),
              description: data.weather[0].description,
              icon: data.weather[0].id,
            }
          })
        )
        if (!cancelled) setWeathers(results)
      } catch {
        if (!cancelled) setError(true)
      }
    }

    fetchAll()
    const timer = setInterval(fetchAll, 300000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  if (error || weathers.length === 0) return null

  const main = weathers[0]
  const others = weathers.slice(1)
  const MainIcon = weatherIcon(main.icon)

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, #1e293b 0%, #080a14 100%)',
      padding: '2rem',
    }}>
      {/* Saudação */}
      <motion.span
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        style={{
          fontSize: 'clamp(1.8rem, 3.5vw, 3.5rem)',
          fontWeight: 800,
          color: '#f1f5f9',
          textShadow: '0 0 40px rgba(129,140,248,0.4), 0 0 80px rgba(99,102,241,0.15)',
          letterSpacing: '-0.02em',
          marginBottom: '1rem',
        }}
      >
        {greeting(clock.getHours())}
      </motion.span>

      {/* Cidade principal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        style={{
          display: 'flex', alignItems: 'center', gap: '2rem',
          marginBottom: '2rem',
        }}
      >
        <MainIcon
          size={100}
          strokeWidth={1.5}
          style={{
            color: '#818cf8',
            filter: 'drop-shadow(0 0 30px rgba(129,140,248,0.5))',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{
            fontSize: 'clamp(4rem, 10vw, 8rem)',
            fontWeight: 700, lineHeight: 1,
            color: '#f1f5f9',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.04em',
          }}>
            {main.temp}°
          </span>
          <span style={{
            fontSize: 'clamp(1rem, 1.8vw, 1.5rem)',
            color: '#94a3b8', textTransform: 'capitalize', fontWeight: 500,
          }}>
            {main.description}
          </span>
        </div>
      </motion.div>

      {/* Outras cidades */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        style={{
          display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {others.map((w, i) => {
          const Icon = weatherIcon(w.icon)
          return (
            <motion.div
              key={w.city}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '0.4rem',
                padding: '1rem 1.5rem',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '1rem',
                minWidth: '140px',
              }}
            >
              <Icon size={28} strokeWidth={1.5} style={{ color: '#818cf8', opacity: 0.8 }} />
              <span style={{
                fontSize: '1.8rem', fontWeight: 700,
                color: '#f1f5f9', fontVariantNumeric: 'tabular-nums',
              }}>
                {w.temp}°
              </span>
              <span style={{
                fontSize: '0.85rem', color: '#64748b',
                textTransform: 'capitalize',
              }}>
                {w.description}
              </span>
              <span style={{
                fontSize: '0.75rem', color: '#475569',
                fontWeight: 600, letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                {CITY_LABELS[w.city] || w.city}
              </span>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Label */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        style={{
          fontSize: '0.85rem', color: '#334155',
          marginTop: '1.5rem',
          letterSpacing: '0.1em',
        }}
      >
        REGIÃO DE PIRACICABA
      </motion.span>
    </div>
  )
}
