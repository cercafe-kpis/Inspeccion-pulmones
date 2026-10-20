import { LOBULOS } from '../../catalogos/datos'
import { nivelIdn, NIVEL_TXT, type Nivel, type Stats } from './indicadores'

/**
 * Gráficas en SVG (sin librerías: nada que descargar de un CDN y se imprimen nítidas en el PDF).
 * Colores de estado = escala IDN (siempre con texto, nunca solo color).
 */

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
export const fmt = (v: number | null | undefined, d = 2) =>
  v == null || !isFinite(v) ? '—' : v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })
export const NIVEL_VAR: Record<Nivel, string> = { sin: '--rs-sin', leve: '--rs-leve', mod: '--rs-mod', sev: '--rs-sev' }

export function pill(idn: number | null) {
  if (idn == null) return '—'
  const k = nivelIdn(idn)
  return `<span class="rs-pill rs-${k}"><i aria-hidden="true"></i>${fmt(idn)} · ${NIVEL_TXT[k]}</span>`
}

/** Mini tendencia (IDN mensual de 12 meses). */
export function spark(serie: (number | null)[]) {
  const W = 96, H = 26
  const pts = serie.map((v, i) => (v == null ? null : [4 + (i * (W - 8)) / (serie.length - 1), H - 3 - (Math.min(v, 2) / 2) * (H - 6)]))
  const val = pts.filter(Boolean) as number[][]
  if (val.length < 2) return '<span class="rs-muted">pocos datos</span>'
  const ultimo = serie.map((v, i) => [v, i] as const).filter((x) => x[0] != null).pop()!
  const lp = pts[ultimo[1]]!
  const y09 = H - 3 - (0.9 / 2) * (H - 6)
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tendencia IDN mensual" data-tip="IDN mensual, últimos 12 meses<br>Último mes con datos: ${fmt(ultimo[0])}"><line x1="0" x2="${W}" y1="${y09}" y2="${y09}" stroke="var(--rs-grid)" stroke-dasharray="2 2"/><polyline fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linejoin="round" points="${val.map((p) => p.join(',')).join(' ')}"/><circle cx="${lp[0]}" cy="${lp[1]}" r="3.5" fill="var(${NIVEL_VAR[nivelIdn(ultimo[0]!)]})" stroke="#fff" stroke-width="1.5"/></svg>`
}

export interface PuntoLote { consec: string; fecha: Date; s: Stats }

/** IDN por lote en el tiempo, con guías 0,56 / 0,90 y la red Cercafe. */
export function graficaLotes(lotes: PuntoLote[], desde: Date, hasta: Date, red: number | null) {
  if (!lotes.length) return '<div class="rs-empty">Sin lotes en el periodo.</div>'
  const W = 900, H = 240, L = 40, R = 16, T = 12, B = 30
  const a = desde.getTime(), b = Math.max(hasta.getTime(), a + 864e5)
  const ymax = Math.max(1.5, Math.ceil(Math.max(...lotes.map((l) => l.s.idn), red || 0) * 2) / 2)
  const x = (d: Date) => L + ((d.getTime() - a) / (b - a)) * (W - L - R)
  const y = (v: number) => T + (1 - v / ymax) * (H - T - B)
  let o = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="IDN por lote">`
  for (let v = 0; v <= ymax + 1e-9; v += 0.5) o += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rs-grid)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--hint)">${fmt(v, 1)}</text>`
  ;([[0.56, 'moderado'], [0.9, 'severo']] as const).forEach(([v, t]) => {
    o += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-dasharray="4 4"/><text x="${W - R}" y="${y(v) - 4}" text-anchor="end" font-size="10.5" fill="var(--hint)">${fmt(v)} ${t}</text>`
  })
  if (red != null) o += `<line x1="${L}" x2="${W - R}" y1="${y(red)}" y2="${y(red)}" stroke="var(--g)" stroke-width="1.5" stroke-dasharray="2 4"/><text x="${L + 6}" y="${y(red) - 5}" font-size="10.5" fill="var(--muted)">Red Cercafe ${fmt(red)}</text>`
  // marcas de mes
  const meses = Math.max(1, Math.round((b - a) / (30.4 * 864e5)))
  const paso = meses > 14 ? 3 : meses > 7 ? 2 : 1
  const m0 = new Date(desde.getFullYear(), desde.getMonth() + 1, 1)
  for (let d = new Date(m0), i = 0; d.getTime() <= b; d = new Date(d.getFullYear(), d.getMonth() + paso, 1), i++) {
    o += `<text x="${x(d)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--hint)">${d.toLocaleDateString('es-CO', { month: 'short' })}${d.getMonth() === 0 ? ' ' + String(d.getFullYear()).slice(2) : ''}</text>`
  }
  o += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/>`
  const ord = [...lotes].sort((p, q) => p.fecha.getTime() - q.fecha.getTime())
  o += `<polyline fill="none" stroke="var(--muted)" stroke-width="2" stroke-linejoin="round" points="${ord.map((l) => x(l.fecha) + ',' + y(l.s.idn)).join(' ')}"/>`
  ord.forEach((l) => {
    const k = nivelIdn(l.s.idn)
    const tip = `<b>Lote ${esc(l.consec)}</b><br>${l.fecha.toLocaleDateString('es-CO')} · ${l.s.n} cerdos<br>IDN ${fmt(l.s.idn)} · ${NIVEL_TXT[k]}`
    o += `<circle cx="${x(l.fecha)}" cy="${y(l.s.idn)}" r="6" fill="var(${NIVEL_VAR[k]})" stroke="#fff" stroke-width="2"/><circle cx="${x(l.fecha)}" cy="${y(l.s.idn)}" r="14" fill="transparent" data-tip="${esc(tip)}"/>`
  })
  return o + '</svg>'
}

/* ── Mapa pulmonar: consolidación promedio por lóbulo ── */
const BINS = [1, 3, 6, 10]
const binOf = (v: number) => (v < BINS[0] ? 1 : v < BINS[1] ? 2 : v < BINS[2] ? 3 : v < BINS[3] ? 4 : 5)
const LUNG: Record<string, string> = {
  apical_izquierdo: 'M100,22 C76,24 64,50 64,82 L132,82 C134,56 124,24 100,22 Z',
  cardiaco_izquierdo: 'M63,86 C59,106 53,124 49,140 L136,140 C136,120 134,100 132,86 Z',
  diafragmatico_izquierdo: 'M48,144 C40,182 40,222 62,240 C92,252 126,236 142,214 L137,144 Z',
  apical_derecho: 'M220,22 C244,24 256,50 256,82 L188,82 C186,56 196,24 220,22 Z',
  cardiaco_derecho: 'M257,86 C261,106 267,124 271,140 L184,140 C184,120 186,100 188,86 Z',
  diafragmatico_derecho: 'M272,144 C280,182 280,222 258,240 C228,252 194,236 178,214 L183,144 Z',
}
const LBL: Record<string, [number, number]> = {
  apical_izquierdo: [98, 58], cardiaco_izquierdo: [94, 116], diafragmatico_izquierdo: [92, 196],
  apical_derecho: [222, 58], cardiaco_derecho: [226, 116], diafragmatico_derecho: [228, 196], accesorio: [160, 200],
}
const NOMBRE_LOB = (id: string) => {
  const l = LOBULOS.find((x) => x.id === id)!
  return l.label + (l.g === 'der' ? ' der.' : l.g === 'izq' ? ' izq.' : '')
}

export function mapaPulmonar(s: Stats) {
  if (!s.n) return { svg: '<div class="rs-empty">Sin datos.</div>', lista: '', leyenda: '', lectura: '' }
  const forma = (k: string) => {
    const v = s.lob[k], b = binOf(v), lob = LOBULOS.find((l) => l.id === k)!
    const tip = esc(`<b>${NOMBRE_LOB(k)}</b><br>${fmt(v, 1)} % consolidación promedio<br>Peso Madec ${Math.round(lob.peso * 100)} %`)
    const fill = `var(--rs-s${b})`, ink = b >= 4 ? '#fff' : 'var(--text)'
    const geo = k === 'accesorio'
      ? `<ellipse cx="160" cy="196" rx="15" ry="28" fill="${fill}" stroke="#fff" stroke-width="2" data-tip="${tip}"/>`
      : `<path d="${LUNG[k]}" fill="${fill}" stroke="#fff" stroke-width="2" data-tip="${tip}"/>`
    const [lx, ly] = LBL[k]
    return geo + `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="${k === 'accesorio' ? 10 : 12}" font-weight="600" fill="${ink}" pointer-events="none">${fmt(v, 1)}</text>`
  }
  const svg = `<svg viewBox="0 0 320 262" width="100%" style="max-width:360px" role="img" aria-label="Consolidación promedio por lóbulo">${Object.keys(LUNG).map(forma).join('')}${forma('accesorio')}<text x="96" y="258" text-anchor="middle" font-size="11" fill="var(--hint)">Pulmón izquierdo</text><text x="224" y="258" text-anchor="middle" font-size="11" fill="var(--hint)">Pulmón derecho</text></svg>`
  const lista = [...LOBULOS].sort((a, b) => s.lob[b.id] - s.lob[a.id]).map((l) => `<div><span>${NOMBRE_LOB(l.id)}</span><b>${fmt(s.lob[l.id], 1)} %</b></div>`).join('')
  const leyenda = ['< 1 %', '1–3 %', '3–6 %', '6–10 %', '≥ 10 %'].map((t, i) => `<span><i style="background:var(--rs-s${i + 1})"></i>${t}</span>`).join('')
  const cran = (s.lob.apical_derecho + s.lob.cardiaco_derecho + s.lob.apical_izquierdo + s.lob.cardiaco_izquierdo) / 4
  const diaf = (s.lob.diafragmatico_derecho + s.lob.diafragmatico_izquierdo) / 2
  const lectura = `Los lóbulos craneoventrales (apicales y cardíacos) promedian ${fmt(cran, 1)} % frente a ${fmt(diaf, 1)} % de los diafragmáticos${cran > diaf * 1.5 && cran >= 1 ? ', un patrón compatible con neumonía enzoótica' : ''}.`
  return { svg, lista, leyenda, lectura }
}

/** Porcentaje de cerdos por categoría Madec (0–6). */
export function graficaCategorias(s: Stats) {
  if (!s.n) return ''
  const W = 420, H = 220, L = 36, R = 8, T = 18, B = 28
  const pct = s.cats.map((c) => (c / s.n) * 100)
  const ymax = Math.max(20, Math.ceil(Math.max(...pct) / 20) * 20)
  const bw = (W - L - R) / 7, y = (v: number) => T + (1 - v / ymax) * (H - T - B)
  let o = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Distribución por categoría">`
  for (let v = 0; v <= ymax; v += 20) o += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rs-grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--hint)">${v}%</text>`
  pct.forEach((p, i) => {
    const x = L + i * bw + bw * 0.18, w = bw * 0.64, h = y(0) - y(p), r = Math.min(4, h)
    o += `<path d="M${x},${y(0)} L${x},${y(p) + r} Q${x},${y(p)} ${x + r},${y(p)} L${x + w - r},${y(p)} Q${x + w},${y(p)} ${x + w},${y(p) + r} L${x + w},${y(0)} Z" fill="var(--rs-s5)" data-tip="${esc(`Categoría ${i}<br>${s.cats[i]} cerdos (${fmt(p, 1)} %)`)}"/>`
    o += `<text x="${x + w / 2}" y="${y(p) - 5}" text-anchor="middle" font-size="11" fill="var(--muted)">${fmt(p, 0)}%</text><text x="${x + w / 2}" y="${H - 10}" text-anchor="middle" font-size="11.5" fill="var(--hint)">${i}</text>`
  })
  return o + `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/></svg>`
}

export interface FilaComp { nombre: string; valor: number; s: Stats }

/** Barras horizontales por granja. Si es IDN, cada barra lleva el color de su nivel. */
export function barrasGranjas(filas: FilaComp[], esIdn: boolean, f: (v: number) => string, ref: number | null) {
  if (!filas.length) return '<div class="rs-empty">Sin datos en el periodo.</div>'
  const W = 460, rowH = 24, L = 120, R = 50, T = 8, H = T + filas.length * rowH + 22
  const vmax = Math.max(...filas.map((r) => r.valor), ref || 0)
  const xmax = esIdn ? Math.max(1.5, Math.ceil(vmax * 2) / 2) : vmax > 0 ? vmax * 1.08 : 1
  const x = (v: number) => L + (v / xmax) * (W - L - R)
  let o = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Comparativo por granja">`
  const ticks = 4
  for (let i = 0; i <= ticks; i++) {
    const v = (xmax * i) / ticks
    o += `<line x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - 20}" stroke="var(--rs-grid)"/><text x="${x(v)}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="var(--hint)">${esIdn ? fmt(v, 1) : f(v)}</text>`
  }
  filas.forEach((r, i) => {
    const yy = T + i * rowH + 5, h = rowH - 10, w = Math.max(2, x(r.valor) - L)
    const color = esIdn ? `var(${NIVEL_VAR[nivelIdn(r.valor)]})` : 'var(--g)'
    const tip = esc(`<b>${r.nombre}</b><br>${f(r.valor)}${esIdn ? ' · ' + NIVEL_TXT[nivelIdn(r.valor)] : ''}<br>${r.s.n} cerdos`)
    o += `<text x="${L - 8}" y="${yy + h - 2}" text-anchor="end" font-size="11.5" fill="var(--text)">${esc(r.nombre.length > 18 ? r.nombre.slice(0, 17) + '…' : r.nombre)}</text>`
    o += `<path d="M${L},${yy} L${L + w - 4},${yy} Q${L + w},${yy} ${L + w},${yy + 4} L${L + w},${yy + h - 4} Q${L + w},${yy + h} ${L + w - 4},${yy + h} L${L},${yy + h} Z" fill="${color}" data-tip="${tip}"/>`
    o += `<text x="${L + w + 5}" y="${yy + h - 2}" font-size="11" fill="var(--muted)">${f(r.valor)}</text>`
  })
  if (ref != null) o += `<line x1="${x(ref)}" x2="${x(ref)}" y1="${T}" y2="${H - 20}" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="3 3"/>`
  return o + '</svg>'
}

/** Severidad individual en barras 100 % (reemplaza las donas). */
export function barrasSeveridad(filas: FilaComp[]) {
  if (!filas.length) return ''
  const SEVN = ['Sin', 'Leve', 'Moderada', 'Severa'], SEVV = ['--rs-sin', '--rs-leve', '--rs-mod', '--rs-sev']
  const W = 460, rowH = 24, L = 120, R = 18, T = 8, H = T + filas.length * rowH + 22
  let o = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Severidad individual por granja">`
  filas.forEach((f, i) => {
    const yy = T + i * rowH + 5, h = rowH - 10
    let acc = L
    o += `<text x="${L - 8}" y="${yy + h - 2}" text-anchor="end" font-size="11.5" fill="var(--text)">${esc(f.nombre.length > 18 ? f.nombre.slice(0, 17) + '…' : f.nombre)}</text>`
    f.s.sev.forEach((c, j) => {
      const w = (c / (f.s.n || 1)) * (W - L - R)
      if (w <= 0) return
      o += `<rect x="${acc}" y="${yy}" width="${w}" height="${h}" fill="var(${SEVV[j]})" stroke="#fff" stroke-width="2" data-tip="${esc(`<b>${f.nombre}</b><br>${SEVN[j]}: ${c} cerdos (${fmt((c / (f.s.n || 1)) * 100, 1)} %)`)}"/>`
      acc += w
    })
  })
  for (let v = 0; v <= 100; v += 25) o += `<text x="${L + (v / 100) * (W - L - R)}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="var(--hint)">${v}%</text>`
  return o + '</svg>'
}
