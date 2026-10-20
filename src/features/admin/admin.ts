import { refrescarGranjas } from '../../catalogos/catalogoLocal'
import {
  guardarAsociado, guardarGranja, guardarUsuario, listarAsociados, listarGranjas, listarUsuarios,
  type AsociadoSP, type GranjaSP, type UsuarioSP,
} from '../../graph/catalogos'
import { estado } from '../../state'
import { showScreen, showToast } from '../../ui/avisos'
import { pintarMantenimiento } from './mantenimiento'

/**
 * Pantalla de administración (solo Rol = Administrador): Granjas, Asociados y Usuarios.
 * Lee y escribe directo en las listas de SharePoint, así que necesita conexión.
 * No se borra nada desde aquí: se desactiva (Activa/Activo = No). Así nunca se pierde la relación
 * con las inspecciones históricas.
 */

type Tab = 'granjas' | 'asociados' | 'usuarios' | 'mantenimiento'
let tab: Tab = 'granjas'
let filtro = ''
let datos: { granjas: GranjaSP[]; asociados: AsociadoSP[]; usuarios: UsuarioSP[] } = { granjas: [], asociados: [], usuarios: [] }

const body = () => document.getElementById('adm-body')!
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const ROLES = ['Administrador', 'Tecnico', 'Asociado']

export function esAdministrador() {
  return estado.usuario?.rol === 'Administrador' && estado.usuario.activo
}

export async function abrirAdmin() {
  if (!esAdministrador()) return
  showScreen('s-admin')
  await cargar()
}

export function cerrarAdmin() {
  // Vuelve a la pestaña Captura (import diferido para no crear un ciclo con ui/navegacion).
  import('../../ui/navegacion').then((m) => m.irA('captura'))
}

export function admTab(t: Tab) {
  tab = t
  filtro = ''
  document.querySelectorAll<HTMLButtonElement>('#adm-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t))
  if (t === 'mantenimiento') pintarMantenimiento()
  else pintarLista()
}

async function cargar() {
  if (!navigator.onLine) {
    body().innerHTML = '<div class="adm-msg">La administración necesita conexión a internet.</div>'
    return
  }
  body().innerHTML = '<div class="adm-msg">Cargando…</div>'
  try {
    const [granjas, asociados, usuarios] = await Promise.all([listarGranjas(), listarAsociados(), listarUsuarios()])
    datos = { granjas, asociados, usuarios }
    if (tab === 'mantenimiento') pintarMantenimiento()
    else pintarLista()
  } catch (e) {
    body().innerHTML = `<div class="adm-msg">No se pudieron cargar las listas: ${esc((e as Error).message)}</div>`
  }
}

/* ── Listados ── */

function pintarLista() {
  const q = filtro.toUpperCase()
  let filas = ''
  if (tab === 'granjas') {
    filas = datos.granjas
      .filter((g) => !q || g.Title.includes(q) || g.NombreVista.toUpperCase().includes(q) || String(g.IdGranja).startsWith(q) || g.Asociado.toUpperCase().includes(q))
      .map((g) => fila(g.spId, `${g.IdGranja} · ${g.NombreVista || g.Title}`, `${g.Title} · ${g.Asociado || 'sin asociado'}`, g.Activa))
      .join('')
  } else if (tab === 'asociados') {
    filas = datos.asociados
      .filter((a) => !q || a.Title.toUpperCase().includes(q) || a.Nombre.toUpperCase().includes(q))
      .map((a) => {
        const n = datos.granjas.filter((g) => g.Asociado === a.Title && g.Activa).length
        return fila(a.spId, a.Nombre || a.Title, `${a.Title} · ${n} granja${n === 1 ? '' : 's'} activa${n === 1 ? '' : 's'}${a.ParametroSite ? ' · ?site=' + a.ParametroSite : ''}`, a.Activo)
      })
      .join('')
  } else {
    filas = datos.usuarios
      .filter((u) => !q || u.Title.toUpperCase().includes(q) || u.Correo.toUpperCase().includes(q) || u.Rol.toUpperCase().includes(q))
      .map((u) => fila(u.spId, u.Title || u.Correo, `${u.Correo} · ${u.Rol}${u.Asociados ? ' · ' + u.Asociados.replace(/;/g, ', ') : ''}`, u.Activo))
      .join('')
  }
  const nuevo = ({ granjas: '+ Nueva granja', asociados: '+ Nuevo asociado', usuarios: '+ Nuevo usuario' } as Record<string, string>)[tab]
  body().innerHTML = `
    <div class="adm-bar">
      <input type="text" id="adm-buscar" placeholder="Buscar…" value="${esc(filtro)}" autocomplete="off">
      <button class="adm-add" id="adm-nuevo">${nuevo}</button>
    </div>
    <div class="adm-list" id="adm-list">${filas || '<div class="adm-msg">Sin resultados</div>'}</div>`
  const buscar = document.getElementById('adm-buscar') as HTMLInputElement
  buscar.addEventListener('input', () => {
    filtro = buscar.value
    const pos = buscar.selectionStart
    pintarLista()
    const nuevoInput = document.getElementById('adm-buscar') as HTMLInputElement
    nuevoInput.focus()
    if (pos !== null) nuevoInput.setSelectionRange(pos, pos)
  })
  document.getElementById('adm-nuevo')!.addEventListener('click', () => abrirFormulario())
  document.getElementById('adm-list')!.addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('.adm-row')
    if (r) abrirFormulario(r.dataset.id)
  })
}

function fila(id: string, titulo: string, sub: string, activo: boolean) {
  return `<div class="adm-row${activo ? '' : ' off'}" data-id="${esc(id)}">
    <div><div class="t">${esc(titulo)}</div><div class="s">${esc(sub)}</div></div>
    <span class="adm-tag${activo ? '' : ' off'}">${activo ? 'Activo' : 'Inactivo'}</span>
  </div>`
}

/* ── Formularios ── */

const campo = (id: string, label: string, valor: unknown, extra = '') =>
  `<div class="field"><label class="lbl" for="${id}">${label}</label><input type="text" id="${id}" value="${esc(valor)}" ${extra}></div>`
const interruptor = (id: string, label: string, on: boolean) =>
  `<div class="field"><label class="adm-sw"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label></div>`
const val = (id: string) => ((document.getElementById(id) as HTMLInputElement).value || '').trim()
const chk = (id: string) => (document.getElementById(id) as HTMLInputElement).checked

function abrirFormulario(spId?: string) {
  let html = ''
  const asocActivos = datos.asociados.filter((a) => a.Activo)
  if (tab === 'granjas') {
    const g = datos.granjas.find((x) => x.spId === spId)
    const conDatos = !!g // el nombre interno de una granja existente no se cambia: rompería su historial
    html = `<h3>${g ? 'Editar granja' : 'Nueva granja'}</h3>
      ${campo('f-id', 'Id granja (granja_id)', g?.IdGranja ?? '', 'inputmode="numeric"')}
      ${campo('f-title', 'Nombre interno (como se guarda en las inspecciones)', g?.Title ?? '', conDatos ? 'readonly style="opacity:.6"' : 'style="text-transform:uppercase"')}
      ${conDatos ? '<div class="s" style="font-size:12px;color:var(--hint);margin:-6px 0 10px">El nombre interno no se puede cambiar: las inspecciones ya guardadas usan ese nombre.</div>' : ''}
      ${campo('f-vista', 'Nombre a mostrar', g?.NombreVista ?? '')}
      <div class="field"><label class="lbl" for="f-asoc">Asociado</label><select id="f-asoc">
        <option value="">— Elegir —</option>
        ${asocActivos.map((a) => `<option value="${esc(a.Title)}" ${a.Title === g?.Asociado ? 'selected' : ''}>${esc(a.Nombre || a.Title)} (${esc(a.Title)})</option>`).join('')}
      </select></div>
      ${interruptor('f-activo', 'Activa (aparece para capturar)', g ? g.Activa : true)}`
  } else if (tab === 'asociados') {
    const a = datos.asociados.find((x) => x.spId === spId)
    html = `<h3>${a ? 'Editar asociado' : 'Nuevo asociado'}</h3>
      ${campo('f-title', 'Código', a?.Title ?? '', a ? 'readonly style="opacity:.6"' : '')}
      ${a ? '<div class="s" style="font-size:12px;color:var(--hint);margin:-6px 0 10px">El código no se puede cambiar: lo usan las granjas y los usuarios.</div>' : ''}
      ${campo('f-nombre', 'Nombre', a?.Nombre ?? '')}
      ${campo('f-site', 'Parámetro ?site= (en su página Tu.HUB)', a?.ParametroSite ?? '')}
      ${campo('f-url', 'Dirección del sitio Tu.HUB', a?.SitioTuHub ?? '', 'inputmode="url"')}
      ${interruptor('f-activo', 'Activo', a ? a.Activo : true)}`
  } else {
    const u = datos.usuarios.find((x) => x.spId === spId)
    const asignados = (u?.Asociados || '').split(';').map((s) => s.trim())
    html = `<h3>${u ? 'Editar usuario' : 'Nuevo usuario'}</h3>
      ${campo('f-nombre', 'Nombre', u?.Title ?? '')}
      ${campo('f-correo', 'Correo (con el que inicia sesión)', u?.Correo ?? '', 'inputmode="email" autocapitalize="off"')}
      <div class="field"><label class="lbl" for="f-rol">Rol</label><select id="f-rol">
        ${ROLES.map((r) => `<option ${r === (u?.Rol || 'Tecnico') ? 'selected' : ''}>${r}</option>`).join('')}
      </select></div>
      <div class="field" id="f-asocs-wrap"><label class="lbl">Asociados que puede ver (solo Rol Asociado)</label>
        <div class="adm-checks">${datos.asociados.map((a) => `<label><input type="checkbox" class="f-asoc" value="${esc(a.Title)}" ${asignados.includes(a.Title) ? 'checked' : ''}> ${esc(a.Title)}</label>`).join('')}</div>
      </div>
      ${interruptor('f-activo', 'Activo (puede entrar)', u ? u.Activo : true)}`
  }
  body().innerHTML = `<div class="adm-form">${html}
      <div class="adm-err" id="f-err"></div>
      <div class="adm-actions"><button class="btn-cancel" id="f-cancel">Cancelar</button><button class="btn-primary" id="f-save">Guardar</button></div>
    </div>`
  document.getElementById('f-cancel')!.addEventListener('click', pintarLista)
  document.getElementById('f-save')!.addEventListener('click', () => guardar(spId))
  const rol = document.getElementById('f-rol') as HTMLSelectElement | null
  if (rol) {
    const toggle = () => ((document.getElementById('f-asocs-wrap') as HTMLElement).style.display = rol.value === 'Asociado' ? '' : 'none')
    rol.addEventListener('change', toggle)
    toggle()
  }
  window.scrollTo({ top: 0 })
}

async function guardar(spId?: string) {
  const err = document.getElementById('f-err')!
  const btn = document.getElementById('f-save') as HTMLButtonElement
  err.textContent = ''
  try {
    if (tab === 'granjas') {
      const id = parseInt(val('f-id'))
      const title = val('f-title').toUpperCase()
      const g = { IdGranja: id, Title: title, NombreVista: val('f-vista'), Asociado: (document.getElementById('f-asoc') as HTMLSelectElement).value, Activa: chk('f-activo') }
      if (!id || id < 1) throw new Error('El id de la granja debe ser un número mayor que 0.')
      if (!title) throw new Error('Escriba el nombre interno.')
      if (!g.NombreVista) throw new Error('Escriba el nombre a mostrar.')
      if (!g.Asociado) throw new Error('Elija el asociado.')
      if (datos.granjas.some((x) => x.spId !== spId && x.IdGranja === id)) throw new Error(`Ya existe una granja con el id ${id}.`)
      if (datos.granjas.some((x) => x.spId !== spId && x.Title === title)) throw new Error(`Ya existe una granja con el nombre interno ${title}.`)
      btn.disabled = true
      await guardarGranja(g, spId)
      refrescarGranjas() // el buscador de captura toma el cambio de inmediato en este celular
    } else if (tab === 'asociados') {
      const a = { Title: val('f-title'), Nombre: val('f-nombre'), ParametroSite: val('f-site').toUpperCase(), SitioTuHub: val('f-url'), Activo: chk('f-activo') }
      if (!a.Title) throw new Error('Escriba el código del asociado.')
      if (datos.asociados.some((x) => x.spId !== spId && x.Title.toUpperCase() === a.Title.toUpperCase())) throw new Error(`Ya existe el asociado ${a.Title}.`)
      if (a.ParametroSite && datos.asociados.some((x) => x.spId !== spId && x.ParametroSite === a.ParametroSite)) throw new Error(`El parámetro ?site=${a.ParametroSite} ya lo usa otro asociado.`)
      btn.disabled = true
      await guardarAsociado(a, spId)
    } else {
      const rol = (document.getElementById('f-rol') as HTMLSelectElement).value
      const asocs = rol === 'Asociado' ? [...document.querySelectorAll<HTMLInputElement>('.f-asoc:checked')].map((c) => c.value) : []
      const u = { Title: val('f-nombre'), Correo: val('f-correo').toLowerCase(), Rol: rol, Asociados: asocs.join(';'), Activo: chk('f-activo') }
      if (!u.Title) throw new Error('Escriba el nombre.')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.Correo)) throw new Error('Escriba un correo válido.')
      if (rol === 'Asociado' && !asocs.length) throw new Error('Elija al menos un asociado.')
      if (datos.usuarios.some((x) => x.spId !== spId && x.Correo === u.Correo)) throw new Error(`El correo ${u.Correo} ya está registrado.`)
      if (spId && u.Correo === estado.usuario?.correo && (rol !== 'Administrador' || !u.Activo)) {
        throw new Error('No puede quitarse a sí mismo el rol de Administrador ni desactivarse.')
      }
      btn.disabled = true
      await guardarUsuario(u, spId)
    }
    showToast('✓ Guardado en SharePoint', 'ok')
    await cargar()
  } catch (e) {
    err.textContent = (e as Error).message
    btn.disabled = false
  }
}
