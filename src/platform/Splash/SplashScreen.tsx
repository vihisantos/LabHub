import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { accentColor } from '../../core/theme/constants'
import { themeStore } from '../../core/theme/store'

interface SplashScreenProps {
  ready: boolean
  onDone: () => void
}

export function SplashScreen({ ready, onDone }: SplashScreenProps) {
  const [accent] = useState(() => accentColor(themeStore.getState().accent))
  const [minElapsed, setMinElapsed] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!ready || !minElapsed) return
    const t = setTimeout(() => setFading(true), 120)
    return () => clearTimeout(t)
  }, [ready, minElapsed])

  useEffect(() => {
    if (!fading) return
    const t = setTimeout(onDone, 500)
    return () => clearTimeout(t)
  }, [fading, onDone])

  return (
    <AnimatePresence>
      {!fading && (
        <motion.div
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-surface"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          <div className="relative">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: `0 0 0 0 ${accent}40` }}
              animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.img
              src="/logo-192.png"
              alt="LabHub"
              className="h-20 w-20 rounded-3xl"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            />
          </div>
          <motion.p
            className="mt-5 text-lg font-semibold tracking-wide text-fg"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            LabHub
          </motion.p>
          <div className="mt-4 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: accent }}
                animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
