import { listarGranjas, listarUsuarios } from '../graph/catalogos'
import type { UsuarioApp } from '../state'
import { GRANJAS_RESPALDO, type Granja } from './datos'

/**
 * Copia en el celular de lo que la app necesita de las listas de configuración, para poder capturar
 * SIN señal: las granjas activas y el usuario que inició sesión. Se refresca cada vez que hay conexión.
 */

const KEY_GRANJAS = 'insp_pulmones_granjas'
const KEY_USUARIO = 'insp_pulmones_usuario'

/** Granjas activas para el buscador de captura (copia del celular → si no hay, el respaldo embebido). */
export function granjasActivas(): Granja[] {
  try {
    const raw = localStorage.getItem(KEY_GRANJAS)
    if (raw) {
      const d = JSON.parse(raw) as { granjas: Granja[] }
      if (Array.isArray(d.granjas) && d.granjas.length) return d.granjas
    }
  } catch { /* copia dañada: usar respaldo */ }
  return GRANJAS_RESPALDO
}

/** Descarga las granjas activas de SharePoint y las guarda en el celular. No lanza: si falla, se queda la copia anterior. */
export async function refrescarGranjas(): Promise<boolean> {
  if (!navigator.onLine) return false
  try {
    const lista = await listarGranjas(true)
    const activas: Granja[] = lista.filter((g) => g.Activa).map((g) => ({ id: g.IdGranja, n: g.Title, v: g.NombreVista || g.Title }))
    if (!activas.length) return false // lista vacía por error de configuración: no borrar la copia buena
    localStorage.setItem(KEY_GRANJAS, JSON.stringify({ granjas: activas, ts: Date.now() }))
    return true
  } catch (e) {
    console.warn('No se pudieron actualizar las granjas:', (e as Error).message)
    return false
  }
}

function usuarioGuardado(correo: string): UsuarioApp | null {
  try {
    const u = JSON.parse(localStorage.getItem(KEY_USUARIO) || 'null') as UsuarioApp | null
    return u && u.correo === correo ? u : null
  } catch {
    return null
  }
}

export type ResultadoUsuario =
  | { estado: 'ok'; usuario: UsuarioApp }
  | { estado: 'sin-acceso'; motivo: string }
  /** No se pudo consultar (sin señal / error) y no hay copia: se deja capturar para no frenar el trabajo de campo. */
  | { estado: 'desconocido' }

/**
 * Busca el correo en la lista Usuarios. Con conexión confirma contra SharePoint y guarda la copia;
 * sin conexión usa la última copia guardada en el celular.
 */
/** Tolera tildes y mayúsculas en la columna Rol ("Técnico", "ADMINISTRADOR"…). */
function normalizarRol(r: string): string {
  const k = (r || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  return k === 'tecnico' ? 'Tecnico' : k === 'administrador' ? 'Administrador' : k === 'asociado' ? 'Asociado' : r
}

function evaluar(u: UsuarioApp): ResultadoUsuario {
  if (!u.activo) return { estado: 'sin-acceso', motivo: 'Su usuario está inactivo en la app de inspección pulmonar. Contacte al administrador.' }
  if (u.rol !== 'Administrador' && u.rol !== 'Tecnico') {
    return { estado: 'sin-acceso', motivo: 'Esta cuenta es de consulta: los resultados se ven en el Score Pulmonar de su sitio Tu.HUB. La captura es solo para técnicos.' }
  }
  return { estado: 'ok', usuario: u }
}

/** Solo con la copia del celular (instantáneo, sin red). */
export function usuarioLocal(correo: string): ResultadoUsuario {
  const u = usuarioGuardado((correo || '').toLowerCase())
  return u ? evaluar(u) : { estado: 'desconocido' }
}

export async function resolverUsuario(correo: string): Promise<ResultadoUsuario> {
  correo = (correo || '').toLowerCase()
  if (navigator.onLine) {
    try {
      const todos = await listarUsuarios(true)
      const sp = todos.find((u) => u.Correo === correo)
      if (!sp) {
        try { localStorage.removeItem(KEY_USUARIO) } catch { /* nada */ }
        return { estado: 'sin-acceso', motivo: `La cuenta ${correo} no está registrada en la app de inspección pulmonar. Pida al administrador que la agregue en Usuarios.` }
      }
      const u: UsuarioApp = {
        correo,
        nombre: sp.Title,
        rol: normalizarRol(sp.Rol),
        asociados: sp.Asociados.split(';').map((s) => s.trim()).filter(Boolean),
        activo: sp.Activo,
      }
      try { localStorage.setItem(KEY_USUARIO, JSON.stringify(u)) } catch { /* nada */ }
      return evaluar(u)
    } catch (e) {
      console.warn('No se pudo verificar el usuario en SharePoint:', (e as Error).message)
    }
  }
  return usuarioLocal(correo)
}
