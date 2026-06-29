import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { icons } from '../../../lib/icons'

export function RedirectToStock() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/stock/items', { replace: true })
    }, 1800)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      <div className="text-center">
        <p className="text-sm font-medium text-fg">Redirecionando para o Estoque...</p>
        <p className="mt-1 text-xs text-fg-muted">Novos PCs devem ser cadastrados pelo app Estoque</p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/stock/items', { replace: true })}
        className="mt-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
      >
        Ir agora
      </button>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-xs text-fg-dim hover:text-fg"
      >
        Voltar
      </button>
    </div>
  )
}
