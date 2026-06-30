import { motion } from 'framer-motion'

export default function Loader({ fullScreen = true, size = 120 }) {
  if (!fullScreen) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: size > 80 ? '100vh' : 'auto', background: 'transparent'
      }}>
        <img
          src="/criacao-vini.svg"
          alt="Carregando..."
          style={{ width: size, height: size, display: 'block' }}
        />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', zIndex: 9999,
      }}
    >
      <div style={{
        width: '100dvw', height: '100dvh', position: 'relative',
      }}>
        <img
          src="/criacao-vini.svg"
          alt="Carregando..."
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block'
          }}
        />
      </div>
    </motion.div>
  )
}
