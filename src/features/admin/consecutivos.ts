import { LISTAS } from '../../config'
import { actualizarEnBloque } from '../../graph/batch'
import { listarGranjas, type GranjaSP } from '../../graph/catalogos'
import { listarTodo } from '../../graph/client'
import { QUEUE_KEY } from '../../offline/cola'
import { estado } from '../../state'
import { showToast } from '../../ui/avisos'

/**
 * Administrar → Consecutivos: cambia el consecutivo de todos los pulmones de una granja + consecutivo
 * en la lista InspeccionPulmones (por ejemplo, si el técnico lo digitó mal).
 * Solo cambia la columna `consecutivo`. Si el consecutivo nuevo ya existe en esa granja, los pulmones se
 * unen a él, siempre que no se repita ningún número de orden.
 */

interface Reg { id: string; consec: string; orden: number; fecha: string }

let granjas: GranjaSP[] = []
let granjaSel: GranjaSP | null = null
let regs: Reg[] = []

const body = () => document.getElementById('adm-body')!
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const nombre = (g: GranjaSP) => g.NombreVista || g.Title
const n = (x: number) => x.toLocaleString('es-CO')

export async function pintarConsecutivos() {
  granjaSel = null
  regs = []
  body().innerHTML = `<div class="adm-form"><h3>Cambiar consecutivo</h3>
    <p style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:10px">Busque el consecutivo o escoja la granja. Se cambia en <b>todos</b> los pulmones de ese consecutivo en SharePoint; no cambia ninguna otra columna.</p>
    <label class="lbl">Buscar consecutivo</label>
    <div class="adm-bar"><input type="text" id="cs-buscar" inputmode="numeric" autocomplete="off" placeholder="Ej: 128"><button class="adm-add" id="cs-btn-buscar">Buscar</button></div>
    <label class="lbl">Granja <span style="text-transform:none;font-weight:400">(opcional)</span></label><select id="cs-granja"><option value="">Cargando granjas…</option></select></div>
    <div id="cs-cuerpo"></div>`
  if (!navigator.onLine) { $('cs-cuerpo').innerHTML = '<div class="adm-msg">Necesita conexión a internet.</div>'; return }
  try {
    if (!granjas.length) granjas = (await listarGranjas()).sort((a, b) => nombre(a).localeCompare(nombre(b), 'es'))
  } catch (e) {
    $('cs-cuerpo').innerHTML = `<div class="adm-msg">No se pudieron leer las granjas: ${esc((e as Error).message)}</div>`
    return
  }
  const sel = $<HTMLSelectElement>('cs-granja')
  sel.innerHTML = '<option value="">Todas las granjas</option>' +
    granjas.map((g) => `<option value="${g.IdGranja}">${esc(nombre(g))}${g.Activa ? '' : ' (inactiva)'}</option>`).join('')
  sel.onchange = () => (sel.value ? cargarGranja(parseInt(sel.value)) : buscarEnTodas())
  const inp = $<HTMLInputElement>('cs-buscar')
  // Con granja escogida filtra mientras escribe; sin granja busca en todas al tocar Buscar (o Enter).
  inp.oninput = () => { if (granjaSel && regs.length) pintarLista() }
  inp.onkeydown = (e) => { if (e.key === 'Enter') buscar() }
  $('cs-btn-buscar').onclick = buscar
}

const textoBuscado = () => ($<HTMLInputElement>('cs-buscar')?.value || '').trim()

function buscar() {
  if (granjaSel) { pintarLista(); return }
  buscarEnTodas()
}

/** Busca el consecutivo exacto en todas las granjas (columna consecutivo indexada). */
async function buscarEnTodas() {
  granjaSel = null
  regs = []
  const q = textoBuscado()
  if (!q) { $('cs-cuerpo').innerHTML = '<div class="adm-msg">Escriba un consecutivo y toque Buscar, o escoja una granja.</div>'; return }
  $('cs-cuerpo').innerHTML = '<div class="adm-msg">Buscando…</div>'
  try {
    const items = await listarTodo<{ granja_id?: number | string; granja_nombre?: string; consecutivo?: string | number; fecha_inspeccion?: string }>(
      LISTAS.INSPECCIONES,
      `$filter=${encodeURIComponent(`fields/consecutivo eq '${q.replace(/'/g, "''")}'`)}&$expand=fields($select=granja_id,granja_nombre,consecutivo,fecha_inspeccion)&$top=999`,
    )
    const m = new Map<number, { nombre: string; n: number; desde: string; hasta: string }>()
    items.forEach((i) => {
      const id = parseInt(String(i.fields?.granja_id)) || 0
      const f = String(i.fields?.fecha_inspeccion ?? '').split('T')[0]
      const g = granjas.find((x) => x.IdGranja === id)
      const x = m.get(id) || { nombre: g ? nombre(g) : String(i.fields?.granja_nombre || 'Granja ' + id), n: 0, desde: f, hasta: f }
      x.n++
      if (f && (!x.desde || f < x.desde)) x.desde = f
      if (f > x.hasta) x.hasta = f
      m.set(id, x)
    })
    if (!m.size) { $('cs-cuerpo').innerHTML = `<div class="adm-msg">No hay pulmones con el consecutivo ${esc(q)} en ninguna granja.</div>`; return }
    $('cs-cuerpo').innerHTML = `<div class="adm-list">${[...m.entries()].sort((a, b) => b[1].hasta.localeCompare(a[1].hasta)).map(([id, x]) => `<div class="adm-row" data-g="${id}">
        <div><div class="t">${esc(x.nombre)} · consecutivo ${esc(q)}</div><div class="s">${x.desde === x.hasta ? esc(x.desde) : esc(x.desde) + ' a ' + esc(x.hasta)}</div></div>
        <span class="adm-tag">${n(x.n)} ${x.n === 1 ? "pulmón" : "pulmones"}</span></div>`).join('')}</div>`
    document.querySelectorAll<HTMLElement>('#cs-cuerpo .adm-row').forEach((el) => {
      el.onclick = async () => {
        const id = parseInt(el.dataset.g!)
        $<HTMLSelectElement>('cs-granja').value = String(id)
        await cargarGranja(id)
        if (regs.some((r) => r.consec === q)) pintarFormulario(q)
      }
    })
  } catch (e) {
    $('cs-cuerpo').innerHTML = `<div class="adm-msg">No se pudo buscar: ${esc((e as Error).message)}</div>`
  }
}

async function cargarGranja(id: number) {
  granjaSel = granjas.find((g) => g.IdGranja === id) || null
  regs = []
  if (!granjaSel) { $('cs-cuerpo').innerHTML = ''; return }
  $('cs-cuerpo').innerHTML = '<div class="adm-msg">Buscando consecutivos…</div>'
  try {
    const items = await listarTodo<{ consecutivo?: string | number; orden?: string | number; fecha_inspeccion?: string }>(
      LISTAS.INSPECCIONES,
      `$filter=${encodeURIComponent(`fields/granja_id eq ${id}`)}&$expand=fields($select=consecutivo,orden,fecha_inspeccion)&$top=999`,
    )
    regs = items.map((i) => ({
      id: i.id,
      consec: String(i.fields?.consecutivo ?? '').trim(),
      orden: parseInt(String(i.fields?.orden)) || 0,
      fecha: String(i.fields?.fecha_inspeccion ?? '').split('T')[0],
    }))
    pintarLista()
  } catch (e) {
    $('cs-cuerpo').innerHTML = `<div class="adm-msg">No se pudieron leer los pulmones: ${esc((e as Error).message)}</div>`
  }
}

function resumen() {
  const m = new Map<string, { n: number; desde: string; hasta: string }>()
  regs.forEach((r) => {
    const x = m.get(r.consec) || { n: 0, desde: r.fecha, hasta: r.fecha }
    x.n++
    if (r.fecha && (!x.desde || r.fecha < x.desde)) x.desde = r.fecha
    if (r.fecha > x.hasta) x.hasta = r.fecha
    m.set(r.consec, x)
  })
  return [...m.entries()].sort((a, b) => b[1].hasta.localeCompare(a[1].hasta) || b[0].localeCompare(a[0], 'es', { numeric: true }))
}

function pintarLista() {
  const todos = resumen()
  if (!todos.length) { $('cs-cuerpo').innerHTML = '<div class="adm-msg">Esta granja no tiene pulmones registrados.</div>'; return }
  const q = textoBuscado().toLowerCase()
  const lista = q ? todos.filter(([c]) => c.toLowerCase().includes(q)) : todos
  if (!lista.length) { $('cs-cuerpo').innerHTML = `<div class="adm-msg">Ningún consecutivo de ${esc(nombre(granjaSel!))} contiene "${esc(q)}".</div>`; return }
  $('cs-cuerpo').innerHTML = `<div class="adm-list">${lista.map(([c, x]) => `<div class="adm-row" data-c="${esc(c)}">
      <div><div class="t">Consecutivo ${esc(c || '(vacío)')}</div><div class="s">${x.desde === x.hasta ? esc(x.desde) : esc(x.desde) + ' a ' + esc(x.hasta)}</div></div>
      <span class="adm-tag">${n(x.n)} ${x.n === 1 ? "pulmón" : "pulmones"}</span></div>`).join('')}</div>`
  document.querySelectorAll<HTMLElement>('#cs-cuerpo .adm-row').forEach((el) => { el.onclick = () => pintarFormulario(el.dataset.c!) })
}

function pintarFormulario(actual: string) {
  const mios = regs.filter((r) => r.consec === actual)
  $('cs-cuerpo').innerHTML = `<div class="adm-form"><h3>${esc(nombre(granjaSel!))} · consecutivo ${esc(actual || '(vacío)')}</h3>
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px">${n(mios.length)} pulmones (órdenes ${Math.min(...mios.map((r) => r.orden))} a ${Math.max(...mios.map((r) => r.orden))}).</p>
    <label class="lbl">Consecutivo nuevo</label><input type="text" id="cs-nuevo" inputmode="numeric" autocomplete="off" placeholder="Ej: 128">
    <div id="cs-aviso" class="adm-msg" style="text-align:left;padding:10px 0;display:none"></div>
    <div class="adm-actions"><button class="btn-primary" id="cs-aplicar" disabled>Cambiar consecutivo</button><button class="btn-cancel" id="cs-volver">Volver</button></div></div>`
  const inp = $<HTMLInputElement>('cs-nuevo'), btn = $<HTMLButtonElement>('cs-aplicar'), aviso = $('cs-aviso')
  $('cs-volver').onclick = pintarLista
  inp.focus()
  inp.oninput = () => {
    const nuevo = inp.value.trim()
    btn.disabled = true
    aviso.style.display = 'none'
    if (!nuevo || nuevo === actual) return
    const destino = regs.filter((r) => r.consec === nuevo)
    aviso.style.display = 'block'
    if (destino.length) {
      const ya = new Set(destino.map((r) => r.orden))
      const choques = [...new Set(mios.filter((r) => ya.has(r.orden)).map((r) => r.orden))].sort((a, b) => a - b)
      if (choques.length) {
        aviso.innerHTML = `<span class="adm-err">⛔ El consecutivo ${esc(nuevo)} ya existe en esta granja (${n(destino.length)} pulmones) y se repetirían ${choques.length} número(s) de orden: ${choques.slice(0, 15).join(', ')}${choques.length > 15 ? '…' : ''}. No se puede cambiar.</span>`
        return
      }
      aviso.innerHTML = `⚠️ El consecutivo <b>${esc(nuevo)}</b> ya existe en esta granja con ${n(destino.length)} pulmones. Los ${n(mios.length)} pulmones se <b>unirán</b> a ese consecutivo (no se repite ningún orden).`
    } else {
      aviso.innerHTML = `Se cambiarán <b>${n(mios.length)}</b> pulmones del consecutivo ${esc(actual)} al <b>${esc(nuevo)}</b>.`
    }
    btn.disabled = false
  }
  btn.onclick = () => aplicar(actual, inp.value.trim(), mios)
}

async function aplicar(actual: string, nuevo: string, mios: Reg[]) {
  if (!confirm(`¿Cambiar el consecutivo ${actual} por ${nuevo} en ${mios.length} pulmones de ${nombre(granjaSel!)}?`)) return
  const btn = $<HTMLButtonElement>('cs-aplicar'), aviso = $('cs-aviso')
  btn.disabled = true
  $<HTMLButtonElement>('cs-volver').disabled = true
  $<HTMLInputElement>('cs-nuevo').disabled = true
  try {
    const r = await actualizarEnBloque(LISTAS.INSPECCIONES, mios.map((x) => ({ id: x.id, fields: { consecutivo: nuevo } })),
      (ok, total) => { aviso.textContent = `Cambiando… ${n(ok)} de ${n(total)}` })
    renombrarEnEsteEquipo(granjaSel!.IdGranja, actual, nuevo)
    showToast(r.fallos ? `Se cambiaron ${r.ok} pulmones; ${r.fallos} fallaron. Vuelva a abrir el consecutivo ${actual} para terminar.` : `✓ ${r.ok} pulmones pasaron al consecutivo ${nuevo}`, r.fallos ? 'warn' : 'ok', 7000)
  } catch (e) {
    showToast('No se pudo terminar el cambio: ' + (e as Error).message + '. Vuelva a abrir el consecutivo para revisar.', 'err', 8000)
  }
  await cargarGranja(granjaSel!.IdGranja)
}

/** En ESTE equipo: pendientes sin subir, captura en curso y memorias de orden pasan al consecutivo nuevo. */
function renombrarEnEsteEquipo(gId: number, viejo: string, nuevo: string) {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as { fields: { granja_id: number; consecutivo: string } }[]
    let cambio = false
    q.forEach((it) => { if (it.fields && Number(it.fields.granja_id) === gId && String(it.fields.consecutivo).trim() === viejo) { it.fields.consecutivo = nuevo; cambio = true } })
    if (cambio) localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
    for (const k of ['insp_pulmones_orden_cache', 'insp_pulmones_ultimo_local']) {
      const c = JSON.parse(localStorage.getItem(k) || '{}') as Record<string, unknown>
      if (`${gId}|${viejo}` in c) { delete c[`${gId}|${viejo}`]; localStorage.setItem(k, JSON.stringify(c)) }
    }
    const s = JSON.parse(localStorage.getItem('insp_pulmones_sesion_activa') || 'null') as { gId: number; consec: string } | null
    if (s && Number(s.gId) === gId && String(s.consec).trim() === viejo) {
      s.consec = nuevo
      localStorage.setItem('insp_pulmones_sesion_activa', JSON.stringify(s))
    }
    if (estado.sesion && Number(estado.sesion.gId) === gId && String(estado.sesion.consec).trim() === viejo) estado.sesion.consec = nuevo
  } catch { /* copia local dañada: no afecta lo que ya quedó en SharePoint */ }
}
