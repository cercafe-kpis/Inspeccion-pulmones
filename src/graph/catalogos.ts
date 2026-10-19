import { LISTAS } from '../config'
import { actualizarItem, crearItem, listarTodo } from './client'

/**
 * Listas de configuración (ver docs/sharepoint-listas-guia.html):
 *   Asociados: Title (código), Nombre, ParametroSite, SitioTuHub, Activo
 *   Granjas:   Title (nombre interno = granja_nombre), IdGranja (= granja_id), NombreVista, Asociado (código), Activa
 *   Usuarios:  Title (nombre), Correo, Rol (Administrador | Tecnico | Asociado), Asociados (códigos separados por ;), Activo
 */

export interface GranjaSP { spId: string; Title: string; IdGranja: number; NombreVista: string; Asociado: string; Activa: boolean }
export interface AsociadoSP { spId: string; Title: string; Nombre: string; ParametroSite: string; SitioTuHub: string; Activo: boolean }
export interface UsuarioSP { spId: string; Title: string; Correo: string; Rol: string; Asociados: string; Activo: boolean }

const txt = (v: unknown) => (v == null ? '' : String(v)).trim()
/** Sí/No de SharePoint: si la columna está vacía en un ítem viejo, se toma como "Sí". */
const bool = (v: unknown) => v === undefined || v === null ? true : v === true || v === 'true' || v === 1

export async function listarGranjas(silencioso?: boolean): Promise<GranjaSP[]> {
  const items = await listarTodo<Record<string, unknown>>(LISTAS.GRANJAS, '$expand=fields&$top=999', silencioso)
  return items
    .map((i) => ({
      spId: i.id,
      Title: txt(i.fields.Title).toUpperCase(),
      IdGranja: parseInt(txt(i.fields.IdGranja)) || 0,
      NombreVista: txt(i.fields.NombreVista),
      Asociado: txt(i.fields.Asociado),
      Activa: bool(i.fields.Activa),
    }))
    .filter((g) => g.Title && g.IdGranja)
    .sort((a, b) => a.IdGranja - b.IdGranja)
}

export async function listarAsociados(silencioso?: boolean): Promise<AsociadoSP[]> {
  const items = await listarTodo<Record<string, unknown>>(LISTAS.ASOCIADOS, '$expand=fields&$top=999', silencioso)
  return items
    .map((i) => ({
      spId: i.id,
      Title: txt(i.fields.Title),
      Nombre: txt(i.fields.Nombre),
      ParametroSite: txt(i.fields.ParametroSite),
      SitioTuHub: txt(i.fields.SitioTuHub),
      Activo: bool(i.fields.Activo),
    }))
    .filter((a) => a.Title)
    .sort((a, b) => a.Title.localeCompare(b.Title, 'es'))
}

export async function listarUsuarios(silencioso?: boolean): Promise<UsuarioSP[]> {
  const items = await listarTodo<Record<string, unknown>>(LISTAS.USUARIOS, '$expand=fields&$top=999', silencioso)
  return items
    .map((i) => ({
      spId: i.id,
      Title: txt(i.fields.Title),
      Correo: txt(i.fields.Correo).toLowerCase(),
      Rol: txt(i.fields.Rol),
      Asociados: txt(i.fields.Asociados),
      Activo: bool(i.fields.Activo),
    }))
    .filter((u) => u.Correo)
    .sort((a, b) => a.Title.localeCompare(b.Title, 'es'))
}

type Campos<T> = Omit<T, 'spId'>

export const guardarGranja = (g: Campos<GranjaSP>, spId?: string) =>
  spId ? actualizarItem(LISTAS.GRANJAS, spId, g) : crearItem(LISTAS.GRANJAS, g, false, 'guardar').then(() => undefined)
export const guardarAsociado = (a: Campos<AsociadoSP>, spId?: string) =>
  spId ? actualizarItem(LISTAS.ASOCIADOS, spId, a) : crearItem(LISTAS.ASOCIADOS, a, false, 'guardar').then(() => undefined)
export const guardarUsuario = (u: Campos<UsuarioSP>, spId?: string) =>
  spId ? actualizarItem(LISTAS.USUARIOS, spId, u) : crearItem(LISTAS.USUARIOS, u, false, 'guardar').then(() => undefined)
