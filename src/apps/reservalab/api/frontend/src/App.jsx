import { useState, useEffect, lazy, Suspense } from 'react'
import { Toaster, toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
const FigmaReservas = lazy(() => import('./layouts/FigmaReservas'))
const InventarioView = lazy(() => import('./layouts/Inventario'))
const DashboardView = lazy(() => import('./layouts/Dashboard'))
const TabletsView = lazy(() => import('./layouts/Tablets'))
import { Navbar, ErrorBoundary, Loader } from './components'
import { Maximize, LayoutGrid, ClipboardList, HelpCircle } from 'lucide-react'
import useIsMobile from './hooks/useIsMobile'
import { getLabDisplayName } from './utils/labUtils'

const BG_STYLE = {
  backgroundImage: 'url(/bg_science.png)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
  backgroundColor: '#f0f4ff',
}

const BG_STYLE_MOBILE = {
  ...BG_STYLE,
  backgroundAttachment: 'scroll',
}

function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [telaCheia, setTelaCheia] = useState(false)
  const [statusAPI, setStatusAPI] = useState('checking')
  const [erro, setErro] = useState(null)
  const [activeTab, setActiveTab] = useState('reservas')
  const [minTimePassed, setMinTimePassed] = useState(false)
  const isMobile = useIsMobile()
  const [showPushBtn, setShowPushBtn] = useState(false)

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      setShowPushBtn(true)
    }
  }, [])

  const handleAtivarNotificacoes = async () => {
    if ('Notification' in window && Notification.permission === 'denied') {
      toast.error('Notificações bloqueadas. Para ativar, acesse as configurações do Safari/iOS para este site e permita as notificações.')
      return
    }
    if (window.registerPush) {
      try {
        await window.registerPush()
        if (Notification.permission === 'granted') {
          setShowPushBtn(false)
          toast.success('Notificações ativadas com sucesso!')
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  const verificarStatus = () => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setStatusAPI(data.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setStatusAPI('offline'))
  }

  useEffect(() => {
    verificarStatus()
    const statusInterval = setInterval(verificarStatus, 15000)
    return () => clearInterval(statusInterval)
  }, [])

  const toggleTelaCheia = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setTelaCheia(true)
    } else {
      document.exitFullscreen()
      setTelaCheia(false)
    }
  }

  const buscarDados = () => {
    setCarregando(true)
    setErro(null)
    fetch('/api/reservas')
      .then(res => {
        if (!res.ok) throw new Error('Erro na API')
        return res.json()
      })
      .then(data => {
        setData(data)
        setLoading(false)
        setCarregando(false)
        setStatusAPI('online')
      })
      .catch(err => {
        setErro('Não foi possível carregar os dados. Tente novamente.')
        setLoading(false)
        setCarregando(false)
        setStatusAPI('offline')
      })
  }

  useEffect(() => {
    buscarDados()
    const intervalo = setInterval(() => buscarDados(), 15000)
    return () => clearInterval(intervalo)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setMinTimePassed(true), 4000)
    return () => clearTimeout(t)
  }, [])

  const transformWeeklyData = () => {
    if (!data || !data.reservas_semana) return []
    
    const grouped = {}
    data.reservas_semana.forEach(r => {
      if (!grouped[r.data]) grouped[r.data] = []
      grouped[r.data].push(r)
    })
    
    return Object.entries(grouped).map(([date, reservas]) => {
      const [dia, mes, ano] = date.split('/').map(Number)
      const d = new Date(ano, mes - 1, dia)
      const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
      return {
        date,
        dayName: diasSemana[d.getDay()],
        reservations: reservas.map(r => ({
          lab: getLabDisplayName(r.lab) || r.lab,
          time: r.horario,
          subject: r.responsavel || r.observacao || 'Disciplina',
          professor: r.responsavel,
          reservaFeitaPor: r.reserva_feita_por,
          observacao: r.observacao
        }))
      }
    }).slice(0, 7)
  }

  return (
    <AnimatePresence mode="wait">
      {(loading || !data || !minTimePassed) ? (
        <Loader key="loader" />
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{ 
            position: 'relative', 
            minHeight: '100vh', 
            display: 'flex', 
            flexDirection: 'column', 
            backgroundImage: 'url(/bg_science.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: isMobile ? 'scroll' : 'fixed',
            backgroundColor: '#f0f4ff',
          }}>
      <Toaster position="top-center" richColors />
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(240, 244, 255, 0.3)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      
       {/* Navbar */}
       <Navbar 
         activeTab={activeTab} 
         setActiveTab={setActiveTab} 
         telaCheia={telaCheia} 
         setTelaCheia={setTelaCheia} 
         statusAPI={statusAPI}
         onNavigate={setActiveTab}
       />

      {/* Status da API */}
      <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', display: 'flex', alignItems: 'center', gap: '6px', zIndex: 100 }}>
        <span style={{ 
          width: '8px', height: '8px', borderRadius: '50%', 
          background: statusAPI === 'online' ? '#22c55e' : '#ef4444'
        }} />
      </div>

       {/* Conteúdo */}
       <div style={{ position: 'relative', flex: 1, paddingTop: isMobile ? '0' : '8rem', paddingBottom: isMobile ? '5rem' : '0' }}>
          <Suspense fallback={<Loader fullScreen={false} size={48} />}>
           {activeTab === 'dashboard' && (
             <ErrorBoundary fallback="Erro ao carregar Dashboard">
               <DashboardView data={data} onNavigate={setActiveTab} />
             </ErrorBoundary>
           )}
           {activeTab === 'reservas' && (
             <ErrorBoundary fallback="Erro ao carregar Reservas">
               <FigmaReservas 
                 data={data}
                 carregando={carregando}
                 onRefresh={buscarDados}
                 statusAPI={statusAPI}
                 telaCheia={telaCheia}
                 onToggleTelaCheia={toggleTelaCheia}
                 activeTab={activeTab}
                 onNavigate={setActiveTab}
               />
             </ErrorBoundary>
           )}
           {activeTab === 'inventario' && (
              <ErrorBoundary fallback="Erro ao carregar Inventário">
                <InventarioView onNavigate={setActiveTab} />
              </ErrorBoundary>
            )}
           {activeTab === 'tablets' && (
              <ErrorBoundary fallback="Erro ao carregar Tablets">
                <TabletsView />
              </ErrorBoundary>
            )}
         </Suspense>
       </div>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto', textAlign: 'center', padding: '16px',
        fontSize: '14px', color: '#6b7280',
        background: 'rgba(240, 244, 255, 0.8)',
        borderTop: '1px solid rgba(99, 102, 241, 0.2)',
      }}>
        Desenvolvido por{' '}
        <motion.a
          href="https://vihisantos.github.io/My.Portfolio/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500, display: 'inline-block' }}
          whileHover={{ scale: 1.05, textShadow: '0 0 8px rgba(99, 102, 241, 0.6)', transition: { duration: 0.2 } }}
          whileTap={{ scale: 0.95 }}
        >
          Capybara Holding
        </motion.a>
      </footer>

      {/* Push Notification Button */}
      {showPushBtn && (
        <motion.button
          onClick={handleAtivarNotificacoes}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            position: 'fixed', 
            bottom: isMobile ? 'calc(1.5rem + 120px)' : '4.5rem', 
            right: '1.5rem', 
            zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', 
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
            color: '#ffffff',
            border: 'none', borderRadius: '9999px', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600, 
            boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
          }}
        >
          🔔 Ativar Notificações
        </motion.button>
      )}

      {/* FAQ Button */}
      <button
        onClick={() => toast.info('FAQ em breve!')}
        style={{
          position: 'fixed', bottom: isMobile ? 'calc(1.5rem + 70px)' : '1.5rem', right: '1.5rem', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '10px 16px', background: '#0a0a0a', color: '#ffffff',
          border: 'none', borderRadius: '9999px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}
      >
        <HelpCircle size={16} /> FAQ
      </button>
    </motion.div>
      )}
    </AnimatePresence>
  )
}

export default App
