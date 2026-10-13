import type { BannerHotspotBox } from '../../lib/components/BannerImage'

/**
 * Configuração do banner do app Estoque.
 *
 * ── Ponto de integração ────────────────────────────────────────────────────
 * Basta adicionar itens a `STOCK_BANNERS` para publicar arte no topo do
 * dashboard. Nenhum layout precisa ser alterado: `StockBanner` já está montado
 * e renderiza `null` enquanto a lista estiver vazia (sem espaço reservado).
 *
 * Regras do espaço (ver Issue #382):
 * - Banner é parte do layout do app, não um pop-up; não é sticky.
 * - Renderização proporcional (o asset define a altura): nunca cobre filtros,
 *   ações, mensagens de erro ou controles.
 * - Sem upload/CMS/tabela de banners nesta etapa — a arte definitiva entra
 *   depois, sem reconstruir a estrutura.
 *
 * Formato sugerido da arte: peça horizontal com identidade LabHub, mascote à
 * esquerda e área livre para título/mensagem/CTA.
 */
export interface StockBannerSpec {
  /** Caminho público do asset (ex.: `/banners/stock/principal.svg`). */
  src: string
  /** Texto alternativo (acessibilidade). */
  alt: string
  /** Prioridade de rede do primeiro banner (acima da dobra). */
  eager?: boolean
  /** Área clicável opcional alinhada a um CTA já desenhado na arte. */
  hotspot?: BannerHotspotBox
}

/**
 * Lista de banners do Estoque. Vazia nesta etapa (fundação visual apenas):
 * o espaço existe, mas sem arte oficial — e sem deixar um vão vazio na tela.
 */
export const STOCK_BANNERS: StockBannerSpec[] = []
