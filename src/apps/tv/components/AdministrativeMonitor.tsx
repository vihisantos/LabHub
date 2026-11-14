/**
 * Monitor Administrativo de Programação
 *
 * Exibe indicadores em tempo real para administradores:
 * - Total de conteúdos acadêmicos
 * - Concluídos no ciclo atual
 * - Pendentes
 * - Com erros
 * - Última reprodução
 * - Curso de origem
 * - Progresso do ciclo
 * - Comerciais reproduzidos
 * - Último comercial
 * - Contador até próximo comercial
 * - Próximo informativo
 */

import { useProgramming } from '../contexts/ProgrammingContext'

interface AdministrativeMonitorProps {
  compact?: boolean
  className?: string
}

export function AdministrativeMonitor({ compact = false, className }: AdministrativeMonitorProps) {
  const { queue, position, academicCompleted, academicSinceLastFixed, isFixedDue, currentItem, nextInformativo } = useProgramming()
  // Import removed - courses not used

  // Calcular progresso
  const totalContent = queue.length
  const completed = academicCompleted
  const progressPercent = totalContent > 0 ? Math.round((completed / totalContent) * 100) : 0

  // Conteúdo pendente
  const pending = totalContent - completed

  // Último conteúdo reproduzido
  const lastContent = position > 0 ? queue[position - 1] : null

  // Curso atual
  const currentCourse = currentItem?.course_name || 'Nenhum'

  // Contador até próximo comercial
  const nextCommercialIn = isFixedDue ? 0 : 5 - academicSinceLastFixed

  if (compact) {
    return (
      <div className={`flex items-center gap-4 text-xs ${className || ''}`}>
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">📊</span>
          <span>{completed}/{totalContent} concluídos</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">📺</span>
          <span>Próximo: {nextCommercialIn}c</span>
        </div>
        {nextInformativo && (
          <div className="flex items-center gap-2">
            <span className="text-fg-muted">📰</span>
            <span>Próximo: info</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`p-4 bg-card/50 backdrop-blur-sm rounded-lg border border-line ${className || ''}`}>
      <h3 className="text-sm font-medium text-fg mb-3">Monitor de Programação</h3>

      {/* Progresso do Ciclo */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-fg-muted">Progresso do Ciclo</span>
          <span className="text-xs text-fg">{progressPercent}%</span>
        </div>
        <div className="w-full bg-line/30 rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-background/30 rounded p-2">
          <div className="text-xs text-fg-muted mb-1">Total Acadêmico</div>
          <div className="text-lg font-medium text-fg">{totalContent}</div>
        </div>
        <div className="bg-background/30 rounded p-2">
          <div className="text-xs text-fg-muted mb-1">Pendentes</div>
          <div className="text-lg font-medium text-amber-500">{pending}</div>
        </div>
        <div className="bg-background/30 rounded p-2">
          <div className="text-xs text-fg-muted mb-1">Concluído</div>
          <div className="text-lg font-medium text-green-500">{completed}</div>
        </div>
        <div className="bg-background/30 rounded p-2">
          <div className="text-xs text-fg-muted mb-1">Aguardando Fixo</div>
          <div className="text-lg font-medium text-cyan-500">{nextCommercialIn}</div>
        </div>
      </div>

      {/* Última Reprodução */}
      <div className="border-t border-line/30 pt-3">
        <div className="text-xs text-fg-muted mb-2">Última Reprodução</div>
        {lastContent ? (
          <div className="text-sm text-fg truncate">
            {lastContent.file_name}
          </div>
        ) : (
          <div className="text-sm text-fg-muted">Nenhuma reprodução ainda</div>
        )}
      </div>

      {/* Próximo Comercial Fixo */}
      {isFixedDue && (
        <div className="mt-3 p-2 bg-amber-500/20 border border-amber-500/30 rounded">
          <div className="text-xs text-amber-400 mb-1">⚠️ Próximo é Comercial Fixo</div>
          <div className="text-sm text-fg">1 conteúdo acadêmico após este item</div>
        </div>
      )}

      {/* Próximo Informativo */}
      {nextInformativo && (
        <div className="mt-3 p-2 bg-blue-500/20 border border-blue-500/30 rounded">
          <div className="text-xs text-blue-400 mb-1">📰 Próximo Informativo</div>
          <div className="text-sm text-fg truncate">
            {nextInformativo.file_name}
          </div>
        </div>
      )}

      {/* Curso Atual */}
      <div className="mt-3 pt-3 border-t border-line/30">
        <div className="text-xs text-fg-muted mb-1">Curso Atual</div>
        <div className="text-sm text-fg">{currentCourse}</div>
      </div>

      {/* Contador */}
      <div className="mt-3 text-center">
        <div className="text-xs text-fg-muted">Até próximo comercial</div>
        <div className="text-xl font-mono text-fg">{nextCommercialIn}</div>
      </div>
    </div>
  )
}

/**
 * Badge de status rápido para a barra de status
 */
export function StatusBadge() {
  const { queue, academicCompleted, isFixedDue, nextInformativo } = useProgramming()

  if (queue.length === 0) {
    return <span className="text-xs text-fg-muted">Sem conteúdo</span>
  }

  const progress = queue.length > 0 ? Math.round((academicCompleted / queue.length) * 100) : 0

  if (isFixedDue) {
    return <span className="text-xs text-amber-500 font-medium">Comercial próximo</span>
  }

  if (nextInformativo) {
    return <span className="text-xs text-blue-500 font-medium">Informativo próximo</span>
  }

  if (progress >= 100) {
    return <span className="text-xs text-blue-500 font-medium">Ciclo concluído</span>
  }

  return (
    <span className="text-xs text-fg-muted">
      {academicCompleted}/{queue.length}
    </span>
  )
}