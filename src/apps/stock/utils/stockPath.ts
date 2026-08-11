export const STOCK_PREFIXES = ['/stock', '/general-stock'] as const

export function stockPrefix(pathname: string): string {
  return STOCK_PREFIXES.find((pre) => pathname.startsWith(pre)) || '/stock'
}

/** Converte /general-stock/* em /stock/* (para checagens de rota). */
export function normalizeStockPath(pathname: string): string {
  if (pathname.startsWith('/general-stock')) {
    return '/stock' + pathname.slice('/general-stock'.length)
  }
  return pathname
}

/** Resolve um caminho mantendo o prefixo atual (/stock ou /general-stock). */
export function stockPath(pathname: string, suffix: string): string {
  const pre = stockPrefix(pathname)
  return pre + (suffix.startsWith('/') ? suffix : `/${suffix}`)
}

/** Como stockPath, mas recebe um alvo no formato /stock/... e troca só o prefixo. */
export function stockNavPath(pathname: string, target: string): string {
  return stockPath(pathname, target.slice('/stock'.length))
}
