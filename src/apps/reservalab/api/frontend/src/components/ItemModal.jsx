import { motion, AnimatePresence } from 'framer-motion'
import { X, Package, Tag, MapPin, Monitor, Network, Hash, FileText, CheckCircle, XCircle } from 'lucide-react'

export default function ItemModal({ item, onClose }) {
  if (!item) return null

  const fields = [
    { label: 'Nome', value: item.nome, icon: <Package size={16} /> },
    { label: 'Service Tag / Série', value: item.service_tag, icon: <Hash size={16} /> },
    { label: 'Hostname', value: item.hostname, icon: <Monitor size={16} /> },
    { label: 'Categoria', value: item.categoria, icon: <Tag size={16} /> },
    { label: 'Local', value: item.local, icon: <MapPin size={16} /> },
    { label: 'Endereço MAC', value: item.mac, icon: <Network size={16} /> },
    { label: 'Endereço IP', value: item.ip, icon: <Network size={16} /> },
    { label: 'Patrimônio', value: item.patrimonio, icon: <Hash size={16} /> },
    { label: 'Modelo', value: item.modelo, icon: <Monitor size={16} /> },
    { label: 'Fabricante', value: item.fabricante, icon: <Tag size={16} /> },
    { label: 'Processador', value: item.processador, icon: <Monitor size={16} /> },
    { label: 'Armazenamento', value: item.armazenamento, icon: <FileText size={16} /> },
    { label: 'Tipo de Disco', value: item.tipo_disco, icon: <FileText size={16} /> },
    { label: 'Memória RAM', value: item.memoria_ram, icon: <FileText size={16} /> },
    { label: 'Sistema Operacional', value: item.sistema_operacional, icon: <Monitor size={16} /> },
    { label: 'Ambiente', value: item.ambiente, icon: <Tag size={16} /> },
    { label: 'Status', value: item.status, icon: item.status === 'defeito' ? <XCircle size={16} /> : <CheckCircle size={16} /> },
    { label: 'Quantidade', value: item.quantidade, icon: <Hash size={16} /> },
    { label: 'Disponível', value: item.disponivel === 1 ? 'Sim' : 'Não', icon: item.disponivel === 1 ? <CheckCircle size={16} /> : <XCircle size={16} /> },
    { label: 'Observação', value: item.observacao, icon: <FileText size={16} /> },
  ]

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          style={{
            background: '#ffffff',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            position: 'relative',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#71717a',
            }}
          >
            <X size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Package size={24} style={{ color: '#6366f1' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                {item.nome || 'Sem nome'}
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#71717a' }}>
                {item.categoria || 'Sem categoria'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {fields.map((field, idx) => {
              if (!field.value && field.value !== 0) return null
              return (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '0.75rem',
                  background: '#f8fafc',
                  borderRadius: '8px',
                }}>
                  <div style={{ color: '#6366f1', flexShrink: 0, marginTop: '2px' }}>
                    {field.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {field.label}
                    </p>
                    <p style={{ fontSize: '0.938rem', color: '#1e293b', fontWeight: 500 }}>
                      {String(field.value)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
