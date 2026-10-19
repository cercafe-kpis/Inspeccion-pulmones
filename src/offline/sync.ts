import { haySesionMicrosoft } from '../auth/msal'
import type { ErrorTipado } from '../graph/errores'
import { guardarSP, yaExisteEnSP } from '../graph/inspecciones'
import { estado } from '../state'
import { actualizarSyncBar, mostrarProgresoSync, pintarVersion, showToast } from '../ui/avisos'
import { leerCola, marcarFalloEnCola, quitarDeCola, type ItemCola } from './cola'

/**
 * Sube a SharePoint los registros de la cola local, uno por uno (misma lógica que la versión anterior):
 *  · cada registro se quita de la cola SOLO cuando SharePoint confirma;
 *  · los "dudosos" (subida cortada sin respuesta) se verifican primero para no duplicarlos;
 *  · todas las llamadas tienen tiempo máximo;
 *  · modo silencioso (automático): nunca abre popups; si la sesión venció lo dice en la barra.
 */
export async function sincronizarPendientes(opts?: { silencioso?: boolean }) {
  const silencioso = !!opts?.silencioso
  if (estado.sincronizando) return
  if (!leerCola().length) {
    if (!silencioso) showToast('No hay registros pendientes', 'ok', 3000)
    return
  }
  if (!navigator.onLine) {
    if (!silencioso) showToast('Sin conexión — los datos siguen guardados en el celular', 'err', 4500)
    return
  }

  estado.sincronizando = true
  if (!silencioso) estado.necesitaLogin = false // el toque manual sí puede abrir el popup de login
  let ok = 0, corte: string | null = null, ultimoError = ''
  const intentados = new Set<ItemCola['id']>()
  const cacheSP = new Map<string, Set<number>>()
  try {
    let item: ItemCola | undefined
    while ((item = leerCola().find((i) => !intentados.has(i.id)))) {
      intentados.add(item.id)
      const total = intentados.size + leerCola().filter((i) => !intentados.has(i.id)).length
      mostrarProgresoSync(intentados.size, total)
      try {
        // "Dudoso" = una subida anterior se cortó sin respuesta. También los registros de versiones
        // muy viejas de la app (id numérico), que pudieron quedar a medio subir.
        if (item.dudoso || typeof item.id === 'number') {
          if (await yaExisteEnSP(item.fields, silencioso, cacheSP)) {
            quitarDeCola(item.id)
            ok++
            continue
          }
        }
        await guardarSP(item.fields, silencioso)
        quitarDeCola(item.id)
        ok++
      } catch (e) {
        const err = e as ErrorTipado
        ultimoError = err.message
        marcarFalloEnCola(item.id, err)
        // Sin red o sin sesión todos los demás fallarían igual: parar.
        if (err.tipo === 'red' || err.tipo === 'auth') { corte = err.tipo; break }
      }
    }
  } finally {
    estado.sincronizando = false
  }

  const quedan = leerCola().length
  if (ok > 0) { estado.necesitaLogin = false; estado.avisoAuthMostrado = false }
  if (corte === 'auth') estado.necesitaLogin = true
  actualizarSyncBar()

  if (quedan === 0) {
    showToast(`✓ ${ok} registro${ok > 1 ? 's' : ''} subido${ok > 1 ? 's' : ''} a SharePoint. Ya no hay pendientes.`, 'ok', 7000)
  } else if (corte === 'auth') {
    if (!silencioso || !estado.avisoAuthMostrado) {
      estado.avisoAuthMostrado = true
      showToast(`⚠️ Quedan ${quedan} pendiente${quedan > 1 ? 's' : ''} en el celular: ${ultimoError}`, 'err', 9000)
    }
  } else if (corte === 'red') {
    if (!silencioso) showToast(`Sin conexión estable — quedan ${quedan} pendiente${quedan > 1 ? 's' : ''} en el celular. Se reintentará solo.`, 'warn', 6000)
  } else {
    showToast(`${ok} subido${ok === 1 ? '' : 's'}, quedan ${quedan} pendiente${quedan > 1 ? 's' : ''}: ${ultimoError}`, 'err', 9000)
  }
}

/** Intento automático (sin interacción): al abrir la app, al volver la señal, al volver a primer plano y cada 30 s. */
export function autoSincronizar() {
  if (estado.sincronizando || estado.necesitaLogin || !navigator.onLine || !haySesionMicrosoft()) return
  if (!leerCola().length) return
  sincronizarPendientes({ silencioso: true })
}

/** Engancha los eventos de conexión / visibilidad y el reintento periódico. Se llama una vez al arrancar. */
export function iniciarSincronizacionAutomatica(alVolverLaRed: () => void) {
  window.addEventListener('online', () => {
    pintarVersion()
    document.getElementById('offline-bar')!.classList.remove('on')
    alVolverLaRed()
    if (leerCola().length > 0) {
      estado.necesitaLogin = false // volvió la red: reintentar aunque antes hubiera fallado
      showToast('Conexión restaurada — subiendo pendientes…', 'ok', 3500)
      setTimeout(autoSincronizar, 1500)
    }
  })
  window.addEventListener('offline', () => {
    pintarVersion()
    document.getElementById('offline-bar')!.classList.add('on')
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      actualizarSyncBar()
      setTimeout(autoSincronizar, 800)
    }
  })
  setInterval(autoSincronizar, 30000)
}
