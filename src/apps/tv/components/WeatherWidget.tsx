import { useState, useEffect } from 'react'
import { Cloud, CloudRain, CloudSun, Sun, CloudSnow, CloudLightning, CloudDrizzle } from 'lucide-react'

interface WeatherData {
  temp: number
  description: string
  icon: number
}

const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY
const CITY = import.meta.env.VITE_OPENWEATHER_CITY || 'Brasília,BR'

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

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!API_KEY) { setError(true); return }
    let cancelled = false
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&units=metric&lang=pt&appid=${API_KEY}`
        )
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) {
          setWeather({
            temp: Math.round(data.main.temp),
            description: data.weather[0].description,
            icon: data.weather[0].id,
          })
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    fetchWeather()
    const timer = setInterval(fetchWeather, 300000) // 5 min
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  if (error || !weather) return null

  const Icon = weatherIcon(weather.icon)

  return (
    <div style={{
      position: 'fixed', top: '2.5rem', right: '4rem', zIndex: 10,
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      color: '#94a3b8',
    }}>
      <Icon size={22} style={{ opacity: 0.7 }} />
      <span style={{ fontSize: '1.5rem', fontWeight: 600, color: '#cbd5e1' }}>
        {weather.temp}°
      </span>
      <span style={{ fontSize: '0.75rem', textTransform: 'capitalize', opacity: 0.6, maxWidth: '100px' }}>
        {weather.description}
      </span>
    </div>
  )
}
