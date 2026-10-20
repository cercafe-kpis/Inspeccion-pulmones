import { abrirAdmin } from '../features/admin/admin'
import { estado, vistasPermitidas, type Vista } from '../state'
import { showScreen, showToast } from './avisos'

/**
 * Pestañas Captura · Resultados · Administrar según el rol (lista Usuarios):
 *   Administrador → las tres · Tecnico → Captura y Resultados · Asociado → solo Resultados.
 * Si la persona tiene una sola pantalla, la barra de pestañas no se muestra.
 */

let vistaActual: Vista = 'captura'
const BADGE: Record<Vista, string> = { captura: 'CAPTURA', resultados: 'RESULTADOS', admin: 'ADMINISTRAR' }

export function pintarNav() {
  const vistas = vistasPermitidas(estado.usuario)
  const nav = document.getElementById('nav-vistas')!
  nav.style.display = vistas.length > 1 ? 'flex' : 'none'
  nav.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const v = b.dataset.vista as Vista
    b.style.display = vistas.includes(v) ? '' : 'none'
    b.classList.toggle('on', v === vistaActual)
  })
  document.getElementById('hdr-badge')!.textContent = BADGE[vistaActual]
}

export function vistaVisible(): Vista { return vistaActual }

export async function irA(v: Vista) {
  if (!vistasPermitidas(estado.usuario).includes(v)) return
  vistaActual = v
  pintarNav()
  if (v === 'captura') {
    showScreen(estado.sesion?.gId ? 's-captura' : 's-sesion')
  } else if (v === 'admin') {
    await abrirAdmin()
  } else {
    showScreen('s-resultados')
    try {
      // La parte de Resultados se descarga solo cuando alguien la abre (la captura sigue liviana en el celular).
      const m = await import('../features/resultados/resultados')
      await m.abrirResultados()
    } catch (e) {
      showToast('No se pudo abrir Resultados: ' + (e as Error).message, 'err', 6000)
    }
  }
}
