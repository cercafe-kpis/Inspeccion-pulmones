import type { NombreLista } from '../config'
import { getListId, getSiteId, graph } from './client'

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Actualiza campos de muchos ítems de una lista, de a 20 por llamada (Graph $batch), con reintento
 * cuando SharePoint pide esperar (429/503). `progreso` se llama después de cada grupo.
 */
export async function actualizarEnBloque(
  lista: NombreLista,
  cambios: { id: string; fields: Record<string, unknown> }[],
  progreso?: (ok: number, total: number) => void,
): Promise<{ ok: number; fallos: number }> {
  const siteId = await getSiteId()
  const listId = await getListId(lista)
  let ok = 0, fallos = 0
  for (let i = 0; i < cambios.length; i += 20) {
    let grupo = cambios.slice(i, i + 20)
    for (let intento = 0; intento < 5 && grupo.length; intento++) {
      const r = await graph<{ responses: { id: string; status: number; headers?: Record<string, string> }[] }>('/$batch', {
        method: 'POST',
        timeout: 60000,
        body: {
          requests: grupo.map((c) => ({
            id: c.id, method: 'PATCH', url: `/sites/${siteId}/lists/${listId}/items/${c.id}/fields`,
            headers: { 'Content-Type': 'application/json' }, body: c.fields,
          })),
        },
      })
      const reintentar = r.responses.filter((x) => x.status === 429 || x.status === 503)
      ok += r.responses.filter((x) => x.status >= 200 && x.status < 300).length
      grupo = grupo.filter((c) => reintentar.some((x) => x.id === c.id))
      if (intento === 4) fallos += grupo.length
      fallos += r.responses.filter((x) => x.status >= 300 && x.status !== 429 && x.status !== 503).length
      if (grupo.length && intento < 4) await esperar(1000 * (parseInt(reintentar[0]?.headers?.['Retry-After'] || '') || 5))
    }
    progreso?.(ok, cambios.length)
  }
  return { ok, fallos }
}
