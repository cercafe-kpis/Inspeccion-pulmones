# Inspección Pulmonar — App de captura de campo

PWA para que los técnicos de Cercafe registren, cerdo por cerdo, la evaluación de lóbulos pulmonares con el **método Madec** y los hallazgos asociados. Los datos van a la lista de SharePoint `InspeccionPulmones` (sitio `Inspeccion_pulmones`) vía Microsoft Graph. El análisis está en el repositorio aparte [`dashboard-pulmones`](https://github.com/cercafe-kpis/dashboard-pulmones).

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
