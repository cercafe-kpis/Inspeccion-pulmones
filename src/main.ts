import './styles.css'
import type { AccountInfo } from '@azure/msal-browser'
import { loginPopup, logout, restaurarCuenta } from './auth/msal'
import { refrescarGranjas, resolverUsuario, usuarioLocal, type ResultadoUsuario } from './catalogos/catalogoLocal'
import { abrirAdmin, admTab, cerrarAdmin, esAdministrador } from './features/admin/admin'
import { guardarYSiguiente, saltarAnimal } from './features/captura/captura'
import { abrirG, buildHallazgos, buildLobulos, filtrarG, iniciarBuscadorGranja } from './features/captura/formulario'
import { actualizarOrdenSugerido, iniciarSesion, irSesion, onConsecInput, revisarSesionPendiente } from './features/captura/sesion'
import { autoSincronizar, iniciarSincronizacionAutomatica, sincronizarPendientes } from './offline/sync'
import { estado } from './state'
import { actualizarSyncBar, mostrarPendientesLogin, pintarVersion, showToast } from './ui/avisos'
import { fechaLocalHoy } from './utils/madec'

/**
 * Punto de entrada. El HTML (index.html) es el mismo de antes y sigue usando onclick="..." en los
 * botones; por eso las funciones que llama el HTML se publican en `window` al final de este archivo.
 */

/* ── Login / mostrar la app ── */

async function doLogin() {
  try {
    showApp(await loginPopup())
  } catch (e) {
    showToast('Error: ' + (e as Error).message, 'err')
  }
}

function doLogout() {
  if (!logout()) {
    document.getElementById('s-login')!.style.display = 'flex'
    document.getElementById('app')!.style.display = 'none'
  }
}

/** Bloquea la app cuando la cuenta no tiene acceso a la captura (no está en Usuarios, inactiva o es de consulta). */
function bloquear(motivo: string) {
  document.getElementById('app')!.style.display = 'none'
  document.getElementById('s-login')!.style.display = 'flex'
  const el = document.getElementById('login-acceso')!
  el.innerHTML = ''
  el.append(document.createTextNode('⛔ ' + motivo + ' '))
  const salir = document.createElement('button')
  salir.className = 'btn-sm'
  salir.style.marginTop = '8px'
  salir.textContent = 'Salir e iniciar con otra cuenta'
  salir.onclick = doLogout
  el.append(document.createElement('br'), salir)
  el.style.display = 'block'
}

/** Aplica el resultado de la verificación de usuario. Devuelve true si puede seguir. */
function aplicarUsuario(r: ResultadoUsuario): boolean {
  if (r.estado === 'sin-acceso') { bloquear(r.motivo); return false }
  if (r.estado === 'ok') estado.usuario = r.usuario
  document.getElementById('btn-admin')!.style.display = esAdministrador() ? '' : 'none'
  return true
}

/**
 * Muestra la app ya autenticada (igual que antes) y, además:
 *  - verifica la cuenta en la lista Usuarios (primero con la copia del celular, luego con SharePoint);
 *  - actualiza la copia de granjas activas;
 *  - muestra "Administrar" solo al Rol Administrador.
 */
async function showApp(acc: AccountInfo) {
  document.getElementById('login-acceso')!.style.display = 'none'
  document.getElementById('s-login')!.style.display = 'none'
  document.getElementById('app')!.style.display = 'block'
  const name = (acc as AccountInfo & { displayName?: string }).displayName || acc.name || 'Usuario'
  document.getElementById('uname')!.textContent = name
  document.getElementById('av')!.textContent = name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  ;(document.getElementById('s_fecha') as HTMLInputElement).value = fechaLocalHoy()
  estado.necesitaLogin = false
  document.getElementById('offline-bar')!.classList.toggle('on', !navigator.onLine)
  actualizarSyncBar()
  setTimeout(autoSincronizar, 1000)

  const correo = acc.username || ''
  const previo = usuarioLocal(correo)
  // Con copia buena (o sin copia todavía) se sigue de inmediato: nunca frenar la captura en campo esperando la red.
  const siguioDeInmediato = previo.estado !== 'sin-acceso' && aplicarUsuario(previo)
  if (siguioDeInmediato) revisarSesionPendiente()

  refrescarGranjas()
  const r = await resolverUsuario(correo)
  if (r.estado === 'desconocido' && previo.estado === 'sin-acceso') { aplicarUsuario(previo); return }
  if (!aplicarUsuario(r)) return
  if (!siguioDeInmediato) revisarSesionPendiente()
}

/* ── Arranque ── */

window.addEventListener('DOMContentLoaded', async () => {
  // La versión anterior de la app consultaba la API de GitHub en cada apertura para recargarse; ya no
  // hace falta (el service worker nuevo se actualiza solo). Se limpia su marca y la caché vieja.
  try { localStorage.removeItem('_dash_pulmon_sha') } catch { /* nada */ }
  if ('caches' in window) caches.delete('inspeccion-pulmones-v2').catch(() => {})

  buildLobulos()
  buildHallazgos()
  iniciarBuscadorGranja()
  pintarVersion()
  mostrarPendientesLogin()
  iniciarSincronizacionAutomatica(() => { refrescarGranjas() })
  const cuenta = await restaurarCuenta()
  if (cuenta) showApp(cuenta)
})

/*
 * Service worker (sw.js, generado en el build). Cuando se publica una versión nueva, el celular la
 * descarga sola; la página se recarga para usarla SOLO si no hay un animal a medio capturar
 * (si está en la pantalla de captura, espera a que salga de ella o vuelva a abrir la app).
 */
if ('serviceWorker' in navigator) {
  let recargaPendiente = false
  const capturando = () => document.getElementById('s-captura')?.classList.contains('on') && document.getElementById('app')?.style.display === 'block'
  const recargarSiSePuede = () => { if (recargaPendiente && !capturando()) location.reload() }
  const habiaControlador = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador) return // primera instalación: nada que recargar
    recargaPendiente = true
    recargarSiSePuede()
  })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recargarSiSePuede() })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      setInterval(() => { if (navigator.onLine) reg.update().catch(() => {}) }, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {})
      })
    }).catch((e) => console.log('SW error:', e))
  })
  // Al terminar un lote ("← Cambiar granja") también se aprovecha para actualizar.
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.cap-sub .btn-sm')) setTimeout(recargarSiSePuede, 300)
  })
}

/* ── Funciones que llama el HTML (onclick / oninput) ── */
Object.assign(window, {
  doLogin, doLogout,
  sincronizarPendientes: () => sincronizarPendientes(),
  filtrarG, abrirG, onConsecInput, actualizarOrdenSugerido,
  iniciarSesion, irSesion, guardarYSiguiente, saltarAnimal,
  abrirAdmin, cerrarAdmin, admTab,
})
