import { obtenerOrdenesExistentes } from '../../graph/inspecciones'
import { ordenesLocalesPendientes } from '../../offline/cola'
import { estado, type SesionCaptura } from '../../state'
import { showScreen, showToast } from '../../ui/avisos'
import { resetAnimal } from './captura'

/* ══ SUGERENCIA AUTOMÁTICA DE "ORDEN INICIAL" ══
   Cuando un lote se inspecciona en varios momentos, se calcula en qué # de orden va, combinando:
     1) SharePoint (ya sincronizado, requiere señal)
     2) Cola local de pendientes (vive en el celular)
     3) Caché de la última consulta exitosa (respaldo sin señal)
     4) NUEVO: último orden capturado en ESTE celular para ese lote, aunque ya se haya subido.
        Es el refuerzo del incidente del 15-oct (lote en curso que reinició en 1 tras volver a
        iniciar sesión): si SharePoint responde menos de lo que este celular ya capturó, manda el celular. */

const ORDEN_CACHE_KEY = 'insp_pulmones_orden_cache'
const ULTIMO_LOCAL_KEY = 'insp_pulmones_ultimo_local'
const SESION_ACTIVA_KEY = 'insp_pulmones_sesion_activa'
const DIAS_RECORDAR = 45

interface CacheOrden { maxOrden: number; count: number; ts: number }

function leerJSON<T>(k: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(k) || '') as T } catch { return def }
}

function leerCacheOrden(gId: number | string, consec: string): CacheOrden | null {
  return leerJSON<Record<string, CacheOrden>>(ORDEN_CACHE_KEY, {})[`${gId}|${consec}`] || null
}
function guardarCacheOrden(gId: number | string, consec: string, data: CacheOrden) {
  const c = leerJSON<Record<string, CacheOrden>>(ORDEN_CACHE_KEY, {})
  c[`${gId}|${consec}`] = data
  try { localStorage.setItem(ORDEN_CACHE_KEY, JSON.stringify(c)) } catch { /* nada */ }
}

/** Anota el último orden capturado en este celular para un lote (se llama al guardar cada animal). */
export function anotarUltimoLocal(gId: number, consec: string, orden: number) {
  const c = leerJSON<Record<string, { orden: number; ts: number }>>(ULTIMO_LOCAL_KEY, {})
  const k = `${gId}|${consec}`
  const limite = Date.now() - DIAS_RECORDAR * 864e5
  for (const key of Object.keys(c)) if (c[key].ts < limite) delete c[key]
  if (!c[k] || orden > c[k].orden) c[k] = { orden, ts: Date.now() }
  else c[k].ts = Date.now()
  try { localStorage.setItem(ULTIMO_LOCAL_KEY, JSON.stringify(c)) } catch { /* nada */ }
}
function ultimoLocal(gId: number | string, consec: string): number | null {
  const e = leerJSON<Record<string, { orden: number; ts: number }>>(ULTIMO_LOCAL_KEY, {})[`${gId}|${consec}`]
  return e ? e.orden : null
}

/* ══ REANUDAR CAPTURA SIN TERMINAR ══ */

export function guardarSesionActiva() {
  try { localStorage.setItem(SESION_ACTIVA_KEY, JSON.stringify(estado.sesion)) } catch { /* nada */ }
}
function leerSesionActiva(): SesionCaptura | null {
  const s = leerJSON<SesionCaptura | null>(SESION_ACTIVA_KEY, null)
  if (!s || !s.gId || !s.consec || !s.orden) return null
  return s
}
function borrarSesionActiva() {
  try { localStorage.removeItem(SESION_ACTIVA_KEY) } catch { /* nada */ }
}

function pintarCabeceraCaptura() {
  document.getElementById('c-granja')!.textContent = estado.sesion.gN
  document.getElementById('c-consec')!.textContent = '#' + estado.sesion.consec
  document.getElementById('c-fecha')!.textContent = estado.sesion.fecha
}

/** Al mostrar la app: si hay una captura sin terminar en este celular, ofrece continuarla. */
export async function revisarSesionPendiente() {
  const s = leerSesionActiva()
  if (!s) return
  const continuar = confirm(
    `Tienes una captura sin terminar:\n\n` +
      `Granja: ${s.gN}\nConsecutivo: ${s.consec}\nÚltimo pulmón guardado: ${s.orden - 1}\n\n` +
      `Presiona "Aceptar" para continuar en el pulmón ${s.orden}, o "Cancelar" para descartarla y empezar un consecutivo nuevo.`,
  )
  if (!continuar) { borrarSesionActiva(); return }

  estado.sesion = { ...s }
  estado.registrados = 0

  if (navigator.onLine) {
    try {
      const todos = [...(await obtenerOrdenesExistentes(estado.sesion.gId, estado.sesion.consec)), ...ordenesLocalesPendientes(estado.sesion.gId, estado.sesion.consec)]
      if (todos.length) {
        const maxOrden = Math.max(...todos)
        if (maxOrden >= estado.sesion.orden) {
          estado.sesion.orden = maxOrden + 1
          showToast('Se ajustó el orden a ' + estado.sesion.orden + ' según SharePoint', 'ok')
        }
      }
    } catch (e) {
      console.warn('No se pudo reverificar el lote al reanudar:', (e as Error).message)
    }
  }

  guardarSesionActiva()
  pintarCabeceraCaptura()
  resetAnimal()
  showScreen('s-captura')
}

/** Botón "← Cambiar granja": termina el lote y deja el formulario de sesión limpio. */
export function irSesion() {
  borrarSesionActiva()
  ;(document.getElementById('s_gsearch') as HTMLInputElement).value = ''
  ;(document.getElementById('s_gid') as HTMLInputElement).value = ''
  ;(document.getElementById('s_gnombre') as HTMLInputElement).value = ''
  ;(document.getElementById('s_consec') as HTMLInputElement).value = ''
  ;(document.getElementById('s_inicio') as HTMLInputElement).value = '1'
  document.getElementById('s_inicio_hint')!.textContent = ''
  showScreen('s-sesion')
}

let ordenCheckTimer: ReturnType<typeof setTimeout> | null = null
let ordenCheckToken = 0 // evita que una respuesta vieja pise una consulta más reciente

/** oninput del consecutivo: espera 600 ms sin teclas y luego sugiere el orden. */
export function onConsecInput() {
  if (ordenCheckTimer) clearTimeout(ordenCheckTimer)
  ordenCheckTimer = setTimeout(actualizarOrdenSugerido, 600)
}

/** Calcula y escribe el valor sugerido en "Empezar en orden #", explicando de dónde salió. */
export async function actualizarOrdenSugerido() {
  if (ordenCheckTimer) { clearTimeout(ordenCheckTimer); ordenCheckTimer = null }
  const hint = document.getElementById('s_inicio_hint')!
  const inicioEl = document.getElementById('s_inicio') as HTMLInputElement
  hint.style.color = ''
  hint.style.fontWeight = ''
  const gId = (document.getElementById('s_gid') as HTMLInputElement).value
  const consec = (document.getElementById('s_consec') as HTMLInputElement).value.trim()
  if (!gId || !consec) { hint.textContent = ''; return }

  const pendientes = ordenesLocalesPendientes(gId, consec)
  const maxPendiente = pendientes.length ? Math.max(...pendientes) : null
  const ultLocal = ultimoLocal(gId, consec)

  if (!navigator.onLine) {
    const cacheEntry = leerCacheOrden(gId, consec)
    const candidatos: number[] = []
    if (cacheEntry) candidatos.push(cacheEntry.maxOrden)
    if (maxPendiente !== null) candidatos.push(maxPendiente)
    if (ultLocal !== null) candidatos.push(ultLocal)
    if (candidatos.length) {
      const maxFinal = Math.max(...candidatos)
      inicioEl.value = String(maxFinal + 1)
      const horaTxt = cacheEntry ? new Date(cacheEntry.ts).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
      hint.textContent =
        `Sin conexión — estimado con datos guardados en este dispositivo` +
        (horaTxt ? ` (última verificación en línea: ${horaTxt})` : '') +
        `. Se sugiere continuar en el orden ${maxFinal + 1}. Verifica en línea en cuanto tengas señal.`
    } else {
      hint.textContent = 'Sin conexión: no hay datos previos en este dispositivo para verificar el último orden de este consecutivo.'
    }
    return
  }

  const miToken = ++ordenCheckToken
  hint.textContent = 'Verificando último orden registrado...'
  try {
    const ordenesSP = await obtenerOrdenesExistentes(gId, consec)
    if (miToken !== ordenCheckToken) return
    const maxSP = ordenesSP.length ? Math.max(...ordenesSP) : 0
    guardarCacheOrden(gId, consec, { maxOrden: maxSP, count: ordenesSP.length, ts: Date.now() })

    const candidatos = [...ordenesSP]
    if (maxPendiente !== null) candidatos.push(maxPendiente)
    if (ultLocal !== null) candidatos.push(ultLocal)
    if (candidatos.length > 0) {
      const maxOrden = Math.max(...candidatos)
      inicioEl.value = String(maxOrden + 1)
      let msg = ordenesSP.length
        ? `Este consecutivo ya tiene ${ordenesSP.length} cerdo(s) sincronizados (hasta el orden ${maxSP}).`
        : `Este consecutivo aún no tiene cerdos sincronizados en SharePoint.`
      if (maxPendiente !== null && maxPendiente >= maxSP) msg += ` Además hay registros pendientes de sincronizar en este equipo hasta el orden ${maxPendiente}.`
      if (ultLocal !== null && ultLocal > maxSP && (maxPendiente === null || ultLocal > maxPendiente)) {
        msg += ` Este celular ya capturó este consecutivo hasta el orden ${ultLocal}.`
      }
      msg += ` Se continuará en el orden ${maxOrden + 1}.`
      hint.textContent = msg
    } else {
      inicioEl.value = '1'
      hint.textContent = 'Consecutivo nuevo: se iniciará en el orden 1.'
    }
  } catch (e) {
    if (miToken !== ordenCheckToken) return
    const cacheEntry = leerCacheOrden(gId, consec)
    const candidatos: number[] = []
    if (cacheEntry) candidatos.push(cacheEntry.maxOrden)
    if (maxPendiente !== null) candidatos.push(maxPendiente)
    if (ultLocal !== null) candidatos.push(ultLocal)
    hint.style.color = 'var(--red)'
    hint.style.fontWeight = '700'
    const m = (e as Error).message
    if (candidatos.length) {
      const maxFinal = Math.max(...candidatos)
      inicioEl.value = String(maxFinal + 1)
      hint.textContent = `⚠️ No se pudo verificar en línea (${m}) — usando datos guardados en este dispositivo. Se sugiere el orden ${maxFinal + 1}, pero VERIFICA antes de continuar.`
    } else {
      hint.textContent = `⚠️ No se pudo verificar el último orden (${m}). Revísalo manualmente antes de continuar — este consecutivo podría ya tener registros.`
    }
    console.warn('No se pudo verificar orden sugerido:', m)
  }
}

/** Botón "Iniciar captura →": valida, verifica duplicados y pasa a la pantalla de captura. */
export async function iniciarSesion() {
  const fecha = (document.getElementById('s_fecha') as HTMLInputElement).value
  const gId = (document.getElementById('s_gid') as HTMLInputElement).value
  const gN = (document.getElementById('s_gnombre') as HTMLInputElement).value
  const consec = (document.getElementById('s_consec') as HTMLInputElement).value.trim()
  const inicioEl = document.getElementById('s_inicio') as HTMLInputElement
  let inicio = parseInt(inicioEl.value) || 1

  if (!fecha) { showToast('Ingrese la fecha', 'err'); return }
  if (!gId) { showToast('Seleccione una granja', 'err'); return }
  if (!consec) { showToast('Ingrese el consecutivo', 'err'); return }

  const btn = document.querySelector('#s-sesion .btn-primary') as HTMLButtonElement
  const btnHtmlOriginal = btn.innerHTML

  // Lo que ya está en este celular: pendientes sin subir + último orden capturado aquí.
  const pendientesLocales = ordenesLocalesPendientes(gId, consec)
  const ultLocal = ultimoLocal(gId, consec)
  const localesConocidos = ultLocal !== null ? [...pendientesLocales, ultLocal] : pendientesLocales

  if (navigator.onLine) {
    btn.disabled = true
    btn.innerHTML = 'Verificando consecutivo existente...'
    let ordenesSP: number[] | null = null, fallo: Error | null = null
    try {
      ordenesSP = await obtenerOrdenesExistentes(gId, consec)
    } catch (e) {
      fallo = e as Error
      console.warn('No se pudo verificar duplicados antes de iniciar:', fallo.message)
    }
    btn.disabled = false
    btn.innerHTML = btnHtmlOriginal

    if (ordenesSP !== null) {
      const ordenesExistentes = [...ordenesSP, ...localesConocidos]
      if (ordenesExistentes.length > 0) {
        const maxOrden = Math.max(...ordenesExistentes)
        if (ordenesExistentes.includes(inicio) || inicio <= maxOrden) {
          const n = ordenesSP.length + pendientesLocales.length
          const continuar = confirm(
            `⚠️ El consecutivo ${consec} (${gN}) ya tiene ${n || 'varios'} cerdo(s) guardado(s) (en SharePoint o en este equipo), hasta el orden ${maxOrden}.\n\n` +
              `Si continúas desde el orden ${inicio}, vas a DUPLICAR registros que ya existen.\n\n` +
              `Presiona "Aceptar" para continuar automáticamente desde el orden ${maxOrden + 1} (recomendado), o "Cancelar" para revisar el consecutivo.`,
          )
          if (!continuar) return
          inicio = maxOrden + 1
          inicioEl.value = String(inicio)
        }
      }
    } else {
      // No se pudo verificar en SharePoint: avisar SIEMPRE (incidente de duplicados del 22/09).
      const cacheEntry = leerCacheOrden(gId, consec)
      const candidatosLocales = [...localesConocidos]
      if (cacheEntry) candidatosLocales.push(cacheEntry.maxOrden)
      const m = fallo?.message || ''
      if (candidatosLocales.length > 0) {
        const maxLocal = Math.max(...candidatosLocales)
        const continuar = confirm(
          `⚠️ No se pudo verificar en SharePoint si este consecutivo ya existe (${m}), pero según datos guardados en este equipo, el consecutivo ${consec} (${gN}) ya llegó hasta el orden ${maxLocal}.\n\n` +
            `Si continúas desde el orden ${inicio}, es muy probable que DUPLIQUES cerdos.\n\n` +
            `Presiona "Aceptar" para continuar desde el orden ${maxLocal + 1} (recomendado), o "Cancelar" para revisar tu conexión primero.`,
        )
        if (!continuar) return
        inicio = maxLocal + 1
        inicioEl.value = String(inicio)
      } else {
        const continuar = confirm(
          `⚠️ No se pudo verificar en SharePoint si el consecutivo ${consec} (${gN}) ya tiene registros guardados (${m}).\n\n` +
            `Si este consecutivo ya se capturó antes (por ejemplo, la app se cerró a mitad de camino) y continúas desde el orden ${inicio}, vas a DUPLICAR cerdos que ya existen.\n\n` +
            `Presiona "Cancelar" y revisa tu conexión antes de continuar, o "Aceptar" SOLO si estás seguro de que este es un consecutivo nuevo o de que el orden ${inicio} es correcto.`,
        )
        if (!continuar) return
      }
    }
  } else if (localesConocidos.length > 0) {
    const maxLocal = Math.max(...localesConocidos)
    if (localesConocidos.includes(inicio) || inicio <= maxLocal) {
      const continuar = confirm(
        `⚠️ Sin conexión — pero este equipo ya tiene cerdos de este consecutivo capturados, hasta el orden ${maxLocal}.\n\n` +
          `Si continúas desde el orden ${inicio}, vas a DUPLICAR esos registros.\n\n` +
          `Presiona "Aceptar" para continuar desde el orden ${maxLocal + 1} (recomendado), o "Cancelar" para revisar.`,
      )
      if (!continuar) return
      inicio = maxLocal + 1
      inicioEl.value = String(inicio)
    }
  }

  estado.sesion = { fecha, gId: parseInt(gId), gN, consec, orden: inicio }
  estado.registrados = 0
  guardarSesionActiva()
  pintarCabeceraCaptura()
  resetAnimal()
  showScreen('s-captura')
}
