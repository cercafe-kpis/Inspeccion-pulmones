import { getToken } from '../auth/msal'
import { CONFIG, type NombreLista } from '../config'
import { errTipo, fetchT } from './errores'

/**
 * Cliente genérico de Microsoft Graph para las listas del sitio Inspeccion_pulmones.
 * Lo específico de cada lista (qué campos tiene) vive en graph/inspecciones.ts y graph/catalogos.ts.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0'
const CACHE_IDS = 'insp_pulmones_graph_ids'

interface IdsCache { siteId?: string; listas: Record<string, string> }

function leerIds(): IdsCache {
  try { return JSON.parse(localStorage.getItem(CACHE_IDS) || '') as IdsCache } catch { return { listas: {} } }
}
function guardarIds(c: IdsCache) {
  try { localStorage.setItem(CACHE_IDS, JSON.stringify(c)) } catch { /* sin espacio: se vuelven a pedir */ }
}

/** Clasifica una respuesta HTTP no exitosa como error 'auth' o 'http', con el mensaje que devuelva Graph. */
async function errorDeRespuesta(r: Response, prefijo: string, dudosoSi5xx = false) {
  let msg = prefijo + ' (' + r.status + ')'
  try {
    const b = await r.json()
    if (b?.error?.message) msg = b.error.message
  } catch { /* sin cuerpo */ }
  return errTipo(msg, r.status === 401 || r.status === 403 ? 'auth' : 'http', dudosoSi5xx && r.status >= 500, r.status)
}

/** Llamada a Graph con token, tiempo máximo y errores clasificados. */
export async function graph<T = unknown>(
  ruta: string,
  opts: { method?: string; body?: unknown; silencioso?: boolean; timeout?: number; etiqueta?: string } = {},
): Promise<T> {
  const tok = await getToken(opts.silencioso)
  if (!tok) throw errTipo('No se pudo obtener token. Inicie sesión nuevamente.', 'auth')
  const url = ruta.startsWith('http') ? ruta : GRAPH + ruta
  let r: Response
  try {
    r = await fetchT(
      url,
      {
        method: opts.method || 'GET',
        headers: {
          Authorization: `Bearer ${tok}`,
          'Content-Type': 'application/json',
          // Permite filtrar por columnas aunque no estén indexadas (si la lista crece, Graph respondería 400).
          Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      },
      opts.timeout || 25000,
    )
  } catch (e) {
    const escritura = (opts.method || 'GET') !== 'GET'
    // En una escritura, la petición pudo llegar a SharePoint aunque no volvió respuesta → "dudoso".
    throw errTipo(
      (e as Error).name === 'AbortError' ? 'Tiempo de espera agotado' + (opts.etiqueta ? ' al ' + opts.etiqueta : '') : 'Sin conexión estable con SharePoint',
      'red',
      escritura,
    )
  }
  if (!r.ok) throw await errorDeRespuesta(r, 'Error de SharePoint', (opts.method || 'GET') !== 'GET')
  if (r.status === 204) return undefined as T
  try { return (await r.json()) as T } catch { return {} as T }
}

/** siteId del sitio Inspeccion_pulmones (se guarda en el celular: el id no cambia). */
export async function getSiteId(silencioso?: boolean): Promise<string> {
  const c = leerIds()
  if (c.siteId) return c.siteId
  const u = new URL(CONFIG.SP_SITE_URL)
  const s = await graph<{ id: string }>(`/sites/${u.hostname}:${u.pathname}`, { silencioso })
  c.siteId = s.id
  c.listas = c.listas || {}
  guardarIds(c)
  return s.id
}

/** listId por nombre visible de la lista. */
export async function getListId(nombre: NombreLista, silencioso?: boolean): Promise<string> {
  const c = leerIds()
  if (c.listas?.[nombre]) return c.listas[nombre]
  const siteId = await getSiteId(silencioso)
  const d = await graph<{ value: { id: string }[] }>(
    `/sites/${siteId}/lists?$filter=displayName eq '${nombre}'`,
    { silencioso },
  )
  if (!d.value?.length) throw errTipo(`Lista "${nombre}" no encontrada en SharePoint.`, 'http')
  const fresco = leerIds()
  fresco.listas = { ...(fresco.listas || {}), [nombre]: d.value[0].id }
  fresco.siteId = siteId
  guardarIds(fresco)
  return d.value[0].id
}

/** Ruta base de los ítems de una lista: /sites/{site}/lists/{list}/items */
export async function rutaItems(nombre: NombreLista, silencioso?: boolean): Promise<string> {
  const siteId = await getSiteId(silencioso)
  const listId = await getListId(nombre, silencioso)
  return `/sites/${siteId}/lists/${listId}/items`
}

export interface ItemLista<F> { id: string; fields: F }

/** Trae TODOS los ítems de una lista (sigue la paginación de Graph). */
export async function listarTodo<F>(nombre: NombreLista, query = '$expand=fields&$top=999', silencioso?: boolean): Promise<ItemLista<F>[]> {
  let url: string | null = (await rutaItems(nombre, silencioso)) + '?' + query
  const todos: ItemLista<F>[] = []
  for (let pag = 0; url && pag < 50; pag++) {
    const d: { value: ItemLista<F>[]; '@odata.nextLink'?: string } = await graph(url, { silencioso })
    todos.push(...(d.value || []))
    url = d['@odata.nextLink'] || null
  }
  return todos
}

/** Crea un ítem. */
export async function crearItem<F extends object>(nombre: NombreLista, fields: F, silencioso?: boolean, etiqueta = 'subir'): Promise<ItemLista<F>> {
  return graph(await rutaItems(nombre, silencioso), { method: 'POST', body: { fields }, silencioso, timeout: 30000, etiqueta })
}

/** Actualiza campos de un ítem existente. */
export async function actualizarItem<F extends object>(nombre: NombreLista, id: string, fields: Partial<F>): Promise<void> {
  await graph(`${await rutaItems(nombre)}/${id}/fields`, { method: 'PATCH', body: fields, timeout: 30000, etiqueta: 'guardar' })
}
