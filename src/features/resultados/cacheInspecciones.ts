import { LISTAS } from '../../config'
import { listarTodo, type ItemLista } from '../../graph/client'

/**
 * Carga de InspeccionPulmones con copia en el navegador (IndexedDB).
 *
 * Antes cada visita descargaba los ~5.700 registros completos. Ahora:
 *  - Primera visita (o copia de más de 7 días): descarga completa, igual que antes, y la guarda.
 *  - Siguientes visitas: pide SOLO lo creado o modificado desde la última vez (columna Modified),
 *    más la lista liviana de ids (solo números) para quitar de la copia lo que se haya borrado en
 *    SharePoint. Si algo no cuadra o falla, vuelve a la descarga completa.
 * El resultado es el mismo arreglo de siempre: { ...fields, _spId }.
 */

export type Registro = Record<string, unknown> & { _spId: string }

const DB = 'score-pulmonar'
const STORE = 'inspecciones'
const META = 'meta'
const MAX_DIAS_COPIA = 7
const MARGEN_MS = 15 * 60 * 1000 // margen para diferencias de reloj

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore(STORE, { keyPath: '_spId' })
      r.result.createObjectStore(META)
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

function tx<T>(db: IDBDatabase, stores: string[], modo: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((res, rej) => {
    const t = db.transaction(stores, modo)
    let req: IDBRequest<T> | void
    t.oncomplete = () => res(req ? req.result : undefined)
    t.onerror = () => rej(t.error)
    t.onabort = () => rej(t.error)
    req = fn(t)
  })
}

const aRegistro = (i: ItemLista<Record<string, unknown>>): Registro => ({ ...i.fields, _spId: i.id })

async function descargaCompleta(db: IDBDatabase | null): Promise<Registro[]> {
  const items = await listarTodo<Record<string, unknown>>(LISTAS.INSPECCIONES, 'expand=fields&$top=5000')
  const regs = items.map(aRegistro)
  if (db) {
    try {
      await tx(db, [STORE, META], 'readwrite', (t) => {
        const s = t.objectStore(STORE)
        s.clear()
        regs.forEach((r) => s.put(r))
        t.objectStore(META).put({ ultima: new Date().toISOString(), completa: new Date().toISOString() }, 'sync')
      })
    } catch (e) {
      console.warn('No se pudo guardar la copia local:', (e as Error).message)
    }
  }
  return regs
}

export async function cargarInspecciones(): Promise<{ datos: Registro[]; modo: 'completa' | 'incremental' }> {
  let db: IDBDatabase | null = null
  try { db = await abrirDB() } catch { db = null } // navegador sin IndexedDB (modo privado): carga completa siempre
  if (!db) return { datos: await descargaCompleta(null), modo: 'completa' }

  try {
    const meta = (await tx<{ ultima: string; completa: string }>(db, [META], 'readonly', (t) => t.objectStore(META).get('sync'))) || null
    const vieja = !meta || Date.now() - new Date(meta.completa).getTime() > MAX_DIAS_COPIA * 864e5
    if (vieja) return { datos: await descargaCompleta(db), modo: 'completa' }

    const inicio = new Date().toISOString()
    const desde = new Date(new Date(meta.ultima).getTime() - MARGEN_MS).toISOString()
    const filtro = `fields/Modified ge '${desde}'`
    const [cambios, ids, copia] = await Promise.all([
      listarTodo<Record<string, unknown>>(LISTAS.INSPECCIONES, `$filter=${encodeURIComponent(filtro)}&expand=fields&$top=5000`),
      listarTodo<Record<string, unknown>>(LISTAS.INSPECCIONES, '$select=id&$top=5000'),
      tx<Registro[]>(db, [STORE], 'readonly', (t) => t.objectStore(STORE).getAll() as IDBRequest<Registro[]>),
    ])
    const porId = new Map((copia || []).map((r) => [r._spId, r]))
    cambios.forEach((i) => porId.set(i.id, aRegistro(i)))
    const vigentes = new Set(ids.map((i) => i.id))
    const borrados = [...porId.keys()].filter((id) => !vigentes.has(id))
    borrados.forEach((id) => porId.delete(id))
    // Si SharePoint tiene ids que la copia no tiene, la copia está incompleta: descarga completa.
    if ([...vigentes].some((id) => !porId.has(id))) return { datos: await descargaCompleta(db), modo: 'completa' }

    await tx(db, [STORE, META], 'readwrite', (t) => {
      const s = t.objectStore(STORE)
      cambios.forEach((i) => s.put(aRegistro(i)))
      borrados.forEach((id) => s.delete(id))
      t.objectStore(META).put({ ultima: inicio, completa: meta.completa }, 'sync')
    })
    return { datos: [...porId.values()], modo: 'incremental' }
  } catch (e) {
    console.warn('Carga incremental falló, se hace descarga completa:', (e as Error).message)
    return { datos: await descargaCompleta(db), modo: 'completa' }
  }
}
