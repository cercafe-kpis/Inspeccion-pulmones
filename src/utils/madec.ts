import { CONFIG } from '../config'
import { GDP, LOBULOS } from '../catalogos/datos'

/**
 * Interpola la pérdida de ganancia diaria de peso (GDP, gr/día) a partir del % de consolidación
 * pulmonar, con la tabla de referencia de Cercafe (interpolación lineal entre los dos puntos más cercanos).
 */
export function interpGDP(p: number): number {
  if (p <= 0) return 0
  for (let i = 1; i < GDP.length; i++) {
    const [p0, v0] = GDP[i - 1], [p1, v1] = GDP[i]
    if (p <= p1) return v0 + ((p - p0) / (p1 - p0)) * (v1 - v0)
  }
  return GDP[GDP.length - 1][1]
}

/** Fecha de HOY en hora local (YYYY-MM-DD). toISOString() daba la fecha UTC → después de las 7 pm en Colombia salía "mañana". */
export function fechaLocalHoy(): string {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/**
 * Calcula los indicadores de UN animal (se guardan pero nunca se muestran al técnico).
 * Mismas reglas exactas que la versión anterior:
 *  - consolidación = Σ lóbulo/100 × peso Madec × 100
 *  - categoría por bandas de 10 con límite inferior estricto (0 % = categoría 0)
 *  - severidad por el índice ponderado
 *  - pérdida de GDP en gr/día y kg del ciclo de ceba
 * El IDN del LOTE se calcula en el dashboard (Σ categorías ÷ cerdos), no aquí.
 */
export function calcularIndicadores(lobVals: Record<string, number | null>, hallVals: Record<string, 0 | 1>) {
  const idn = LOBULOS.reduce((s, l) => s + ((lobVals[l.id] || 0) / 100) * l.peso, 0)
  const consol = idn * 100
  let categ = 0
  if (consol > 0 && consol <= 10) categ = 1
  else if (consol > 10 && consol <= 20) categ = 2
  else if (consol > 20 && consol <= 30) categ = 3
  else if (consol > 30 && consol <= 40) categ = 4
  else if (consol > 40 && consol <= 50) categ = 5
  else if (consol > 50) categ = 6
  const gdpGr = interpGDP(consol)
  const gdpKg = (gdpGr * CONFIG.DIAS_CEBA) / 1000
  let sev = 'Sin afectacion'
  if (idn > 0.1 && idn <= 0.25) sev = 'Leve'
  else if (idn <= 0.5) sev = 'Moderada'
  else if (idn > 0.5) sev = 'Severa'
  const pleurT = hallVals.pleuritis_leve === 1 || hallVals.pleuritis_severa === 1
  return { consol, categ, sev, pleurT, gdpGr, gdpKg }
}

/** Identificador único por registro (columna IdLocal) — evita duplicados al reintentar subidas. */
export function nuevoIdLocal(): string {
  try {
    if (crypto && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch { /* navegadores viejos */ }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 10)
}
