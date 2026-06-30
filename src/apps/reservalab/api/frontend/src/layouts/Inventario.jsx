import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { BarChart3, ArrowLeft, Package, Tag, MapPin, Search, X } from 'lucide-react'
import { ItemModal, Loader } from '../components'
import useIsMobile from '../hooks/useIsMobile'

export default function InventarioView({ onNavigate }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('Consultórios CIS med')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [activeFilter, setActiveFilter] = useState('Todas')

  const buscarDados = (aba = 'Consultórios CIS med') => {
    setLoading(true)
    setError(null)
    setActiveFilter('Todas')  // Reset filtro ao trocar de aba
    const url = `/api/inventario?aba=${encodeURIComponent(aba)}`
    
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setData(data)
          if (data.aba) setAbaAtiva(data.aba)
        }
        setLoading(false)
      })
      .catch(err => {
        setError('Erro ao carregar inventário')
        setLoading(false)
      })
  }

  useEffect(() => {
    buscarDados()
  }, [])

  // ✅ Hooks ANTES de qualquer return antecipado (regra do React)
  const abas = data?.abas_disponiveis || []
  
  const filteredItems = useMemo(() => {
    if (!data?.itens) return []
    let items = data.itens
    
    // Filtro por aba específica (se aplicável)
    if (abaAtiva && abaAtiva !== 'Todas') {
      items = items.filter(item => item.aba === abaAtiva)
    }
    
  // Filtro por categoria/local (apenas para laporatorio de Informatica)
    if (abaAtiva === 'laboratorio de Informatica' && activeFilter !== 'Todas') {
      if (activeFilter === 'Lab 1') {
        items = items.filter(item => 
          item.local && item.local.toLowerCase().includes('lab 1')
        )
      } else if (activeFilter === 'Lab 2') {
        items = items.filter(item => 
          item.local && item.local.toLowerCase().includes('lab 2')
        )
      } else if (activeFilter === 'Emprestado Temporariamente') {
        items = items.filter(item => 
          item.status && item.status.toLowerCase().includes('emprestado')
        )
      }
    }
    
    // Filtro para CIS Med (Consultórios) - Administrativo/Acadêmico
    if ((abaAtiva === 'Consultórios CIS med' || abaAtiva === 'CIS Med') && activeFilter !== 'Todas') {
      items = items.filter(item => 
        item.ambiente && item.ambiente.toLowerCase().includes(activeFilter.toLowerCase())
      )
    }
    
    // Busca por termo
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      items = items.filter(item =>
        (item.nome && item.nome.toLowerCase().includes(term)) ||
        (item.service_tag && item.service_tag.toLowerCase().includes(term)) ||
        (item.hostname && item.hostname.toLowerCase().includes(term)) ||
        (item.local && item.local.toLowerCase().includes(term)) ||
        (item.categoria && item.categoria.toLowerCase().includes(term)) ||
        (item.mac && item.mac.toLowerCase().includes(term)) ||
        (item.ip && item.ip.toLowerCase().includes(term)) ||
        (item.processador && item.processador.toLowerCase().includes(term)) ||
        (item.armazenamento && item.armazenamento.toLowerCase().includes(term)) ||
        (item.tipo_disco && item.tipo_disco.toLowerCase().includes(term)) ||
        (item.memoria_ram && item.memoria_ram.toLowerCase().includes(term)) ||
        (item.patrimonio && item.patrimonio.toLowerCase().includes(term)) ||
        (item.modelo && item.modelo.toLowerCase().includes(term)) ||
        (item.fabricante && item.fabricante.toLowerCase().includes(term)) ||
        (item.status && item.status.toLowerCase().includes(term)) ||
        (item.emprestado_temporariamente && item.emprestado_temporariamente.toLowerCase().includes(term))
      )
    }
    
    return items
  }, [data?.itens, searchTerm, abaAtiva, activeFilter])

  if (loading) {
    return <Loader />
  }



  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        maxWidth: '80rem',
        margin: '0 auto',
        padding: isMobile ? '6rem 1.5rem 5rem' : '9rem 1.5rem 6rem',
        minHeight: '100vh',
        color: '#0a0a0a',
        position: 'relative',
        zIndex: 1
      }}
    >
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          <BarChart3 size={28} style={{ color: '#6366f1' }} />
          <div>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b' }}>
              Inventário
            </h2>
            <p style={{ color: '#71717a', fontSize: '1rem' }}>
              {data ? `${data.total} itens cadastrados` : 'Gerenciamento de equipamentos e recursos'}
            </p>
          </div>
        </div>

        {/* Filtros de Abas */}
         {abas.length > 0 && (
           <div style={{
             display: 'flex',
             gap: '8px',
             flexWrap: 'wrap',
             marginTop: '1rem'
           }}>
             <button
               onClick={() => {
                 setAbaAtiva('')
                 buscarDados()
               }}
               style={{
                 padding: '8px 16px',
                 borderRadius: '9999px',
                 border: '1px solid #e4e4e7',
                 background: !abaAtiva ? '#0a0a0a' : '#ffffff',
                 color: !abaAtiva ? '#ffffff' : '#475569',
                 cursor: 'pointer',
                 fontSize: '13px',
                 fontWeight: 500,
                 minHeight: '44px'
               }}
             >
               Todas
             </button>
             {abas.map((aba, i) => (
               <button
                 key={i}
                 onClick={() => buscarDados(aba)}
                 style={{
                   padding: '8px 16px',
                   borderRadius: '9999px',
                   border: '1px solid #e4e4e7',
                   background: abaAtiva === aba ? '#6366f1' : '#ffffff',
                   color: abaAtiva === aba ? '#ffffff' : '#475569',
                   cursor: 'pointer',
                   fontSize: '13px',
                   fontWeight: 500,
                   minHeight: '44px'
                 }}
               >
                 {aba}
               </button>
             ))}
           </div>
         )}

        {/* Barra de Busca e Filtros */}
        <div style={{
          marginTop: '1rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
          flexWrap: 'wrap'
        }}>
          {/* Barra de Busca */}
          <div style={{
            flex: '1',
            position: 'relative',
            maxWidth: '400px'
          }}>
            <Search size={16} style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#71717a'
            }} />
            <input
              type="text"
              placeholder="Buscar por nome, tag, IP, MAC, local..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                borderRadius: '9999px',
                border: '1px solid #e4e4e7',
                background: 'rgba(255, 255, 255, 0.7)',
                fontSize: '13px',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#6366f1'
                e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e4e4e7'
                e.target.style.boxShadow = 'none'
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#71717a',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filtros para Laboratorio de Informatica */}
          {abaAtiva === 'laboratorio de Informatica' && (
            <div style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center'
            }}>
              {['Todas', 'Lab 1', 'Lab 2', 'Emprestado Temporariamente'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    border: '1px solid #e4e4e7',
                    background: activeFilter === filter ? '#6366f1' : '#ffffff',
                    color: activeFilter === filter ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    minHeight: '44px'
                  }}
                >
                  {filter}
                </button>
              ))}
            </div>
          )}

          {/* Filtros para CIS Med */}
          {(abaAtiva === 'Consultórios CIS med' || abaAtiva === 'CIS Med') && (
            <div style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center'
            }}>
              {['Todas', 'Administrativo', 'Acadêmico'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    border: '1px solid #e4e4e7',
                    background: activeFilter === filter ? '#6366f1' : '#ffffff',
                    color: activeFilter === filter ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    minHeight: '44px'
                  }}
                >
                  {filter}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {error ? (
        <div style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '3rem',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          textAlign: 'center'
        }}>
          <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>
          <p style={{ color: '#71717a' }}>Configure a URL do inventário no .env</p>
        </div>
      ) : filteredItems.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {filteredItems.map((item, index) => (
            <motion.div
              key={item.id || index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setSelectedItem(item)}
              whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)' }}
              whileTap={{ scale: 0.98 }}
              style={{
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(12px)',
                borderRadius: '1rem',
                padding: '1.5rem',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#f5f5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Package size={20} style={{ color: '#6366f1' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                    {item.nome || 'Sem nome'}
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '13px', color: '#71717a' }}>
                    {item.categoria && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Tag size={12} /> {item.categoria}
                      </span>
                    )}
                    {item.local && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} /> {item.local}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e4e4e7',
                fontSize: '13px',
                color: '#71717a'
              }}>
                <span>Qtd: <strong style={{ color: '#0a0a0a' }}>{item.quantidade || 0}</strong></span>
                <span>Disp: <strong style={{ color: '#22c55e' }}>{item.disponivel || 0}</strong></span>
              </div>
              {item.observacao && (
                <p style={{ fontSize: '12px', color: '#71717a', marginTop: '0.5rem', fontStyle: 'italic' }}>
                  {item.observacao}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '3rem',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          textAlign: 'center'
        }}>
          <p style={{ color: '#71717a' }}>Nenhum item encontrado na planilha</p>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '1rem' }}>
        <button
          onClick={() => onNavigate?.('dashboard')}
          style={{
            padding: '10px 20px',
            borderRadius: '9999px',
            border: '1px solid #e4e4e7',
            background: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            color: '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <ArrowLeft size={16} />
          Voltar ao Dashboard
        </button>
      </div>

      {/* Modal de Detalhes do Item */}
      <AnimatePresence>
        {selectedItem && (
          <ItemModal
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
