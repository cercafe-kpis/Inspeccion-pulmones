import { LOBULOS } from '../../catalogos/datos'
import { listarAsociados, listarGranjas, listarUsuarios, type AsociadoSP } from '../../graph/catalogos'
import type { UsuarioApp } from '../../state'
import { cargarInspecciones, type Registro } from './cacheInspecciones'

/**
 * Datos de Resultados: inspecciones (con copia en el navegador) + catálogos, y el ALCANCE de la
 * cuenta (qué asociados puede ver), que sale de la lista Usuarios — no de la URL.
 */

/** Un cerdo inspeccionado, ya normalizado (los Sí/No de SharePoint llegan como true/1/'true'). */
export interface Fila {
  granja: string
  consec: string
  fecha: string // YYYY-MM-DD
  cat: number
  consol: number
  gdp: number
  pleurL: boolean; pleurS: boolean; peri: boolean
  nint: boolean; absc: boolean; nodu: boolean; manc: boolean
  agua: boolean; sang: boolean; pete: boolean
  lob: Record<string, number>
  asociado: string
}

export interface Catalogo {
  vista: Record<string, string> // granja_nombre → nombre a mostrar
  asociadoDe: Record<string, string> // granja_nombre → código de asociado
  asociados: AsociadoSP[]
  /** Códigos que se muestran dentro de otro (de la lista Usuarios: "CERDOS DEL OTUN;LM" → CDO incluye LM). */
  extra: Record<string, string[]>
}

const si = (v: unknown) => v === true || v === 1 || v === 'true'
const num = (v: unknown) => parseFloat(String(v ?? '')) || 0

function normalizar(r: Registro, asociadoDe: Record<string, string>): Fila {
  const granja = String(r.granja_nombre || 'Sin granja')
  const lob: Record<string, number> = {}
  LOBULOS.forEach((l) => (lob[l.id] = num(r[l.id])))
  return {
    granja,
    consec: String(r.consecutivo || '—'),
    fecha: r.fecha_inspeccion ? String(r.fecha_inspeccion).split('T')[0] : '',
    cat: parseInt(String(r.categoria)) || 0,
    consol: num(r.consolidacion_total),
    gdp: num(r.perdida_gdp_kg),
    pleurL: si(r.pleuritis_leve), pleurS: si(r.pleuritis_severa), peri: si(r.pericarditis),
    nint: si(r.neumonia_intersticial), absc: si(r.absceso_pulmon), nodu: si(r.nodulo_pulmon), manc: si(r.manchas_leche),
    agua: si(r.artefacto_agua), sang: si(r.artefacto_sangre), pete: si(r.petequias),
    lob,
    asociado: asociadoDe[granja.toUpperCase()] || '',
  }
}

export async function cargarDatos(): Promise<{ filas: Fila[]; cat: Catalogo }> {
  const [granjas, asociados, usuarios, insp] = await Promise.all([listarGranjas(), listarAsociados(), listarUsuarios(), cargarInspecciones()])
  const vista: Record<string, string> = {}
  const asociadoDe: Record<string, string> = {}
  granjas.forEach((g) => { vista[g.Title] = g.NombreVista || g.Title; if (g.Asociado) asociadoDe[g.Title] = g.Asociado })
  const extra: Record<string, string[]> = {}
  usuarios.filter((u) => u.Activo && /^asociado$/i.test(u.Rol.trim())).forEach((u) => {
    const [p, ...resto] = u.Asociados.split(';').map((x) => x.trim()).filter(Boolean)
    if (p && resto.length) extra[p] = [...new Set([...(extra[p] || []), ...resto])]
  })
  // Sin duplicados (mismo criterio de antes: id de SharePoint, o granja + consecutivo + orden)
  const vistos = new Set<string>()
  const filas: Fila[] = []
  for (const r of insp.datos) {
    const k = r._spId || `${r.granja_nombre}|${r.consecutivo}|${r.orden}`
    if (vistos.has(k)) continue
    vistos.add(k)
    filas.push(normalizar(r, asociadoDe))
  }
  return { filas, cat: { vista, asociadoDe, asociados, extra } }
}

export interface Alcance {
  /** null = todas las granjas (con filtro de asociado disponible). */
  codigos: Set<string> | null
  /** Asociado "principal" (para el título y el botón Tu.HUB). */
  principal: string | null
  tuHub: string | null
  vistaPrevia: boolean
}

/**
 * Asociado → solo sus códigos. Administrador con ?site=XXX → vista previa como ese asociado.
 * Administrador / Tecnico → todo.
 */
export function calcularAlcance(u: UsuarioApp | null, cat: Catalogo, siteParam: string): Alcance {
  const tuHubDe = (c: string | null) => (c && cat.asociados.find((a) => a.Title === c)?.SitioTuHub) || null
  const conExtras = (c: string) => new Set([c, ...(cat.extra[c] || [])])
  if (u?.rol === 'Asociado') {
    const [p, ...resto] = u.asociados
    const set = new Set([...u.asociados, ...resto.flatMap((c) => cat.extra[c] || []), ...(cat.extra[p] || [])])
    return { codigos: set, principal: p, tuHub: tuHubDe(p), vistaPrevia: false }
  }
  if (u?.rol === 'Administrador' && siteParam) {
    const a = cat.asociados.find((x) => x.ParametroSite.toUpperCase() === siteParam.toUpperCase())
    if (a) return { codigos: conExtras(a.Title), principal: a.Title, tuHub: tuHubDe(a.Title), vistaPrevia: true }
  }
  return { codigos: null, principal: null, tuHub: null, vistaPrevia: false }
}

/** Códigos que incluye un filtro de asociado elegido por el administrador (con sus grupos extra). */
export function codigosDeFiltro(cat: Catalogo, codigo: string): Set<string> {
  return new Set([codigo, ...(cat.extra[codigo] || [])])
}
