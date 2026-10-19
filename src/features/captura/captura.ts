import { HALLAZGOS, LOBULOS } from '../../catalogos/datos'
import type { ErrorTipado } from '../../graph/errores'
import { guardarSP, type CamposInspeccion } from '../../graph/inspecciones'
import { agregarACola } from '../../offline/cola'
import { estado } from '../../state'
import { actualizarSyncBar, showToast } from '../../ui/avisos'
import { calcularIndicadores, nuevoIdLocal } from '../../utils/madec'
import { cancelarAvanceLobulo } from './formulario'
import { anotarUltimoLocal, guardarSesionActiva } from './sesion'

/** Limpia lóbulos y hallazgos para el siguiente animal y refresca el contador en pantalla. */
export function resetAnimal() {
  cancelarAvanceLobulo()
  LOBULOS.forEach((l) => {
    estado.lobVals[l.id] = null
    const el = document.getElementById('li-' + l.id) as HTMLInputElement | null
    if (el) { el.value = ''; el.classList.remove('has-val') }
  })
  HALLAZGOS.forEach((h) => {
    estado.hallVals[h.id] = 0
    const no = document.getElementById('no-' + h.id)
    const si = document.getElementById('si-' + h.id)
    if (no) no.className = 'no-on'
    if (si) si.className = ''
  })
  document.getElementById('c-orden')!.textContent = String(estado.sesion.orden)
  document.getElementById('c-count')!.textContent = estado.registrados + ' registrado' + (estado.registrados === 1 ? '' : 's')
}

/**
 * Botón "Guardar y siguiente →".
 * Regla de oro: el registro NUNCA se pierde. Si no se puede subir a SharePoint por CUALQUIER motivo,
 * queda en la cola del celular y se sube después automáticamente.
 */
export async function guardarYSiguiente() {
  const btn = document.getElementById('btn-next') as HTMLButtonElement
  btn.disabled = true
  btn.innerHTML = '<span class="spin"></span>'

  const { sesion, lobVals, hallVals } = estado
  const ind = calcularIndicadores(lobVals, hallVals)
  const fields: CamposInspeccion = {
    Title: `${sesion.gN}-${sesion.consec}-${sesion.orden}`,
    fecha_inspeccion: sesion.fecha,
    granja_id: sesion.gId,
    granja_nombre: sesion.gN,
    consecutivo: sesion.consec,
    orden: sesion.orden,
    // Lóbulos (0–100)
    apical_derecho: lobVals.apical_derecho || 0,
    cardiaco_derecho: lobVals.cardiaco_derecho || 0,
    diafragmatico_derecho: lobVals.diafragmatico_derecho || 0,
    apical_izquierdo: lobVals.apical_izquierdo || 0,
    cardiaco_izquierdo: lobVals.cardiaco_izquierdo || 0,
    diafragmatico_izquierdo: lobVals.diafragmatico_izquierdo || 0,
    accesorio: lobVals.accesorio || 0,
    // Hallazgos (true/false para SharePoint)
    cicatriz_en_pulmones: hallVals.cicatriz_en_pulmones === 1,
    pleuritis_leve: hallVals.pleuritis_leve === 1,
    pleuritis_severa: hallVals.pleuritis_severa === 1,
    neumonia_intersticial: hallVals.neumonia_intersticial === 1,
    absceso_pulmon: hallVals.absceso_pulmon === 1,
    nodulo_pulmon: hallVals.nodulo_pulmon === 1,
    pericarditis: hallVals.pericarditis === 1,
    manchas_leche: hallVals.manchas_leche === 1,
    artefacto_agua: hallVals.artefacto_agua === 1,
    artefacto_sangre: hallVals.artefacto_sangre === 1,
    petequias: hallVals.petequias === 1,
    // Calculados (guardados pero no mostrados)
    consolidacion_total: parseFloat(ind.consol.toFixed(2)),
    categoria: ind.categ,
    cc_mycoplasma: ind.categ,
    severidad: ind.sev,
    pleuritis_total: ind.pleurT,
    perdida_gdp_gr: parseFloat(ind.gdpGr.toFixed(2)),
    perdida_gdp_kg: parseFloat(ind.gdpKg.toFixed(4)),
    registrado_por: document.getElementById('uname')!.textContent || '',
    fecha_registro: new Date().toISOString(),
    // Nuevo: identificador único del registro (evita duplicados al reintentar subidas)
    IdLocal: nuevoIdLocal(),
  }

  try {
    let destino: 'sp' | 'cola' = 'sp'
    let motivo = ''
    if (!navigator.onLine) {
      agregarACola(fields, { error: 'Sin conexión' })
      destino = 'cola'
    } else if (estado.necesitaLogin) {
      // La sesión ya venció: no abrir un popup por cada animal; se guarda local y la barra pide iniciar sesión una vez.
      agregarACola(fields, { error: 'Sesión vencida' })
      destino = 'cola'
      motivo = 'sesión vencida — toque la barra de arriba para iniciar sesión'
    } else {
      try {
        await guardarSP(fields)
      } catch (e) {
        const err = e as ErrorTipado
        if (err.tipo === 'auth') estado.necesitaLogin = true
        agregarACola(fields, { dudoso: !!err.dudoso, error: err.message }) // si esto falla, el catch de abajo avisa y NO avanza
        destino = 'cola'
        motivo = err.message
      }
    }
    if (destino === 'cola') actualizarSyncBar()
    anotarUltimoLocal(sesion.gId, sesion.consec, sesion.orden)
    estado.registrados++
    sesion.orden++
    guardarSesionActiva()
    resetAnimal()
    const n = sesion.orden - 1
    if (destino === 'sp') showToast('✓ Guardado en SharePoint — animal #' + n, 'ok')
    else if (!motivo) showToast('📥 Sin señal — animal #' + n + ' guardado en el celular (pendiente de subir)', 'ok', 3000)
    else showToast('📥 No se pudo subir (' + motivo + ') — animal #' + n + ' guardado en el celular, pendiente de subir', 'warn', 6000)
  } catch (e) {
    // Solo llega aquí si ni siquiera se pudo guardar en el celular (memoria llena): el animal NO avanza.
    showToast('⚠️ NO SE GUARDÓ este animal: ' + (e as Error).message + '. Libere espacio y vuelva a tocar Guardar.', 'err', 9000)
  } finally {
    btn.disabled = false
    btn.innerHTML = 'Guardar y siguiente →'
  }
}

/** Botón "Sin lesión": registra el animal con todo en 0 y avanza. */
export function saltarAnimal() {
  LOBULOS.forEach((l) => (estado.lobVals[l.id] = 0))
  HALLAZGOS.forEach((h) => (estado.hallVals[h.id] = 0))
  guardarYSiguiente()
}
