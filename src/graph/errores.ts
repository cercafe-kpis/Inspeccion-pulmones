/**
 * Errores clasificados por tipo — de esto depende si un registro se reintenta, si se pide iniciar
 * sesión o si se detiene la sincronización.
 *   'red'  → sin señal / red inestable / tiempo agotado
 *   'auth' → sesión vencida o sin permiso (401/403)
 *   'http' → error del servidor o de los datos
 * dudoso = la subida salió pero no se sabe si SharePoint alcanzó a crear el ítem.
 */
export type TipoError = 'red' | 'auth' | 'http'
export interface ErrorTipado extends Error {
  tipo?: TipoError
  dudoso?: boolean
  status?: number
}

export function errTipo(msg: string, tipo: TipoError, dudoso?: boolean, status?: number): ErrorTipado {
  const e = new Error(msg) as ErrorTipado
  e.tipo = tipo
  if (dudoso) e.dudoso = true
  if (status) e.status = status
  return e
}

/** Rechaza si la promesa no termina en `ms` milisegundos (evita que una sincronización se quede colgada). */
export function conTimeout<T>(promesa: Promise<T>, ms: number, etiqueta?: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(errTipo('Tiempo de espera agotado (' + (etiqueta || 'red') + ')', 'red')), ms)
  })
  return Promise.race([promesa, limite]).finally(() => clearTimeout(t))
}

/** fetch con tiempo máximo (AbortController). Lanza AbortError si se pasa de `ms`. */
export async function fetchT(url: string, opts?: RequestInit, ms?: number): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms || 30000)
  try {
    return await fetch(url, { ...(opts || {}), signal: ctl.signal })
  } finally {
    clearTimeout(t)
  }
}
