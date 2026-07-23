export interface ProblemTemplate {
  id: string
  assetType: string
  categories: string[]
  createdAt: string
  updatedAt: string
}

export type ProblemTemplateFormData = Omit<ProblemTemplate, 'id' | 'createdAt' | 'updatedAt'>

export const DEFAULT_PROBLEM_TEMPLATES: ProblemTemplateFormData[] = [
  {
    assetType: 'Desktop',
    categories: ['Não liga', 'Sem internet', 'Muito lento', 'Sem imagem', 'Não faz login', 'Mouse', 'Teclado', 'Outro'],
  },
  {
    assetType: 'Notebook',
    categories: ['Não liga', 'Sem internet', 'Muito lento', 'Sem imagem', 'Bateria', 'Trackpad', 'Teclado', 'Tela', 'Outro'],
  },
  {
    assetType: 'Monitor',
    categories: ['Sem imagem', 'Sem sinal', 'Tela piscando', 'Brilho', 'Outro'],
  },
  {
    assetType: 'Projetor',
    categories: ['Não liga', 'Sem imagem', 'HDMI', 'Controle remoto', 'Lâmpada', 'Outro'],
  },
  {
    assetType: 'Impressora',
    categories: ['Não imprime', 'Papel enguiçado', 'Sem tinta', 'Lenta', 'Outro'],
  },
  {
    assetType: 'Periférico',
    categories: ['Não funciona', 'Conexão', 'Desgaste', 'Outro'],
  },
  {
    assetType: 'TV',
    categories: ['Não liga', 'Sem imagem', 'Sem som', 'Controle remoto', 'HDMI', 'Outro'],
  },
  {
    assetType: 'Access Point',
    categories: ['Não liga', 'Sem internet', 'Wi-Fi fraco', 'Reset', 'Outro'],
  },
  {
    assetType: 'Caixa de Som',
    categories: ['Não liga', 'Sem som', 'Chiado', 'Volume', 'Outro'],
  },
]
