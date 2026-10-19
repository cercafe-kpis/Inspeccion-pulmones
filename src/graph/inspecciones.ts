import { LISTAS } from '../config'
import { crearItem, listarTodo } from './client'
import type { ErrorTipado } from './errores'

/** Campos de un registro (un cerdo) — mismos nombres de columna de la lista InspeccionPulmones. */
export type CamposInspeccion = Record<string, string | number | boolean> & {
  granja_id: number
  consecutivo: string
  orden: number
  IdLocal?: string
}

/**
 * Si la columna IdLocal todavía no existe en SharePoint, Graph rechaza TODO el registro
 * ("Field 'IdLocal' is not recognized"). Para que eso nunca deje registros sin subir, se reintenta
 * sin ese campo y se recuerda en el celular para no volver a mandarlo.
 */
const SIN_IDLOCAL = 'insp_pulmones_sin_idlocal'
const idLocalDeshabilitado = () => { try { return localStorage.getItem(SIN_IDLOCAL) === '1' } catch { return false } }

/** Crea el registro de un cerdo en SharePoint. Lanza ErrorTipado (red/auth/http, dudoso). */
export async function guardarSP(fields: CamposInspeccion, silencioso?: boolean): Promise<void> {
  const enviar = { ...fields }
  if (idLocalDeshabilitado()) delete enviar.IdLocal
  try {
    await crearItem(LISTAS.INSPECCIONES, enviar, silencioso)
  } catch (e) {
    const err = e as ErrorTipado
    if (err.tipo === 'http' && 'IdLocal' in enviar && /IdLocal/i.test(err.message)) {
      try { localStorage.setItem(SIN_IDLOCAL, '1') } catch { /* nada */ }
      delete enviar.IdLocal
      await crearItem(LISTAS.INSPECCIONES, enviar, silencioso)
      return
    }
    throw err
  }
}

/**
 * Valores de "orden" que YA existen en SharePoint para una granja + consecutivo (sigue la paginación).
 * Sirve para sugerir el orden inicial y para no duplicar al reintentar.
 */
export async function obtenerOrdenesExistentes(gId: number | string, consec: string, silencioso?: boolean): Promise<number[]> {
  const filtro = `fields/granja_id eq ${parseInt(String(gId))} and fields/consecutivo eq '${String(consec).replace(/'/g, "''")}'`
  const items = await listarTodo<{ orden?: number | string }>(
    LISTAS.INSPECCIONES,
    `$filter=${encodeURIComponent(filtro)}&$expand=fields($select=orden)&$top=999`,
    silencioso,
  )
  return items.map((i) => parseInt(String(i.fields?.orden)) || 0)
}

/** ¿Existe ya en SharePoint un registro con este IdLocal? (columna indexada: consulta rápida y exacta). */
async function existeIdLocal(idLocal: string, silencioso?: boolean): Promise<boolean> {
  const filtro = `fields/IdLocal eq '${idLocal.replace(/'/g, "''")}'`
  const items = await listarTodo(LISTAS.INSPECCIONES, `$filter=${encodeURIComponent(filtro)}&$expand=fields($select=IdLocal)&$top=1`, silencioso)
  return items.length > 0
}

/**
 * ¿Ya existe en SharePoint este registro? Se usa con los registros "dudosos" (una subida anterior se
 * cortó sin respuesta) antes de reintentarlos.
 *  - Con IdLocal: búsqueda exacta por IdLocal.
 *  - Registros viejos sin IdLocal (o si la columna aún no existe): granja + consecutivo + orden, como antes.
 * `cache` guarda por lote los "orden" ya consultados durante UNA sincronización.
 */
export async function yaExisteEnSP(fields: CamposInspeccion, silencioso: boolean, cache: Map<string, Set<number>>): Promise<boolean> {
  if (fields.IdLocal && !idLocalDeshabilitado()) {
    try {
      return await existeIdLocal(fields.IdLocal, silencioso)
    } catch (e) {
      const err = e as ErrorTipado
      if (err.tipo !== 'http') throw err // red / sesión: que la sincronización se detenga como siempre
      // la columna no existe todavía → caer a la verificación por orden
    }
  }
  const clave = fields.granja_id + '|' + fields.consecutivo
  let set = cache.get(clave)
  if (!set) {
    set = new Set(await obtenerOrdenesExistentes(fields.granja_id, fields.consecutivo, silencioso))
    cache.set(clave, set)
  }
  return set.has(parseInt(String(fields.orden)) || 0)
}
