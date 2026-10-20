# Inspección Pulmonar — Captura y Resultados

PWA de Cercafe para la inspección pulmonar porcina (**método Madec**). En una sola app:

- **Captura**: los técnicos registran, cerdo por cerdo, los lóbulos y hallazgos; funciona sin señal.
- **Resultados** (antes el dashboard aparte `dashboard-pulmones`): IDN, consolidación, lesiones, mapa pulmonar, comparativo entre granjas, Excel y PDF.
- **Administrar**: granjas, asociados y usuarios.

Los datos van a la lista de SharePoint `InspeccionPulmones` (sitio `Inspeccion_pulmones`) vía Microsoft Graph.

## Quién ve qué (lista Usuarios)

| Rol | Pestañas |
|---|---|
| Administrador | Captura · Resultados · Administrar. Con `?site=GAM` (ParametroSite) abre Resultados como lo ve ese asociado. |
| Tecnico | Captura · Resultados (todas las granjas) |
| Asociado | Solo Resultados, con los asociados de su columna `Asociados` (ej. `CERDOS DEL OTUN;LM`). `?site=` se ignora. |
| No registrado / inactivo | Sin acceso |

Sin señal y sin copia guardada del usuario, la app deja **capturar** (para no frenar el trabajo de campo); Resultados siempre necesita conexión.

**En cada Tu.HUB** se inserta: `https://cercafe-kpis.github.io/Inspeccion-pulmones/?vista=resultados` (el asociado igual solo ve Resultados). El botón "Abrir Tu.HUB" usa la columna `SitioTuHub` de Asociados.

### Resultados

- **Resumen**: IDN del periodo con nivel y variación frente al periodo anterior, cerdos/lotes/granjas, consolidación, neumonía, pleuritis, poliserositis, pérdidas GDP (todos con referencia "Red Cercafe" = todas las granjas en el mismo periodo), tabla de granjas con tendencia de 12 meses, lotes para revisar (últimos 60 días, moderado o severo), otras lesiones y artefactos.
- **Granja y consecutivos**: análisis y recomendación según el IDN, IDN por lote en el tiempo, mapa pulmonar (consolidación promedio por lóbulo), cerdos por categoría Madec, severidad individual y tabla de lotes (tocar un lote filtra todo a ese lote).
- **Comparativo**: cualquiera de los 15 indicadores por granja, severidad individual en barras 100 %, tabla por granja o por lote.
- **Excel** (15 indicadores, por granja o por lote) y **PDF** (imprime la pestaña abierta).
- Mismas fórmulas del dashboard anterior (`src/features/resultados/indicadores.ts`). Las inspecciones se guardan en el navegador (IndexedDB) y en cada visita solo se descarga lo nuevo.

## Versión 2 (octubre 2026): qué cambió

Para el técnico, **nada**: mismas pantallas, mismos textos, mismo login y mismo avance automático entre lóbulos. Lo que cambió es por dentro:

| Antes | Ahora |
|---|---|
| Todo en un solo `index.html` | Proyecto con Vite + TypeScript, un archivo por responsabilidad (ver estructura) |
| Granjas escritas en el código | Lista **Granjas** de SharePoint, administrable desde la app |
| Cualquier cuenta @cercafe podía capturar | Lista **Usuarios**: solo Rol `Tecnico` o `Administrador` |
| Se publicaba subiendo `index.html` | GitHub Actions construye y publica solo en cada push a `main` |
| Auto-actualización consultando la API de GitHub en cada apertura | El service worker se actualiza solo (y nunca recarga a mitad de un animal) |
| Duplicados verificados por granja + consecutivo + orden | Cada registro lleva `IdLocal` único; los viejos se siguen verificando como antes |

Se mantuvieron **a propósito**:
- la misma versión de MSAL (2.38.3) y los mismos scopes → nadie tiene que volver a iniciar sesión;
- las mismas claves del celular (`insp_pulmones_queue`, `insp_pulmones_orden_cache`, `insp_pulmones_sesion_activa`) → los pendientes de cada celular se suben solos después de actualizar, y `recuperar.html` sigue funcionando;
- el mismo nombre `sw.js` → reemplaza al service worker viejo en las PWA ya instaladas.

Nuevo además: la app recuerda el último orden capturado en el celular para cada lote (45 días) y lo usa como piso al sugerir el orden inicial. Es el refuerzo del incidente del 15-oct (lote que reinició en 1 tras volver a iniciar sesión).

## Listas de SharePoint

Ver `docs/sharepoint-listas-guia.html`: columnas exactas de `Asociados`, `Granjas`, `Usuarios`, la columna `IdLocal` e índices de `InspeccionPulmones`, y permisos.

## Estructura

```
index.html                 Mismo HTML de antes (+ botón "Administrar" oculto y pantalla s-admin)
public/                    manifest.json, íconos, recuperar.html (se copian tal cual)
src/
  main.ts                  Arranque, login/showApp, verificación de usuario, service worker
  config.ts                IDs de Azure AD, sitio, nombres de listas, APP_VERSION
  state.ts                 Estado compartido (sesión de captura, valores, banderas de sync)
  styles.css               CSS de antes sin cambios + sección ADMIN
  auth/msal.ts             Login, token, logout (MSAL 2.38.3)
  graph/errores.ts         Errores tipados (red / auth / http), timeouts
  graph/client.ts          Cliente Graph genérico (sitio, listas, paginación, crear/actualizar)
  graph/inspecciones.ts    Guardar un cerdo, órdenes existentes, verificación de duplicados
  graph/catalogos.ts       Lectura/escritura de Granjas, Asociados, Usuarios
  catalogos/datos.ts       Lóbulos y pesos Madec, hallazgos, tabla GDP, granjas de respaldo
  catalogos/catalogoLocal.ts  Copia en el celular de granjas activas y del usuario (para trabajar sin señal)
  offline/cola.ts          Cola de pendientes (localStorage)
  offline/sync.ts          Sincronización automática y manual
  ui/avisos.ts             Toasts, barra de pendientes, versión, cambio de pantalla
  utils/madec.ts           Consolidación, categoría, severidad, GDP, IdLocal
  features/captura/        Buscador de granja, lóbulos, hallazgos, sesión/orden sugerido, guardado
  features/admin/admin.ts  Pantalla de administración (solo Rol Administrador)
  features/resultados/     Resultados: datos y alcance por rol, indicadores, gráficas SVG, vistas, Excel/PDF
                           (se descarga solo cuando alguien abre la pestaña)
  ui/navegacion.ts         Pestañas Captura · Resultados · Administrar según el rol
test/msalMock.ts           Solo pruebas locales (npx vite build --mode test): login ficticio
```

## Reglas de negocio (sin cambios)

- Lóbulos como enteros **0–100**. Pesos Madec: Apical der. 11 %, Cardíaco der. 11 %, Diafragmático der. 34 %, Apical izq. 6 %, Cardíaco izq. 6 %, Diafragmático izq. 27 %, Accesorio 5 %.
- Categoría por bandas de 10 con límite inferior estricto (`>X && <=Y`); 0 % = categoría 0.
- El IDN del lote se calcula en el dashboard (Σ categorías ÷ cerdos), no aquí. Al técnico nunca se le muestran indicadores.

## Trabajar en el código

```bash
npm install
npm run dev      # http://localhost:5173 (el login solo funciona si esa URL está como Redirect URI en Azure AD)
npm run build    # verifica tipos y genera dist/
```

## Publicar

1. Una sola vez: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Subir `APP_VERSION` en `src/config.ts`.
3. `git push` a `main`. El workflow `.github/workflows/deploy.yml` construye y publica en unos 2 minutos. El pie de la app muestra la versión para confirmar que el celular ya la tiene.

**Volver a la versión anterior:** revertir el commit (`git revert`), hacer push y cambiar **Settings → Pages → Source** de nuevo a "Deploy from a branch" (`main` / raíz), porque la versión anterior no usa el workflow. Los pendientes de los celulares no se pierden en ningún sentido: las dos versiones usan las mismas claves.
