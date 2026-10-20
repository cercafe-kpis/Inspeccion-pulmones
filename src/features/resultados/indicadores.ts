import { LOBULOS } from '../../catalogos/datos'
import type { Fila } from './datos'

/**
 * Indicadores — MISMAS fórmulas del dashboard anterior (computeStatsByFarm / calcIDN):
 *  IDN = Σ categoría ÷ cerdos (pooled) · Consolidación = promedio · Neumonía = categoría>0 y consolidación>0
 *  Pleuritis = leve o severa · Poliserositis = pleuritis + pericarditis · GDP = suma de kg
 *  Otras lesiones sobre el total · Artefactos: solo cerdos sin ninguna lesión, en % del total
 *  Severidad individual (escala distinta al IDN): 0 · ≤10 · ≤30 · >30 % de consolidación
 */

export interface Stats {
  n: number
  idn: number; consol: number; neum: number; pleur: number; poliser: number; gdp: number
  nint: number; absc: number; nodu: number; peri: number; manc: number
  agua: number; sang: number; pete: number; ambos: number
  neumN: number; pleurN: number
  cats: number[] // 0..6 conteos
  sev: number[] // Sin, Leve, Moderada, Severa
  lob: Record<string, number> // % promedio por lóbulo
  lotes: number
}

export function stats(filas: Fila[]): Stats {
  const n = filas.length
  let sumCat = 0, sumConsol = 0, gdp = 0, neumN = 0, pleurN = 0, poliser = 0
  let nint = 0, absc = 0, nodu = 0, peri = 0, manc = 0, agua = 0, sang = 0, pete = 0, ambos = 0
  const cats = [0, 0, 0, 0, 0, 0, 0], sev = [0, 0, 0, 0]
  const lob: Record<string, number> = {}
  LOBULOS.forEach((l) => (lob[l.id] = 0))
  const lotes = new Set<string>()
  for (const d of filas) {
    lotes.add(d.granja + '|' + d.consec)
    sumCat += d.cat; sumConsol += d.consol; gdp += d.gdp
    if (d.cat > 0 && d.consol > 0) neumN++
    const pleur = d.pleurL || d.pleurS
    if (pleur) pleurN++
    if (pleur && d.peri) poliser++
    if (d.nint) nint++; if (d.absc) absc++; if (d.nodu) nodu++; if (d.peri) peri++; if (d.manc) manc++
    const sano = d.cat === 0 && d.consol === 0 && !d.nint && !d.absc && !d.nodu && !d.peri && !d.manc && !pleur
    if (sano) {
      if (d.agua) agua++; if (d.sang) sang++; if (d.pete) pete++
      if ([d.agua, d.sang, d.pete].filter(Boolean).length >= 2) ambos++
    }
    cats[Math.min(6, Math.max(0, d.cat))]++
    sev[d.consol <= 0 ? 0 : d.consol <= 10 ? 1 : d.consol <= 30 ? 2 : 3]++
    LOBULOS.forEach((l) => (lob[l.id] += d.lob[l.id] || 0))
  }
  const m = n || 1
  LOBULOS.forEach((l) => (lob[l.id] /= m))
  const pct = (x: number) => (x / m) * 100
  return {
    n, idn: sumCat / m, consol: sumConsol / m, neum: pct(neumN), pleur: pct(pleurN), poliser: pct(poliser), gdp,
    nint: pct(nint), absc: pct(absc), nodu: pct(nodu), peri: pct(peri), manc: pct(manc),
    agua: pct(agua), sang: pct(sang), pete: pct(pete), ambos: pct(ambos),
    neumN, pleurN, cats, sev, lob, lotes: lotes.size,
  }
}

export type Nivel = 'sin' | 'leve' | 'mod' | 'sev'
/** Escala IDN: Sin lesión = 0 · Leve < 0,56 · Moderado 0,56–0,89 · Severo > 0,89. */
export const nivelIdn = (v: number): Nivel => (v <= 0 ? 'sin' : v < 0.56 ? 'leve' : v <= 0.89 ? 'mod' : 'sev')
export const NIVEL_TXT: Record<Nivel, string> = { sin: 'Sin lesión', leve: 'Leve', mod: 'Moderado', sev: 'Severo' }

const nf = (v: number, d: number) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Los 15 indicadores del comparativo y del Excel (mismo orden y nombres de antes). */
export const INDICADORES: { key: keyof Stats; lbl: string; fmt: (v: number) => string; grupo: string }[] = [
  { key: 'idn', lbl: 'IDN', fmt: (v) => nf(v, 2), grupo: 'Principales' },
  { key: 'consol', lbl: '% Consolidación', fmt: (v) => nf(v, 2) + '%', grupo: 'Principales' },
  { key: 'neum', lbl: '% Frecuencia neumonía', fmt: (v) => nf(v, 1) + '%', grupo: 'Principales' },
  { key: 'pleur', lbl: '% Frecuencia pleuritis', fmt: (v) => nf(v, 1) + '%', grupo: 'Principales' },
  { key: 'poliser', lbl: '% Poliserositis', fmt: (v) => nf(v, 1) + '%', grupo: 'Principales' },
  { key: 'gdp', lbl: 'Pérdidas GDP (kg)', fmt: (v) => nf(v, 1), grupo: 'Principales' },
  { key: 'nint', lbl: 'Neumonía intersticial', fmt: (v) => nf(v, 1) + '%', grupo: 'Otros hallazgos' },
  { key: 'absc', lbl: 'Absceso pulmón', fmt: (v) => nf(v, 1) + '%', grupo: 'Otros hallazgos' },
  { key: 'nodu', lbl: 'Nódulo pulmón', fmt: (v) => nf(v, 1) + '%', grupo: 'Otros hallazgos' },
  { key: 'peri', lbl: 'Pericarditis', fmt: (v) => nf(v, 1) + '%', grupo: 'Otros hallazgos' },
  { key: 'manc', lbl: 'Manchas de leche', fmt: (v) => nf(v, 1) + '%', grupo: 'Otros hallazgos' },
  { key: 'agua', lbl: 'Artefacto agua', fmt: (v) => nf(v, 1) + '%', grupo: 'Artefactos' },
  { key: 'sang', lbl: 'Artefacto sangre', fmt: (v) => nf(v, 1) + '%', grupo: 'Artefactos' },
  { key: 'pete', lbl: 'Petequias', fmt: (v) => nf(v, 1) + '%', grupo: 'Artefactos' },
  { key: 'ambos', lbl: 'Ambos artefactos', fmt: (v) => nf(v, 1) + '%', grupo: 'Artefactos' },
]

/** Texto de análisis y recomendación según el IDN (mismos textos del dashboard anterior). */
export function analisis(s: Stats) {
  const n = s.n || 1
  let recomendacion: string
  if (s.idn < 0.56) recomendacion = 'Resultados satisfactorios. Mantener el plan sanitario actual y continuar con el monitoreo periódico.'
  else if (s.idn <= 0.89) recomendacion = 'Presencia de neumonía sin constituir amenaza grave. Revisar factores de riesgo como densidad, ventilación, manejo y plan vacunal.'
  else recomendacion = 'Presencia de neumonía grave. Se recomienda revisión urgente del plan sanitario, condiciones de bioseguridad y manejo del lote.'
  const consol = s.consol <= 10 ? 'Baja consolidación pulmonar.' : s.consol <= 25 ? 'Consolidación moderada — revisar patógenos respiratorios.' : 'Alta consolidación — requiere intervención.'
  const pp = Math.round((s.pleurN / n) * 100)
  const pleur = pp === 0 ? 'Sin casos de pleuritis registrados.'
    : pp <= 20 ? `Frecuencia baja (${pp}%). Monitorear evolución.`
    : pp <= 40 ? `Frecuencia moderada (${pp}%). Revisar condiciones de alojamiento y manejo.`
    : `Frecuencia elevada (${pp}%). Requiere atención prioritaria — revisar plan sanitario.`
  return { recomendacion, consol, pleur, neum: `${s.neumN} de ${s.n} cerdos (${Math.round((s.neumN / n) * 100)}%)` }
}
