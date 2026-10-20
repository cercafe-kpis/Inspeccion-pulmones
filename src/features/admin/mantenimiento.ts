import { LISTAS } from '../../config'
import { actualizarEnBloque } from '../../graph/batch'
import { listarTodo } from '../../graph/client'
import { showToast } from '../../ui/avisos'
import { severidadDe } from '../../utils/madec'

/**
 * Administrar → Mantenimiento: correcciones de columnas en los registros históricos. Cada una revisa
 * TODOS los registros y actualiza solo los que difieren; se pueden volver a correr sin riesgo.
 *
 * 1. Severidad: hasta la versión 2026-10-20-b la app guardaba "Moderada" en animales con 0–10 % de
 *    consolidación. Se recalcula con `consolidacion_total` (que siempre estuvo bien).
 * 2. Título: la captura lo arma como granja-consecutivo-orden. Los consecutivos corregidos antes de la
 *    versión 2026-10-20-m quedaron con el Título viejo; aquí se vuelve a armar con los datos actuales.
 */

interface Pendiente { id: string; actual: string; nueva: string }
type Campos = { severidad?: string; consolidacion_total?: number | string; Title?: string; granja_nombre?: string; consecutivo?: string | number; orden?: number | string }

const CORRECCIONES = {
  sev: {
    titulo: 'Corregir severidad',
    texto: 'Recalcula la columna <b>severidad</b> con la consolidación de cada cerdo: ≤10 % Sin afectacion · >10–25 % Leve · >25–50 % Moderada · >50 % Severa.',
    campo: 'severidad',
    nueva: (f: Campos) => severidadDe(parseFloat(String(f.consolidacion_total ?? '')) || 0),
    actual: (f: Campos) => String(f.severidad ?? ''),
  },
  tit: {
    titulo: 'Corregir Título',
    texto: 'Vuelve a armar la columna <b>Título</b> como granja-consecutivo-orden con los datos actuales de cada registro (por ejemplo, después de corregir un consecutivo o una granja).',
    campo: 'Title',
    nueva: (f: Campos) => (f.granja_nombre && f.consecutivo != null && f.orden != null ? `${f.granja_nombre}-${String(f.consecutivo).trim()}-${parseInt(String(f.orden)) || 0}` : ''),
    actual: (f: Campos) => String(f.Title ?? ''),
  },
} as const
type Clave = keyof typeof CORRECCIONES

const pendientes: Record<Clave, Pendiente[]> = { sev: [], tit: [] }
const body = () => document.getElementById('adm-body')!
const $ = (id: string) => document.getElementById(id)!
const n = (x: number) => x.toLocaleString('es-CO')
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export async function pintarMantenimiento() {
  body().innerHTML = (Object.keys(CORRECCIONES) as Clave[]).map((k) => `<div class="adm-form"><h3>${CORRECCIONES[k].titulo}</h3>
    <p style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:10px">${CORRECCIONES[k].texto} No cambia ninguna otra columna.</p>
    <div id="mt-estado-${k}" class="adm-msg" style="text-align:left">Revisando registros…</div>
    <div class="adm-actions"><button class="btn-primary" id="mt-aplicar-${k}" disabled>Corregir</button></div></div>`).join('')
  if (!navigator.onLine) { (Object.keys(CORRECCIONES) as Clave[]).forEach((k) => ($(`mt-estado-${k}`).textContent = 'Necesita conexión a internet.')); return }
  try {
    const items = await listarTodo<Campos>(
      LISTAS.INSPECCIONES, '$expand=fields($select=Title,granja_nombre,consecutivo,orden,severidad,consolidacion_total)&$top=5000')
    ;(Object.keys(CORRECCIONES) as Clave[]).forEach((k) => {
      const c = CORRECCIONES[k]
      pendientes[k] = items
        .map((i) => ({ id: i.id, actual: c.actual(i.fields || {}), nueva: c.nueva(i.fields || {}) }))
        .filter((p) => p.nueva && p.actual !== p.nueva)
      const est = $(`mt-estado-${k}`)
      if (!pendientes[k].length) {
        est.textContent = `Los ${n(items.length)} registros ya están bien. No hay nada que corregir.`
      } else if (k === 'sev') {
        const resumen: Record<string, number> = {}
        pendientes[k].forEach((p) => { const r = `${p.actual || '(vacío)'} → ${p.nueva}`; resumen[r] = (resumen[r] || 0) + 1 })
        est.innerHTML = `<b>${n(pendientes[k].length)}</b> de ${n(items.length)} registros por corregir:<br>` +
          Object.entries(resumen).sort((a, b) => b[1] - a[1]).map(([r, x]) => `${esc(r)}: ${n(x)}`).join('<br>')
      } else {
        est.innerHTML = `<b>${n(pendientes[k].length)}</b> de ${n(items.length)} registros por corregir. Ejemplos:<br>` +
          pendientes[k].slice(0, 5).map((p) => `${esc(p.actual || '(vacío)')} → <b>${esc(p.nueva)}</b>`).join('<br>')
      }
      const btn = $(`mt-aplicar-${k}`) as HTMLButtonElement
      btn.disabled = !pendientes[k].length
      btn.onclick = () => aplicar(k)
    })
  } catch (e) {
    (Object.keys(CORRECCIONES) as Clave[]).forEach((k) => ($(`mt-estado-${k}`).textContent = 'No se pudieron leer los registros: ' + (e as Error).message))
  }
}

/** Actualiza de a 20 registros por llamada (Graph $batch), con reintento si SharePoint pide esperar (429). */
async function aplicar(k: Clave) {
  const lista = pendientes[k]
  const campo = CORRECCIONES[k].campo
  ;(Object.keys(CORRECCIONES) as Clave[]).forEach((x) => (($(`mt-aplicar-${x}`) as HTMLButtonElement).disabled = true))
  const est = $(`mt-estado-${k}`)
  const total = n(lista.length)
  const { ok, fallos } = await actualizarEnBloque(LISTAS.INSPECCIONES, lista.map((p) => ({ id: p.id, fields: { [campo]: p.nueva } })),
    (ok) => { est.textContent = `Corrigiendo… ${n(ok)} de ${total}` })
  showToast(fallos ? `Se corrigieron ${ok} registros; ${fallos} fallaron. Vuelva a abrir Mantenimiento para reintentar.` : `✓ ${ok} registros corregidos`, fallos ? 'warn' : 'ok', 7000)
  await pintarMantenimiento()
}
