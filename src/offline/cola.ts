import type { CamposInspeccion } from '../graph/inspecciones'
import type { ErrorTipado } from '../graph/errores'

/**
 * COLA OFFLINE — los registros que no se pudieron subir quedan en el celular y se suben después.
 *
 * Se mantiene EXACTAMENTE la misma clave y formato de la versión anterior ('insp_pulmones_queue'
 * en localStorage), a propósito: los registros que un celular tenga pendientes al momento de
 * actualizar a esta versión se siguen viendo y se suben sin hacer nada, y recuperar.html sigue
 * funcionando igual.
 */
export const QUEUE_KEY = 'insp_pulmones_queue'

export interface ItemCola {
  fields: CamposInspeccion
  ts: string
  /** texto (versión actual) o número (registros de versiones muy viejas). */
  id: string | number
  dudoso?: boolean
  ultimoError?: string
  intentos?: number
  ultimoIntento?: string
}

export function leerCola(): ItemCola[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

/** Sobrescribe la cola. Lanza si el celular no tiene espacio (el llamador avisa y NO avanza el animal). */
function guardarCola(q: ItemCola[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

/** Agrega un registro a la cola. @throws si no se puede escribir en el celular. */
export function agregarACola(fields: CamposInspeccion, meta?: { dudoso?: boolean; error?: string }) {
  const q = leerCola()
  q.push({
    fields,
    ts: new Date().toISOString(),
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    dudoso: !!meta?.dudoso,
    ultimoError: meta?.error || '',
  })
  guardarCola(q)
}

/** Quita UN registro de la cola (por id) — nunca reescribe la cola completa con datos viejos. */
export function quitarDeCola(id: ItemCola['id']) {
  guardarCola(leerCola().filter((i) => i.id !== id))
}

/** Anota que un intento de subida falló (y por qué). */
export function marcarFalloEnCola(id: ItemCola['id'], e: ErrorTipado) {
  guardarCola(
    leerCola().map((i) =>
      i.id !== id
        ? i
        : { ...i, intentos: (i.intentos || 0) + 1, ultimoError: e.message, ultimoIntento: new Date().toISOString(), dudoso: !!(i.dudoso || e.dudoso) },
    ),
  )
}

/** "orden" de un lote que están en la cola de este celular (aún sin subir). */
export function ordenesLocalesPendientes(gId: number | string, consec: string): number[] {
  return leerCola()
    .filter((item) => String(item.fields.granja_id) === String(gId) && String(item.fields.consecutivo) === String(consec))
    .map((item) => parseInt(String(item.fields.orden)) || 0)
}
