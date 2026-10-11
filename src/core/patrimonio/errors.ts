/**
 * Erros da camada de dados do Patrimônio.
 *
 * Objetivo: transformar falhas do Supabase/PostgREST (ou validações locais) em
 * um erro TIPADO, com:
 *   · `code` estável — o chamador decide o que fazer sem parsear string;
 *   · `message` seguro para exibição — nunca vaza SQL, token ou dado sensível;
 *   · `diagnostic` — o detalhe técnico bruto (para log/observabilidade), que a
 *     UI NÃO deve exibir.
 *
 * Os códigos do Postgres que mapeamos são os que o schema realmente produz:
 *   42501 → RLS/RBAC negou        (policies de 091–094)
 *   23505 → violação de unicidade  (asset_tag/matrícula/local duplicado)
 *   23503 → violação de FK         (local/responsável inexistente)
 *   23514 → violação de CHECK      (status/condição/regra de movimento)
 *   PGRST116 → .single() sem linhas
 */

export type PatrimonioErrorCode =
  | 'not_configured'
  | 'no_workspace'
  | 'validation'
  | 'permission_denied'
  | 'conflict'
  | 'invalid_reference'
  | 'invalid_value'
  | 'not_found'
  | 'query_failed'

/** Mensagens padrão por código — seguras para exibição. */
const DEFAULT_MESSAGE: Record<PatrimonioErrorCode, string> = {
  not_configured: 'Conexão com o banco de dados não está configurada.',
  no_workspace: 'Nenhuma unidade ativa selecionada.',
  validation: 'Dados inválidos.',
  permission_denied: 'Sem permissão para esta operação.',
  conflict: 'O registro conflita com um registro existente.',
  invalid_reference: 'Referência inválida: o local ou responsável informado não existe.',
  invalid_value: 'Valor inválido para este campo.',
  not_found: 'Registro não encontrado.',
  query_failed: 'Falha ao acessar o banco de dados.',
}

/** Forma mínima de um erro do PostgREST (evita dependência de tipos internos). */
interface PostgrestLikeError {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function codeFromPostgres(code: string | null | undefined): PatrimonioErrorCode {
  switch (code) {
    case '42501':
      return 'permission_denied'
    case '23505':
      return 'conflict'
    case '23503':
      return 'invalid_reference'
    case '23514':
      return 'invalid_value'
    case 'PGRST116':
      return 'not_found'
    default:
      return 'query_failed'
  }
}

export class PatrimonioError extends Error {
  readonly code: PatrimonioErrorCode
  /** Detalhe técnico bruto (banco/rede). Para log — não para a UI. */
  readonly diagnostic: string

  constructor(code: PatrimonioErrorCode, message?: string, diagnostic = '') {
    super(message ?? DEFAULT_MESSAGE[code])
    this.name = 'PatrimonioError'
    this.code = code
    this.diagnostic = diagnostic
  }
}

/**
 * Normaliza um erro desconhecido (tipicamente `PostgrestError` do supabase-js)
 * em `PatrimonioError`. Nunca repassa o `message` bruto como mensagem de UI.
 */
export function toPatrimonioError(error: unknown): PatrimonioError {
  if (error instanceof PatrimonioError) return error

  const err = (error ?? {}) as PostgrestLikeError
  const code = codeFromPostgres(err.code)
  const diagnostic = [err.code, err.message, err.details, err.hint]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' | ')

  return new PatrimonioError(code, undefined, diagnostic)
}

/** Atalho de validação local. */
export function validationError(message: string): PatrimonioError {
  return new PatrimonioError('validation', message)
}
