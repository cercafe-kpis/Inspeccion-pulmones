/**
 * Catálogos fijos del método Madec + catálogo de granjas DE RESPALDO.
 *
 * Las granjas "de verdad" vienen de la lista Granjas de SharePoint (ver catalogos/catalogoLocal.ts).
 * GRANJAS_RESPALDO solo se usa la primera vez que la app abre en un celular SIN señal y sin
 * ninguna copia guardada — para que nunca se quede sin poder capturar en campo.
 */

export interface Granja {
  /** granja_id (columna IdGranja). */
  id: number
  /** Nombre interno en mayúsculas — lo que se guarda en granja_nombre (columna Title). */
  n: string
  /** Nombre a mostrar (columna NombreVista). */
  v: string
}

export const GRANJAS_RESPALDO: Granja[] = [
  { id: 1, n: 'LA FABIOLA', v: 'La Fabiola' }, { id: 2, n: 'CAMPEON', v: 'Campeon' },
  { id: 3, n: 'SALAMANCA', v: 'Salamanca' }, { id: 4, n: 'EL BOSQUE', v: 'El Bosque' },
  { id: 6, n: 'BUENOS AIRES CER', v: 'Buenos Aires CER' }, { id: 8, n: 'CORCEGA', v: 'Corcega' },
  { id: 9, n: 'VERSALLES', v: 'Versalles' }, { id: 17, n: 'LA SELVA', v: 'La Selva' },
  { id: 18, n: 'OASIS', v: 'Oasis' }, { id: 19, n: 'BUENOS AIRES GAM', v: 'Buenos Aires GAM' },
  { id: 20, n: 'EL TREBOL', v: 'El Trebol' }, { id: 26, n: 'EL JAZMIN', v: 'El Jazmin' },
  { id: 27, n: 'CORCEGA WTF', v: 'Corcega WTF' }, { id: 28, n: 'EL ESTERO', v: 'El Estero' },
  { id: 30, n: 'ALAMOS', v: 'Alamos' }, { id: 33, n: 'CORCEGA WTF 2', v: 'Corcega WTF2' },
  { id: 36, n: 'LA CECILIA', v: 'La Cecilia' }, { id: 39, n: 'LA MARAVILLA', v: 'La Maravilla' },
  { id: 41, n: 'CRECERDOS', v: 'Crecerdos' }, { id: 42, n: 'PROCERDOS', v: 'Procerdos' },
  { id: 44, n: 'LA CIBERITA CDO', v: 'La Ciberita' }, { id: 46, n: 'SAN LUIS CEBA CDO', v: 'San Luis' },
  { id: 47, n: 'PRAGA CEBA CDO', v: 'Praga' }, { id: 49, n: 'MONTECERDO', v: 'Montecerdo' },
  { id: 50, n: 'SAN LORENZO CDO', v: 'San Lorenzo' }, { id: 51, n: 'AGROPECUARIA GUAIMARAL SAS', v: 'Guaymaral' },
  { id: 52, n: 'EL RUBI CDO', v: 'El Rubi' }, { id: 53, n: 'LA ABUELITA CDO', v: 'La Abuelita' },
  { id: 54, n: 'LA ESPERANZA CDO', v: 'La Esperanza' }, { id: 55, n: 'LA RUEDA CDO', v: 'La Rueda' },
  { id: 56, n: 'MIRAFLORES MB', v: 'Miraflores MB' }, { id: 57, n: 'CAMILO BLANDON SILVA - LOS MELLOS', v: 'Los Mellos' },
  { id: 68, n: 'MILONGA - LM', v: 'Milonga' }, { id: 69, n: 'EL_RENACER_LM', v: 'Renacer' },
  { id: 75, n: 'LA_BALSORA_INT', v: 'La Balsora int' }, { id: 76, n: 'PATIO_BONITO_INT', v: 'Patio Bonito int' },
  { id: 77, n: 'LA_PORQUERA_INT', v: 'La Porquera int' }, { id: 78, n: 'LA_HOLANDA_INT', v: 'La Holanda int' },
  { id: 79, n: 'EL_DIAMANTE_INT', v: 'El Diamante int' }, { id: 80, n: 'LA_ESPERANZA_INT', v: 'La Esperanza int' },
]

export interface Lobulo { id: string; label: string; peso: number; g: 'der' | 'izq' | 'acc' }

/** Pesos Madec reales por lóbulo (se guardan como enteros 0–100). */
export const LOBULOS: Lobulo[] = [
  { id: 'apical_derecho', label: 'Apical', peso: 0.11, g: 'der' },
  { id: 'cardiaco_derecho', label: 'Cardíaco', peso: 0.11, g: 'der' },
  { id: 'diafragmatico_derecho', label: 'Diafragmático', peso: 0.34, g: 'der' },
  { id: 'apical_izquierdo', label: 'Apical', peso: 0.06, g: 'izq' },
  { id: 'cardiaco_izquierdo', label: 'Cardíaco', peso: 0.06, g: 'izq' },
  { id: 'diafragmatico_izquierdo', label: 'Diafragmático', peso: 0.27, g: 'izq' },
  { id: 'accesorio', label: 'Accesorio', peso: 0.05, g: 'acc' },
]

export interface Hallazgo { id: string; label: string }

export const HALLAZGOS: Hallazgo[] = [
  { id: 'cicatriz_en_pulmones', label: 'Cicatriz pulmón' },
  { id: 'pleuritis_leve', label: 'Pleuritis leve' },
  { id: 'pleuritis_severa', label: 'Pleuritis severa' },
  { id: 'neumonia_intersticial', label: 'Neumonía intersticial' },
  { id: 'absceso_pulmon', label: 'Absceso pulmón' },
  { id: 'nodulo_pulmon', label: 'Nódulo pulmón' },
  { id: 'pericarditis', label: 'Pericarditis' },
  { id: 'manchas_leche', label: 'Manchas de leche' },
  { id: 'artefacto_agua', label: 'Artefacto agua' },
  { id: 'artefacto_sangre', label: 'Artefacto sangre' },
  { id: 'petequias', label: 'Petequias' },
]

/** Tabla de referencia de Cercafe: [% consolidación, pérdida de GDP en gr/día]. */
export const GDP: [number, number][] = [
  [0, 0], [5, 18.5], [10, 37], [15, 55.5], [20, 74], [25, 92.5], [30, 111], [35, 129.5], [40, 148], [45, 166.5], [50, 185],
]
