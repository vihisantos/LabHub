/**
 * Largura máxima compartilhada do conteúdo do Estoque (header + área principal).
 *
 * Antes, TODO o conteúdo era preso a `max-w-lg` (512px) via `StockPageTransition`,
 * o que estrangulava tabelas/indicadores no desktop. Aqui o mobile permanece
 * idêntico (`max-w-lg`) e o desktop passa a aproveitar a largura disponível,
 * com salto moderado para não "espalhar" a informação.
 *
 * Usar esta constante no header e no container das páginas garante que os dois
 * fiquem alinhados em qualquer breakpoint.
 */
export const STOCK_CONTAINER_CLASS = 'mx-auto w-full max-w-lg px-4 md:max-w-3xl lg:max-w-5xl'
