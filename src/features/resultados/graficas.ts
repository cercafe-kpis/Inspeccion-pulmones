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
  if (!lotes.length) return '<div class="rs-empty">Sin consecutivos en el periodo.</div>'
  const W = 900, H = 240, L = 40, R = 16, T = 12, B = 30
  const a = desde.getTime(), b = Math.max(hasta.getTime(), a + 864e5)
  const ymax = Math.max(1.5, Math.ceil(Math.max(...lotes.map((l) => l.s.idn), red || 0) * 2) / 2)
  const x = (d: Date) => L + ((d.getTime() - a) / (b - a)) * (W - L - R)
  const y = (v: number) => T + (1 - v / ymax) * (H - T - B)
  let o = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="IDN por consecutivo">`
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
    const tip = `<b>Consecutivo ${esc(l.consec)}</b><br>${l.fecha.toLocaleDateString('es-CO')} · ${l.s.n} cerdos<br>IDN ${fmt(l.s.idn)} · ${NIVEL_TXT[k]}`
    o += `<circle cx="${x(l.fecha)}" cy="${y(l.s.idn)}" r="6" fill="var(${NIVEL_VAR[k]})" stroke="#fff" stroke-width="2"/><circle cx="${x(l.fecha)}" cy="${y(l.s.idn)}" r="14" fill="transparent" data-tip="${esc(tip)}"/>`
  })
  return o + '</svg>'
}

/* ── Gráfico de control (SPC) del IDN por consecutivo ── */

/** Reglas de alerta (numeración del cuadro de criterios). */
export type Regla = 1 | 2 | 3 | 4
export interface PuntoControl {
  consec: string; fecha: Date; n: number; idn: number
  /** σ de ESTE consecutivo (depende de cuántos cerdos tiene) */
  sigma: number
  /** distancia a la media en σ */
  z: number
  reglas: Regla[]
  mejora: boolean
}
export interface Control { cl: number; puntos: PuntoControl[] }

export const REGLAS: Record<Regla, { nombre: string; criterio: string; color: string }> = {
  1: { nombre: 'Brote agudo', criterio: 'un consecutivo pasó la línea roja.', color: 'var(--rs-sev)' },
  4: { nombre: 'Alerta temprana', criterio: '2 de 3 consecutivos seguidos cayeron en la franja naranja.', color: '#d9822b' },
  2: { nombre: 'Foco endémico', criterio: '9 consecutivos seguidos por encima de lo normal (línea verde).', color: '#8a2a5a' },
  3: { nombre: 'Tendencia', criterio: '6 consecutivos seguidos, cada uno peor que el anterior (solo informativa).', color: 'var(--rs-mod)' },
}

/**
 * Gráfico de control de Shewhart con zonas y reglas de Western Electric / Nelson, adaptado al IDN:
 *  - Media (LC) = IDN de la granja (Σ categorías ÷ cerdos) sin los consecutivos fuera de control.
 *  - σ de cada consecutivo = σz · σ_cerdo / √cerdos (método de Laney): σ_cerdo es la desviación de las
 *    categorías de los cerdos y σz la variación real entre consecutivos (rango móvil ÷ 1,128, mínimo 1).
 *  - Los consecutivos por fuera de ±3σ se sacan del cálculo y se recalcula (hasta 3 veces, base ≥ 5).
 *  - Solo alarman las subidas (un IDN bajo es buena noticia); 9 seguidos por debajo = mejora sostenida.
 */
export function calcularControl(lotes: PuntoLote[]): Control | null {
  const ord = lotes.filter((l) => l.s.n > 0).sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  if (ord.length < 5) return null
  const limites = (base: PuntoLote[]) => {
    const N = base.reduce((a, l) => a + l.s.n, 0)
    const cl = base.reduce((a, l) => a + l.s.idn * l.s.n, 0) / N
    let ss = 0
    base.forEach((l) => l.s.cats.forEach((c, k) => (ss += c * (k - cl) ** 2)))
    const sw = Math.sqrt(ss / Math.max(1, N - 1))
    let sz = 1
    if (sw > 1e-9 && base.length > 1) {
      const z = base.map((l) => (l.s.idn - cl) / (sw / Math.sqrt(l.s.n)))
      let mr = 0
      for (let i = 1; i < z.length; i++) mr += Math.abs(z[i] - z[i - 1])
      sz = Math.max(1, mr / (z.length - 1) / 1.128)
    }
    return { cl, sigma: (n: number) => Math.max(1e-6, sz * (sw / Math.sqrt(n))) }
  }
  let base = ord
  let lim = limites(base)
  for (let it = 0; it < 3; it++) {
    const dentro = base.filter((l) => Math.abs(l.s.idn - lim.cl) <= 3 * lim.sigma(l.s.n) + 1e-9)
    if (dentro.length === base.length || dentro.length < 5) break
    base = dentro
    lim = limites(base)
  }
  const cl = lim.cl
  const p: PuntoControl[] = ord.map((l) => {
    const sigma = lim.sigma(l.s.n)
    return { consec: l.consec, fecha: l.fecha, n: l.s.n, idn: l.s.idn, sigma, z: (l.s.idn - cl) / sigma, reglas: [], mejora: false }
  })
  const marcar = (i: number, r: Regla) => { if (!p[i].reglas.includes(r)) p[i].reglas.push(r) }
  const E = 1e-9
  // 1) Brote agudo
  p.forEach((q, i) => { if (q.z > 3 + E) marcar(i, 1) })
  // 4) Alerta temprana: 2 de 3 seguidos por encima de +2σ
  for (let i = 2; i < p.length; i++) {
    const ventana = [i - 2, i - 1, i].filter((k) => p[k].z > 2 + E)
    if (ventana.length >= 2) ventana.forEach((k) => marcar(k, 4))
  }
  // 2) Foco endémico (9 o más por encima de la media) y mejora sostenida (9 o más por debajo)
  for (let i = 0; i < p.length; ) {
    const arriba = p[i].z > E, abajo = p[i].z < -E
    let j = i
    while (j < p.length && (arriba ? p[j].z > E : abajo ? p[j].z < -E : false)) j++
    if (j - i >= 9) for (let k = i; k < j; k++) { if (arriba) marcar(k, 2); else p[k].mejora = true }
    i = Math.max(j, i + 1)
  }
  // 3) Tendencia: 6 seguidos, cada uno mayor que el anterior
  for (let i = 0; i < p.length; ) {
    let j = i + 1
    while (j < p.length && p[j].idn > p[j - 1].idn + E) j++
    if (j - i >= 6) for (let k = i; k < j; k++) marcar(k, 3)
    i = Math.max(j, i + 1)
  }
  p.forEach((q) => q.reglas.sort((a, b) => [1, 4, 2, 3].indexOf(a) - [1, 4, 2, 3].indexOf(b)))
  return { cl, puntos: p }
}

export function graficaControl(c: Control, seleccionado: string) {
  const p = c.puntos, n = p.length
  const W = 900, L = 42, R = 76, T = 18, Hp = 230
  const rot = n > 14
  const B = rot ? 58 : 30, H = T + Hp + B
  const ymax = Math.max(1, Math.ceil(Math.max(...p.map((q) => Math.max(q.idn, c.cl + 3 * q.sigma))) * 4) / 4)
  const paso = (W - L - R) / n
  const x = (i: number) => L + paso * (i + 0.5)
  const y = (v: number) => T + (1 - Math.min(ymax, Math.max(0, v)) / ymax) * Hp
  const xs = (i: number, lado: 0 | 1) => L + paso * (i + lado)
  const nivel = (q: PuntoControl, k: number) => c.cl + k * q.sigma
  let o = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Gráfico de control del IDN">`
  // Zonas (franjas escalonadas: cada consecutivo tiene su σ)
  const franja = (k1: number, k2: number, color: string) => {
    let a = '', b = ''
    p.forEach((q, i) => { a += `${xs(i, 0)},${y(nivel(q, k2))} ${xs(i, 1)},${y(nivel(q, k2))} `; b = `${xs(i, 1)},${y(nivel(q, k1))} ${xs(i, 0)},${y(nivel(q, k1))} ` + b })
    return `<polygon points="${a}${b}" fill="${color}"/>`
  }
  o += franja(-1, 1, '#e7f1ea') + franja(1, 2, '#fbf3d9') + franja(2, 3, '#fbe6d2') + franja(-2, -1, '#f1f4f1') + franja(-3, -2, '#f6f7f6')
  const tick = ymax > 2 ? 0.5 : 0.25
  for (let v = 0; v <= ymax + 1e-9; v += tick) o += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rs-grid)" stroke-opacity=".6"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--hint)">${fmt(v, 2)}</text>`
  const linea = (k: number, color: string, ancho: number, guion: string) =>
    `<polyline points="${p.map((q, i) => `${xs(i, 0)},${y(nivel(q, k))} ${xs(i, 1)},${y(nivel(q, k))}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${ancho}"${guion ? ` stroke-dasharray="${guion}"` : ''}/>`
  o += linea(3, 'var(--rs-sev)', 1.6, '') + linea(2, '#d9822b', 1.2, '5 4') + linea(1, '#5b7fb5', 1, '3 4')
  o += linea(-1, '#5b7fb5', 0.8, '3 4') + linea(-2, '#d9822b', 0.8, '5 4') + linea(-3, 'var(--rs-sev)', 0.8, '')
  o += `<line x1="${L}" x2="${W - R}" y1="${y(c.cl)}" y2="${y(c.cl)}" stroke="var(--rs-leve)" stroke-width="2"/>`
  // Etiquetas a la derecha (con la σ del último consecutivo)
  const u = p[n - 1]
  const etiquetas: [number, string, string][] = [[3, 'Límite', 'var(--rs-sev)'], [2, 'Alerta', '#d9822b'], [1, 'Atención', '#5b7fb5'], [0, 'Normal ' + fmt(c.cl), 'var(--rs-leve)']]
  if (c.cl - 3 * u.sigma > 0.02) etiquetas.push([-3, 'Límite inf.', 'var(--rs-sev)'])
  etiquetas.forEach(([k, t, col]) => { o += `<text x="${W - R + 5}" y="${y(nivel(u, k)) + 4}" font-size="10.5" font-weight="600" fill="${col}">${t}</text>` })
  o += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/>`
  // Serie y puntos
  o += `<polyline fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-linejoin="round" points="${p.map((q, i) => x(i) + ',' + y(q.idn)).join(' ')}"/>`
  p.forEach((q, i) => {
    const fill = q.z > 3 ? 'var(--rs-sev)' : q.z > 2 ? '#d9822b' : q.z > 1 ? '#c9a227' : q.mejora ? 'var(--rs-leve)' : '#7d776b'
    const zona = q.z > 3 ? 'Por encima del límite' : q.z > 2 ? 'Franja naranja (muy alto)' : q.z > 1 ? 'Franja amarilla (un poco alto)' : q.z >= -1 ? 'Franja verde (normal)' : 'Más bajo de lo normal (bien)'
    const alertas = q.reglas.map((r) => `${r}) ${REGLAS[r].nombre}`).concat(q.mejora ? ['Mejora sostenida'] : [])
    const tip = `<b>Consecutivo ${esc(q.consec)}</b><br>${q.fecha.toLocaleDateString('es-CO')} · ${q.n} cerdos<br>IDN ${fmt(q.idn)} · ${zona}${alertas.length ? '<br><b>' + alertas.join(' · ') + '</b>' : ''}`
    if (q.consec === seleccionado) o += `<circle cx="${x(i)}" cy="${y(q.idn)}" r="12" fill="none" stroke="var(--text)" stroke-width="1.5"/>`
    if (q.reglas.length) o += `<circle cx="${x(i)}" cy="${y(q.idn)}" r="9.5" fill="none" stroke="${REGLAS[q.reglas[0]].color}" stroke-width="2"/>`
    o += `<circle cx="${x(i)}" cy="${y(q.idn)}" r="${q.reglas.length ? 6.5 : 5}" fill="${fill}" stroke="#fff" stroke-width="2"/>`
    if (q.reglas.length) o += `<text x="${x(i)}" y="${y(q.idn) - 14}" text-anchor="middle" font-size="10" font-weight="700" fill="${REGLAS[q.reglas[0]].color}" paint-order="stroke" stroke="#fff" stroke-width="3">${q.reglas.join('·')}</text>`
    o += `<circle cx="${x(i)}" cy="${y(q.idn)}" r="14" fill="transparent" data-tip="${esc(tip)}"/>`
    o += rot
      ? `<text transform="translate(${x(i) + 3},${y(0) + 12}) rotate(-50)" text-anchor="end" font-size="10.5" fill="var(--hint)">${esc(q.consec)}</text>`
      : `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="var(--hint)">${esc(q.consec)}</text>`
  })
  return o + '</svg>'
}

/** Texto de lectura del gráfico de control, en palabras sencillas. */
export function lecturaControl(c: Control) {
  const fecha = (q: PuntoControl) => q.fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  const lista = (e: PuntoControl[]) => e.map((q) => `${esc(q.consec)} (${fecha(q)})`).join(', ')
  const rango = (e: PuntoControl[]) => `${esc(e[0].consec)} (${fecha(e[0])}) al ${esc(e[e.length - 1].consec)} (${fecha(e[e.length - 1])})`
  const con = (r: Regla) => c.puntos.filter((q) => q.reglas.includes(r))
  const t: string[] = []
  const r1 = con(1), r4 = con(4), r2 = con(2), r3 = con(3), mej = c.puntos.filter((q) => q.mejora)
  if (r1.length) t.push(`🔴 <b>1) Brote agudo:</b> ${r1.length === 1 ? 'el consecutivo' : 'los consecutivos'} ${lista(r1)} ${r1.length === 1 ? 'superó' : 'superaron'} el límite superior. Algo puntual pasó en ese grupo: revise origen de los lechones, ventilación, densidad, vacunación o enfermedades de ese momento.`)
  if (r4.length) t.push(`🟠 <b>4) Alerta temprana:</b> ${lista(r4)} quedaron cerca del límite (Zona A). Todavía no es un brote, pero la granja se está acercando: vale la pena revisar antes de que empeore.`)
  if (r2.length) t.push(`🟣 <b>2) Foco endémico:</b> ${r2.length} consecutivos seguidos por encima de la media, del ${rango(r2)}. La neumonía subió de nivel y se está volviendo parte de lo normal en la granja; hay que revisar el manejo general y el plan sanitario, no un lote puntual.`)
  if (r3.length) t.push(`🟡 <b>3) Tendencia (informativa):</b> del ${rango(r3)} cada consecutivo salió peor que el anterior.`)
  if (mej.length) t.push(`✅ <b>Mejora sostenida:</b> ${mej.length} consecutivos seguidos por debajo de la media, del ${rango(mej)}. Lo que se cambió en ese tiempo está funcionando.`)
  if (!t.length) t.push('Ningún criterio de alerta: la granja se comporta de forma <b>estable</b>; las subidas y bajadas que se ven son su variación normal.')
  if (c.puntos.length < 9) t.push(`<span class="rs-muted">Con ${c.puntos.length} consecutivos todavía no se puede evaluar el foco endémico (necesita 9). Use "Últimos 12 meses" o "Todo el historial".</span>`)
  return t.join('<br>')
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
/** Colores de las categorías Madec: del verde (pulmón sano) al vino tinto (más de la mitad dañado), pasando por mostaza. */
export const CAT_COLOR = ['#2e7d4f', '#86a83a', '#c9a227', '#c4801f', '#b5541f', '#962f26', '#6b1a2a']
const CAT_INFO: [string, string][] = [
  ['Nada (0 %)', 'Pulmón sano'],
  ['Hasta 10 %', 'Daño muy pequeño'],
  ['Más de 10 % hasta 20 %', 'Daño pequeño'],
  ['Más de 20 % hasta 30 %', 'Daño medio'],
  ['Más de 30 % hasta 40 %', 'Daño importante'],
  ['Más de 40 % hasta 50 %', 'Daño grave'],
  ['Más de 50 %', 'Más de la mitad del pulmón dañado'],
]

/** Cuadro que explica cada categoría (para que cualquier persona lea la gráfica). */
export function explicacionCategorias() {
  return `<table class="rs-table rs-cats"><thead><tr><th>Categoría</th><th>Pulmón dañado</th><th>Qué significa</th></tr></thead><tbody>
    ${CAT_INFO.map(([d, q], i) => `<tr><td><span class="rs-cat" style="background:${CAT_COLOR[i]}">${i}</span></td><td>${d}</td><td>${q}</td></tr>`).join('')}
  </tbody></table>`
}

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
    o += `<path d="M${x},${y(0)} L${x},${y(p) + r} Q${x},${y(p)} ${x + r},${y(p)} L${x + w - r},${y(p)} Q${x + w},${y(p)} ${x + w},${y(p) + r} L${x + w},${y(0)} Z" fill="${CAT_COLOR[i]}" data-tip="${esc(`Categoría ${i}<br>${s.cats[i]} cerdos (${fmt(p, 1)} %)`)}"/>`
    o += `<text x="${x + w / 2}" y="${y(p) - 5}" text-anchor="middle" font-size="11" fill="var(--muted)">${fmt(p, 0)}%</text><text x="${x + w / 2}" y="${H - 10}" text-anchor="middle" font-size="11.5" fill="var(--hint)">${i}</text>`
  })
  return o + `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/></svg>`
}

export interface FilaComp { nombre: string; valor: number; s: Stats }

/**
 * Columnas por granja (una columna por granja, todas a lo ancho). Si es IDN, cada columna lleva el color
 * de su nivel. En pantallas angostas el gráfico se desliza de lado para no apretar las granjas.
 */
export function columnasGranjas(filas: FilaComp[], esIdn: boolean, f: (v: number) => string, ref: number | null, meta: number | null = null) {
  if (!filas.length) return '<div class="rs-empty">Sin datos en el periodo.</div>'
  const n = filas.length
  const L = 44, R = 14, T = 22, Hp = 260, Bl = 112 // Bl: espacio para los nombres inclinados
  const col = 26
  const W = Math.max(640, L + n * col + R), cw = (W - L - R) / n
  const H = T + Hp + Bl
  const vmax = Math.max(...filas.map((r) => r.valor), ref || 0, meta || 0)
  // Escala con números redondos (IDN cada 0,25; los demás con paso 1, 2, 2,5 o 5 × 10^k)
  let pasoY = 0.25
  if (!esIdn) {
    const crudo = (vmax > 0 ? vmax * 1.08 : 1) / 4, pot = 10 ** Math.floor(Math.log10(crudo))
    pasoY = ([1, 2, 2.5, 5, 10].find((m) => m * pot >= crudo) || 10) * pot
  }
  const ymax = esIdn ? Math.max(1.5, Math.ceil(vmax * 2) / 2) : Math.max(pasoY, Math.ceil((vmax * 1.08) / pasoY) * pasoY)
  const y = (v: number) => T + (1 - v / ymax) * Hp
  let o = `<div class="rs-colscroll"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${Math.round(W * 0.72)}px" role="img" aria-label="Comparativo por granja">`
  const ticks = Math.round(ymax / pasoY)
  for (let i = 0; i <= ticks; i++) {
    const v = (ymax * i) / ticks
    o += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rs-grid)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--hint)">${esIdn ? fmt(v, 2) : f(v)}</text>`
  }
  filas.forEach((r, i) => {
    const w = Math.min(cw * 0.66, 34), x = L + i * cw + (cw - w) / 2, cx = L + i * cw + cw / 2
    const top = y(Math.max(0, r.valor)), h = Math.max(1.5, y(0) - top), rr = Math.min(3, h)
    const color = esIdn ? `var(${NIVEL_VAR[nivelIdn(r.valor)]})` : meta != null && r.valor >= meta ? 'var(--rs-sev)' : 'var(--g)'
    const tip = esc(`<b>${r.nombre}</b><br>${f(r.valor)}${esIdn ? ' · ' + NIVEL_TXT[nivelIdn(r.valor)] : ''}<br>${r.s.n} cerdos`)
    o += `<path d="M${x},${y(0)} L${x},${y(0) - h + rr} Q${x},${y(0) - h} ${x + rr},${y(0) - h} L${x + w - rr},${y(0) - h} Q${x + w},${y(0) - h} ${x + w},${y(0) - h + rr} L${x + w},${y(0)} Z" fill="${color}" data-tip="${tip}"/>`
    o += `<text x="${cx}" y="${y(0) - h - 4}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${f(r.valor)}</text>`
    const nom = r.nombre.length > 20 ? r.nombre.slice(0, 19) + '…' : r.nombre
    o += `<text transform="translate(${cx + 3},${y(0) + 10}) rotate(-50)" text-anchor="end" font-size="11" fill="var(--text)">${esc(nom)}</text>`
  })
  o += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/>`
  if (ref != null) {
    o += `<line x1="${L}" x2="${W - R}" y1="${y(ref)}" y2="${y(ref)}" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="4 3"/>`
    // La etiqueta va del lado de las columnas más bajas para no taparlas.
    const izq = filas[0].valor <= filas[n - 1].valor
    o += `<text x="${izq ? L + 4 : W - R}" y="${y(ref) - 5}" text-anchor="${izq ? 'start' : 'end'}" font-size="10.5" fill="var(--text)" paint-order="stroke" stroke="#fff" stroke-width="3">Red Cercafe ${f(ref)}</text>`
  }
  if (meta != null) {
    const izq = filas[0].valor <= filas[n - 1].valor
    o += `<line x1="${L}" x2="${W - R}" y1="${y(meta)}" y2="${y(meta)}" stroke="var(--rs-sev)" stroke-width="1.6" stroke-dasharray="8 4"/>`
    o += `<text x="${izq ? L + 4 : W - R}" y="${y(meta) - 5}" text-anchor="${izq ? 'start' : 'end'}" font-size="10.5" font-weight="600" fill="var(--rs-sev)" paint-order="stroke" stroke="#fff" stroke-width="3">Meta: menor a ${f(meta)}</text>`
  }
  return o + '</svg></div>'
}

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

