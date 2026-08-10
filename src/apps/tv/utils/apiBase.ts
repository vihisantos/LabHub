/**
 * Base URL da API Flask/Serverless do TV.
 * Na web é '' (same-origin, proxy do Vite/vercel.json).
 * No app desktop (file://) é a URL do deploy, definida via VITE_TV_API_BASE.
 */
export const TV_API_BASE: string =
  (import.meta.env.VITE_TV_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? ''

export function tvApi(path: string): string {
  return `${TV_API_BASE}${path}`
}
