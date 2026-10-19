import { granjasActivas } from '../../catalogos/catalogoLocal'
import { HALLAZGOS, LOBULOS, type Granja } from '../../catalogos/datos'
import { estado } from '../../state'
import { actualizarOrdenSugerido } from './sesion'

/* ══ BUSCADOR DE GRANJA ══
   Autocompletar sobre las granjas ACTIVAS de la lista Granjas (copia guardada en el celular). */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Filtra por texto libre (nombre interno o id) y muestra el dropdown. Se llama en cada tecla. */
export function filtrarG(q: string) {
  const t = q.trim().toUpperCase()
  const todas = granjasActivas()
  renderG(t ? todas.filter((g) => g.n.toUpperCase().includes(t) || g.v.toUpperCase().includes(t) || String(g.id).startsWith(t)) : todas)
  document.getElementById('s_gdrop')!.style.display = 'block'
}

/** Abre el dropdown (evento focus del campo). */
export function abrirG() {
  filtrarG((document.getElementById('s_gsearch') as HTMLInputElement).value)
}

function renderG(lista: Granja[]) {
  const d = document.getElementById('s_gdrop')!
  d.innerHTML = lista.length
    ? lista.map((g) => `<div class="gopt" data-id="${g.id}"><span class="gid">${g.id}</span>${esc(g.v || g.n)}</div>`).join('')
    : '<div class="gopt nr">Sin resultados</div>'
}

/** Deja seleccionada una granja (id + nombre interno para guardar, nombre de vista para mostrar). */
function selG(g: Granja) {
  ;(document.getElementById('s_gid') as HTMLInputElement).value = String(g.id)
  ;(document.getElementById('s_gnombre') as HTMLInputElement).value = g.n || g.v
  ;(document.getElementById('s_gsearch') as HTMLInputElement).value = g.v || g.n
  document.getElementById('s_gdrop')!.style.display = 'none'
  actualizarOrdenSugerido()
}

export function iniciarBuscadorGranja() {
  document.getElementById('s_gdrop')!.addEventListener('click', (e) => {
    const opt = (e.target as HTMLElement).closest<HTMLElement>('.gopt[data-id]')
    if (!opt) return
    const g = granjasActivas().find((x) => String(x.id) === opt.dataset.id)
    if (g) selG(g)
  })
  document.addEventListener('click', (e) => {
    const s = document.getElementById('s_gsearch')
    const d = document.getElementById('s_gdrop')
    if (s && d && !s.contains(e.target as Node) && !d.contains(e.target as Node)) d.style.display = 'none'
  })
}

/* ══ LÓBULOS ══ */

let lobAutoTimer: ReturnType<typeof setTimeout> | null = null

/** Construye las casillas de cada lóbulo dentro de #lrows-der / #lrows-izq / #lrows-acc. */
export function buildLobulos() {
  ;(['der', 'izq', 'acc'] as const).forEach((g) => {
    const cont = document.getElementById('lrows-' + g)!
    cont.innerHTML = ''
    LOBULOS.filter((l) => l.g === g).forEach((lob) => {
      estado.lobVals[lob.id] = null
      const div = document.createElement('div')
      div.className = 'lob-row'
      div.innerHTML = `
        <div class="lob-info">
          <div class="lob-nombre">${lob.label}</div>
          <div class="lob-peso-txt">peso ×${Math.round(lob.peso * 100)}%</div>
        </div>
        <div class="lob-num-wrap">
          <input class="lob-num" id="li-${lob.id}" type="number" min="0" max="100" step="1"
            inputmode="numeric" pattern="[0-9]*" placeholder="—">
          <span class="lob-unit">%</span>
        </div>`
      const input = div.querySelector('input')!
      input.addEventListener('input', () => onLob(lob.id, input))
      input.addEventListener('focus', () => focusLob(input))
      cont.appendChild(div)
    })
  })
}

/** Al enfocar (manual o automático): seleccionar el contenido y cancelar cualquier avance pendiente. */
function focusLob(el: HTMLInputElement) {
  if (lobAutoTimer) { clearTimeout(lobAutoTimer); lobAutoTimer = null }
  el.select()
}

/**
 * Valida y guarda el valor (0-100) y decide si avanza a la siguiente casilla (mismas reglas de antes):
 *   3 dígitos ("100") → avanza ya · "10" → espera 1,2 s por si es "100" · 11-99 → avanza ya
 *   "0x" → espera 450 ms · "0" → avanza ya · 1-9 → espera el segundo dígito.
 */
function onLob(id: string, el: HTMLInputElement) {
  if (lobAutoTimer) { clearTimeout(lobAutoTimer); lobAutoTimer = null }
  const raw = el.value
  if (raw === '') {
    // Campo vacío porque está borrando para escribir otro número: no forzar un 0.
    estado.lobVals[id] = null
    el.classList.remove('has-val')
    return
  }
  let v = parseInt(raw, 10)
  if (isNaN(v)) {
    estado.lobVals[id] = null
    el.classList.remove('has-val')
    return
  }
  if (v < 0) { v = 0; el.value = '0' }
  if (v > 100) { v = 100; el.value = '100' }
  estado.lobVals[id] = v
  el.classList.toggle('has-val', v > 0)

  const val = el.value
  if (val.length >= 3) {
    avanzarSiguienteLob(id)
  } else if (val.length === 2) {
    if (val === '10') lobAutoTimer = setTimeout(() => avanzarSiguienteLob(id), 1200)
    else if (val[0] !== '0') avanzarSiguienteLob(id)
    else lobAutoTimer = setTimeout(() => avanzarSiguienteLob(id), 450)
  } else if (val === '0') {
    avanzarSiguienteLob(id)
  }
}

/** Foco al siguiente lóbulo; si era el último (Accesorio), cierra el teclado. */
function avanzarSiguienteLob(id: string) {
  lobAutoTimer = null
  const idx = LOBULOS.findIndex((l) => l.id === id)
  if (idx === -1) return
  const siguiente = LOBULOS[idx + 1]
  if (siguiente) document.getElementById('li-' + siguiente.id)?.focus()
  else (document.getElementById('li-' + id) as HTMLInputElement | null)?.blur()
}

export function cancelarAvanceLobulo() {
  if (lobAutoTimer) { clearTimeout(lobAutoTimer); lobAutoTimer = null }
}

/* ══ HALLAZGOS ══ */

/** Construye los botones Sí/No de cada hallazgo dentro de #hgrid. */
export function buildHallazgos() {
  const g = document.getElementById('hgrid')!
  g.innerHTML = ''
  HALLAZGOS.forEach((h) => {
    estado.hallVals[h.id] = 0
    const d = document.createElement('div')
    d.className = 'hall-item'
    d.innerHTML = `
      <span class="hall-lbl">${h.label}</span>
      <div class="tg">
        <button class="no-on" id="no-${h.id}">No</button>
        <button id="si-${h.id}">Sí</button>
      </div>`
    d.querySelector(`#no-${h.id}`)!.addEventListener('click', () => setH(h.id, 0))
    d.querySelector(`#si-${h.id}`)!.addEventListener('click', () => setH(h.id, 1))
    g.appendChild(d)
  })
}

function setH(id: string, v: 0 | 1) {
  estado.hallVals[id] = v
  document.getElementById('no-' + id)!.className = v === 0 ? 'no-on' : ''
  document.getElementById('si-' + id)!.className = v === 1 ? 'si-on' : ''
}
