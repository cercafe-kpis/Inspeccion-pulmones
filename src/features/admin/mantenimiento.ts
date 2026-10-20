import { LISTAS } from '../../config'
import { getListId, getSiteId, graph, listarTodo } from '../../graph/client'
import { showToast } from '../../ui/avisos'
import { severidadDe } from '../../utils/madec'

/**
 * Administrar → Mantenimiento: corrección de la columna `severidad` en los registros históricos.
 *
 * Hasta la versión 2026-10-20-b la app guardaba "Moderada" en animales con 0–10 % de consolidación
 * (faltaba el límite inferior en la regla). Aquí se recalcula la severidad de TODOS los registros a
 * partir de su `consolidacion_total` (que siempre estuvo bien) y se actualizan solo los que difieren.
 * No toca ninguna otra columna. Se puede volver a correr sin riesgo: si ya está todo bien, no cambia nada.
 */

interface Pendiente { id: string; actual: string; nueva: string }
let pendientes: Pendiente[] = []

const body = () => document.getElementById('adm-body')!

export async function pintarMantenimiento() {
  body().innerHTML = `<div class="adm-form"><h3>Corregir severidad en registros históricos</h3>
    <p style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:10px">La columna <b>severidad</b> quedó como "Moderada" en cerdos con 0–10 % de consolidación por un error de la regla (ya corregido para los registros nuevos).
    Esta herramienta la recalcula con la consolidación de cada cerdo: ≤10 % Sin afectacion · >10–25 % Leve · >25–50 % Moderada · >50 % Severa. No cambia ninguna otra columna.</p>
    <div id="mt-estado" class="adm-msg">Revisando registros…</div>
    <div class="adm-actions"><button class="btn-primary" id="mt-aplicar" disabled>Corregir</button></div></div>`
  if (!navigator.onLine) { document.getElementById('mt-estado')!.textContent = 'Necesita conexión a internet.'; return }
  try {
    const items = await listarTodo<{ severidad?: string; consolidacion_total?: number | string }>(
      LISTAS.INSPECCIONES, '$expand=fields($select=severidad,consolidacion_total)&$top=5000')
    pendientes = items
      .map((i) => ({ id: i.id, actual: String(i.fields?.severidad ?? ''), nueva: severidadDe(parseFloat(String(i.fields?.consolidacion_total ?? '')) || 0) }))
      .filter((p) => p.actual !== p.nueva)
    const resumen: Record<string, number> = {}
    pendientes.forEach((p) => { const k = `${p.actual || '(vacío)'} → ${p.nueva}`; resumen[k] = (resumen[k] || 0) + 1 })
    document.getElementById('mt-estado')!.innerHTML = pendientes.length
      ? `<b>${pendientes.length.toLocaleString('es-CO')}</b> de ${items.length.toLocaleString('es-CO')} registros tienen la severidad mal:<br>` +
        Object.entries(resumen).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n.toLocaleString('es-CO')}`).join('<br>')
      : `Los ${items.length.toLocaleString('es-CO')} registros ya tienen la severidad correcta. No hay nada que corregir.`
    const btn = document.getElementById('mt-aplicar') as HTMLButtonElement
    btn.disabled = !pendientes.length
    btn.onclick = aplicar
  } catch (e) {
    document.getElementById('mt-estado')!.textContent = 'No se pudieron leer los registros: ' + (e as Error).message
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Actualiza de a 20 registros por llamada (Graph $batch), con reintento si SharePoint pide esperar (429). */
async function aplicar() {
  const btn = document.getElementById('mt-aplicar') as HTMLButtonElement
  const est = document.getElementById('mt-estado')!
  btn.disabled = true
  const siteId = await getSiteId()
  const listId = await getListId(LISTAS.INSPECCIONES)
  let ok = 0, fallos = 0
  for (let i = 0; i < pendientes.length; i += 20) {
    let lote = pendientes.slice(i, i + 20)
    for (let intento = 0; intento < 5 && lote.length; intento++) {
      const r = await graph<{ responses: { id: string; status: number; headers?: Record<string, string> }[] }>('/$batch', {
        method: 'POST',
        timeout: 60000,
        body: {
          requests: lote.map((p) => ({
            id: p.id, method: 'PATCH', url: `/sites/${siteId}/lists/${listId}/items/${p.id}/fields`,
            headers: { 'Content-Type': 'application/json' }, body: { severidad: p.nueva },
          })),
        },
      })
      const reintentar = r.responses.filter((x) => x.status === 429 || x.status === 503)
      ok += r.responses.filter((x) => x.status >= 200 && x.status < 300).length
      fallos += r.responses.filter((x) => x.status >= 300 && x.status !== 429 && x.status !== 503).length
      lote = lote.filter((p) => reintentar.some((x) => x.id === p.id))
      if (lote.length) await esperar(1000 * (parseInt(reintentar[0]?.headers?.['Retry-After'] || '') || 5))
    }
    est.textContent = `Corrigiendo… ${ok.toLocaleString('es-CO')} de ${pendientes.length.toLocaleString('es-CO')}`
  }
  showToast(fallos ? `Se corrigieron ${ok} registros; ${fallos} fallaron. Vuelva a abrir Mantenimiento para reintentar.` : `✓ ${ok} registros corregidos`, fallos ? 'warn' : 'ok', 7000)
  await pintarMantenimiento()
}
