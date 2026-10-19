/**
 * Estado compartido de la app (antes eran variables globales sueltas en index.html).
 * Se agrupa aquí para que todos los módulos lean y escriban el mismo objeto.
 */

export interface SesionCaptura {
  fecha: string
  gId: number
  gN: string
  consec: string
  orden: number
}

export interface UsuarioApp {
  correo: string
  nombre: string
  rol: 'Administrador' | 'Tecnico' | 'Asociado' | string
  asociados: string[]
  activo: boolean
}

export const estado = {
  sesion: {} as SesionCaptura,
  lobVals: {} as Record<string, number | null>,
  hallVals: {} as Record<string, 0 | 1>,
  registrados: 0,
  /** true cuando la sesión de Microsoft venció y hace falta que el técnico toque para iniciar sesión. */
  necesitaLogin: false,
  avisoAuthMostrado: false,
  /** evita que dos sincronizaciones concurrentes dupliquen registros en SharePoint. */
  sincronizando: false,
  /** Usuario de la lista Usuarios (null mientras no se sepa). */
  usuario: null as UsuarioApp | null,
}
