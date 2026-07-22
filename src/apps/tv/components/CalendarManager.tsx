import { useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar as CalendarIcon, Link as LinkIcon, Sparkles, RefreshCw, Trash2, CheckCircle2, AlertCircle, FileText } from 'lucide-react'
import { useAcademicCalendar } from '../hooks/useAcademicCalendar'

export function CalendarManager() {
  const { calendarCache, calendarTvEvents, loading, extracting, error, extract, clear } = useAcademicCalendar()

  const [pdfUrl, setPdfUrl] = useState('https://estaticos.animaeducacao.com.br/medias/20260707155348/Calendario_2026_Medicina_UAM_PIRACICABA_2026_07-07-2026.pdf')
  const [semesterCode, setSemesterCode] = useState('26/2')
  const [endDate, setEndDate] = useState('2026-12-18')
  const [searchTerm, setSearchTerm] = useState('')

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pdfUrl.trim()) return
    try {
      await extract(pdfUrl.trim(), semesterCode, endDate)
    } catch {
      // erro já capturado no hook
    }
  }

  const filteredEvents = calendarTvEvents.filter(ev =>
    ev.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ev.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-500/30">
            <CalendarIcon size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-slate-800">Calendário Acadêmico Institucional</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              O sistema lê o PDF do calendário uma única vez por semestre, armazena no cache e exibe os eventos automaticamente na TV.
              Os dados <strong>expiram e são limpos automaticamente</strong> à meia-noite da data final do semestre (ex: 18/12 para o semestre 26/2).
            </p>
          </div>
        </div>
      </div>

      {/* Form Extraction */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="mb-4 text-sm font-bold text-slate-800 flex items-center gap-2">
          <Sparkles size={16} className="text-violet-600" />
          {calendarCache ? 'Atualizar ou Trocar Calendário' : 'Importar Calendário Acadêmico'}
        </h4>

        <form onSubmit={handleExtract} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Link do PDF do Calendário
            </label>
            <div className="relative">
              <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                required
                placeholder="https://estaticos.animaeducacao.com.br/medias/..."
                value={pdfUrl}
                onChange={e => setPdfUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-900 outline-none transition-colors focus:border-violet-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Código do Semestre</label>
              <input
                type="text"
                placeholder="Ex: 26/2 ou 27/1"
                value={semesterCode}
                onChange={e => setSemesterCode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Término do Semestre (Expiração)</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 focus:bg-white [color-scheme:light]"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={extracting || !pdfUrl.trim()}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-violet-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:bg-violet-500 active:scale-[0.98] disabled:opacity-50"
          >
            {extracting ? (
              <>
                <RefreshCw size={14} className="animate-spin" /> Extraindo eventos do PDF...
              </>
            ) : (
              <>
                <FileText size={14} /> Extrair e Salvar no Cache do Semestre
              </>
            )}
          </button>
        </form>
      </div>

      {/* Active Cache Status */}
      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
      ) : calendarCache ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-800">Semestre {calendarCache.semester_code} Ativo</h4>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">EM CACHE</span>
                </div>
                <p className="text-xs text-slate-500">
                  Expira em: <strong>{new Date(calendarCache.expires_at).toLocaleString('pt-BR')}</strong> (Limpeza Automática)
                </p>
              </div>
            </div>

            <button
              onClick={clear}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
            >
              <Trash2 size={13} /> Limpar Cache
            </button>
          </div>

          {/* Events Count & Search */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600">
              {calendarTvEvents.length} eventos extraídos do calendário
            </span>
            <input
              type="text"
              placeholder="Buscar no calendário..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-800 outline-none focus:border-violet-500"
            />
          </div>

          {/* Events List Preview */}
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {filteredEvents.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Nenhum evento encontrado para a busca</p>
            ) : (
              filteredEvents.map((ev, idx) => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5 hover:bg-slate-100/70"
                >
                  <img src={ev.image_url!} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">{ev.title}</p>
                    <p className="truncate text-[11px] text-slate-500">{ev.description}</p>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-400">
          Nenhum calendário acadêmico salvo no cache para este semestre.
        </div>
      )}
    </div>
  )
}
