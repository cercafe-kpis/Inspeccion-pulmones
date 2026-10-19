import { APP_VERSION } from '../config'
import { leerCola } from '../offline/cola'
import { estado } from '../state'

/** Notificación breve abajo de la pantalla (2,2 s por defecto, 5 s si es error, o `ms`). */
export function showToast(msg: string, tipo?: 'ok' | 'err' | 'warn', ms?: number) {
  const t = document.getElementById('toast') as HTMLElement & { _t?: ReturnType<typeof setTimeout> }
  t.textContent = msg
  t.className = 'toast on ' + (tipo || 'ok')
  clearTimeout(t._t)
  t._t = setTimeout(() => (t.className = 'toast'), ms || (tipo === 'err' ? 5000 : 2200))
}

/** Pie de página: versión de la app, pendientes en este celular y estado de conexión. */
export function pintarVersion() {
  const n = leerCola().length
  const txt = `Versión ${APP_VERSION} · ${n} pendiente${n === 1 ? '' : 's'} en este celular · ${navigator.onLine ? 'con conexión' : 'sin conexión'}`
  document.querySelectorAll('.ver-info').forEach((e) => (e.textContent = txt))
}

/** Pinta la barra azul/ámbar y el contador de la pantalla de captura según lo que haya en la cola. */
export function actualizarSyncBar() {
  pintarVersion()
  if (estado.sincronizando) return // durante la sincronización se muestra el progreso
  const n = leerCola().length
  const syncBar = document.getElementById('sync-bar')!
  const pill = document.getElementById('c-pend')
  if (n > 0) {
    const pl = n > 1
    syncBar.textContent = estado.necesitaLogin
      ? `⚠️ ${n} registro${pl ? 's' : ''} guardado${pl ? 's' : ''} en este celular SIN subir — toque aquí para iniciar sesión y subir${pl ? 'los' : 'lo'}`
      : `↑ ${n} registro${pl ? 's' : ''} pendiente${pl ? 's' : ''} de subir a SharePoint — toque para sincronizar ahora`
    syncBar.classList.toggle('warn', estado.necesitaLogin)
    syncBar.classList.add('on')
    if (pill) { pill.textContent = `↑ ${n} pendiente${pl ? 's' : ''}`; pill.style.display = 'inline-block' }
  } else {
    syncBar.classList.remove('on', 'warn')
    if (pill) pill.style.display = 'none'
  }
}

/** Aviso en la pantalla de login cuando hay registros guardados en el celular sin subir. */
export function mostrarPendientesLogin() {
  const el = document.getElementById('login-pend')
  if (!el) return
  const n = leerCola().length
  if (n > 0) {
    el.textContent = `⚠️ Hay ${n} registro${n > 1 ? 's' : ''} guardado${n > 1 ? 's' : ''} en este celular sin subir a SharePoint. Inicie sesión con conexión a internet y se subirán automáticamente. No borre los datos del navegador.`
    el.style.display = 'block'
  } else {
    el.style.display = 'none'
  }
}

/** Muestra "Sincronizando k de N…" en la barra mientras se sube la cola. */
export function mostrarProgresoSync(k: number, n: number) {
  const syncBar = document.getElementById('sync-bar')!
  syncBar.textContent = `⟳ Sincronizando ${k} de ${n}…`
  syncBar.classList.remove('warn')
  syncBar.classList.add('on')
  const pill = document.getElementById('c-pend')
  if (pill) { pill.textContent = `⟳ ${k}/${n}`; pill.style.display = 'inline-block' }
}

/** Cambia de pantalla (s-sesion / s-captura / s-admin). */
export function showScreen(id: string) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'))
  document.getElementById(id)!.classList.add('on')
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
}
