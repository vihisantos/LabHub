/**
 * Provedor de imagens de fundo curadas e limpas para eventos do TV App.
 * Garante que NENHUMA imagem contenha conteúdo impróprio, sangue, cirurgia ou gráficos sensíveis.
 */

export type EventCategory = 'medicina' | 'provas' | 'consciencia_negra' | 'dia_dos_pais' | 'dia_das_maes' | 'carnaval' | 'feriado' | 'geral'

export const SAFE_IMAGE_PRESETS: Record<EventCategory, string[]> = {
  medicina: [
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1920&q=80', // Estetoscópio & mesa de trabalho limpa
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1920&q=80', // Laboratório científico moderno
    'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=1920&q=80', // Prontuário & jaleco limpo
    'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1920&q=80', // Ambiente hospitalar moderno e iluminado
    'https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?auto=format&fit=crop&w=1920&q=80', // Pesquisa em saúde / microscópio
  ],
  provas: [
    'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1920&q=80', // Pessoa estudando / caneta no papel
    'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1920&q=80', // Livros e óculos de leitura
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1920&q=80', // Mesa de estudo iluminada com notebook
    'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=1920&q=80', // Sala de aula universitária / biblioteca
  ],
  consciencia_negra: [
    'https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&w=1920&q=80', // Diversidade & arte cultural
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1920&q=80', // União e representatividade
  ],
  dia_dos_pais: [
    'https://images.unsplash.com/photo-1485546246426-74dc88dec4d9?auto=format&fit=crop&w=1920&q=80', // Família & momentos afetivos
  ],
  dia_das_maes: [
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1920&q=80', // Flores e momentos familiares
  ],
  carnaval: [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80', // Confetes & luzes festivas
  ],
  feriado: [
    'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1920&q=80', // Arquitetura nacional / celebração
  ],
  geral: [
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1920&q=80', // Iluminação de eventos e palco
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1920&q=80', // Auditório / Conferência
  ]
}

/**
 * Detecta automaticamente a categoria com base no título e descrição do evento
 */
export function detectCategoryFromText(title: string, description?: string | null): EventCategory {
  const text = `${title} ${description || ''}`.toLowerCase()

  if (text.includes('medicina') || text.includes('internato') || text.includes('enamed') || text.includes('saúde') || text.includes('saude') || text.includes('hospital') || text.includes('clínica') || text.includes('clinica')) {
    return 'medicina'
  }
  if (text.includes('prova') || text.includes('avaliação') || text.includes('avaliacao') || text.includes('a1') || text.includes('a2') || text.includes('a3') || text.includes('af1') || text.includes('af2') || text.includes('af3') || text.includes('tpi') || text.includes('exame') || text.includes('simulado')) {
    return 'provas'
  }
  if (text.includes('consciência negra') || text.includes('consciencia negra') || text.includes('aquilombar')) {
    return 'consciencia_negra'
  }
  if (text.includes('pais') || text.includes('pai')) {
    return 'dia_dos_pais'
  }
  if (text.includes('mães') || text.includes('mae')) {
    return 'dia_das_maes'
  }
  if (text.includes('carnaval')) {
    return 'carnaval'
  }
  if (text.includes('feriado') || text.includes('tiradentes') || text.includes('independência') || text.includes('proclamação') || text.includes('revolução')) {
    return 'feriado'
  }

  return 'geral'
}

/**
 * Retorna a URL da imagem apropriada para o evento.
 * Se houver image_url customizada válida, usa ela. Caso contrário, retorna um preset seguro.
 */
export function getSafeEventImageUrl(title: string, description?: string | null, customUrl?: string | null, categoryOverride?: EventCategory): string {
  if (customUrl && customUrl.trim().length > 0) {
    return customUrl.trim()
  }

  const category = categoryOverride || detectCategoryFromText(title, description)
  const pool = SAFE_IMAGE_PRESETS[category] || SAFE_IMAGE_PRESETS.geral

  // Seleção determinística baseada na soma dos caracteres do título para manter estabilidade
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % pool.length

  return pool[index]
}
