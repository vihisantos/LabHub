/**
 * Versão parcial-profunda de T para patches de configuração.
 * Objetos aninhados viram DeepPartial recursivo; arrays e escalares
 * permanecem obrigatórios por inteiro quando presentes no patch
 * (arrays são substituídos, nunca mesclados por índice).
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] | Date
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

/**
 * Contrato de configuração de um app. O banco persiste JSONB puro em
 * workspace_app_settings.settings; o frontend só manipula o tipo T
 * através deste contrato (defaults -> merge -> validate -> tipado).
 */
export interface AppSettingsDefinition<T> {
  defaultSettings: T
  /**
   * Recebe o objeto já mesclado com defaults e devolve a versão validada/
   * normalizada. Deve lançar Error quando o valor for inaceitável — nesse caso
   * o serviço cai nos defaults seguros e registra o erro.
   */
  validateSettings: (value: unknown) => T
}

/** Props recebidas por todo SettingsPanel renderizado dentro do shell genérico. */
export interface AppSettingsPanelProps {
  appId: string
}
