# Inspección Pulmonar — App de captura de campo

PWA (aplicación web instalable) para que los técnicos de Cercafe registren, cerdo por cerdo, la evaluación de lóbulos pulmonares con el **método Madec** y los hallazgos asociados (pleuritis, neumonía, etc.) directamente en planta/campo, desde el celular.

Este repositorio contiene la **app de captura**. El análisis y los resultados por lote se muestran en un repositorio aparte: [`dashboard-pulmones`](https://github.com/cercafe-kpis/dashboard-pulmones), dentro de la misma organización [`cercafe-kpis`](https://github.com/cercafe-kpis).

## Qué hace

- El técnico elige granja, consecutivo del lote y fecha una sola vez por sesión.
- Por cada animal, captura el % de consolidación de 7 lóbulos pulmonares (peso Madec) y marca hallazgos (Sí/No).
- La casilla de cada lóbulo **avanza sola** a la siguiente en cuanto detecta que el valor está completo, sin que el técnico tenga que tocar la pantalla — pensado para hacer la captura en segundos.
- Al reanudar un lote que se dividió en varios momentos (por ejemplo, si se inspeccionaron otros lotes en el medio), la app **sugiere automáticamente** en qué número de orden va, para evitar duplicar animales.
- Funciona **sin conexión**: si no hay señal, el registro se guarda en el celular y se sincroniza solo en cuanto vuelve la conexión.
- Al técnico **nunca se le muestran indicadores calculados** (IDN, categoría, severidad). Esta app es solo de captura de datos crudos; el análisis vive en el dashboard.

## Cómo se guarda la información

Cada registro se envía a una lista de **SharePoint** (`InspeccionPulmones`) vía **Microsoft Graph API**, autenticando al técnico con **MSAL** (login de Microsoft/Azure AD).

Si no hay señal (o falla la escritura por red), el registro se guarda en una cola local en el celular (`localStorage`) y se sube automáticamente en cuanto se recupera la conexión, o manualmente si el técnico toca la barra de "pendientes por sincronizar".

## Estructura del código

Todo vive en un único archivo `index.html` (HTML + CSS + JS embebidos), organizado en estas secciones, en este orden:

1. **CONFIG + catálogos** — credenciales de Azure AD, lista de lóbulos (`LOBULOS`) con sus pesos Madec, lista de hallazgos (`HALLAZGOS`), tabla de referencia de pérdida de GDP.
2. **MSAL + Graph** — login, obtención de token, lectura/escritura en SharePoint.
3. **Cola offline** — guardar localmente y sincronizar después.
4. **Dropdown de búsqueda de granja**.
5. **Captura de lóbulos** — con el avance automático de casilla.
6. **Captura de hallazgos** — toggles Sí/No.
7. **Sugerencia automática de "orden inicial"** al reanudar un lote.
8. **Guardado del animal** — cálculo de % de consolidación, categoría, severidad y pérdida de GDP (solo se guardan, no se muestran).

El archivo tiene comentarios estilo JSDoc antes de cada función explicando qué hace, sus parámetros y cuándo se dispara — es el primer lugar para mirar si algo no se entiende.

## Reglas de negocio importantes

- Los lóbulos se guardan como enteros **0–100** (no 0–1).
- Pesos Madec: Apical Der. 11%, Cardíaco Der. 11%, Diafragmático Der. 34%, Apical Izq. 6%, Cardíaco Izq. 6%, Diafragmático Izq. 27%, Accesorio 5%.
- El **IDN (Índice de Neumonía) del lote** se calcula en el dashboard a nivel de lote como `CT/TCE` (suma de categorías ÷ total de animales evaluados) — **no** como el promedio de un índice Madec por animal. Por eso el campo `indice_madec` no existe a nivel de registro individual: el cálculo por animal en `guardarYSiguiente()` es solo un paso intermedio para clasificar categoría/severidad de ese animal, y no se guarda como tal.
- La categoría por % de consolidación requiere límite inferior estricto (`consol>X && consol<=Y`); un límite sin cota inferior asignaba mal la categoría 2 a animales con 0% de consolidación.

## Despliegue / configuración

Ver el bloque de comentarios **"CONFIGURACIÓN Y DESPLIEGUE"** al final de `index.html` — tiene el paso a paso completo:

1. App Registration en Azure AD (tipo SPA, permisos `User.Read` + `Sites.ReadWrite.All`, Redirect URI = URL de GitHub Pages).
2. Columnas exactas que debe tener la lista `InspeccionPulmones` en SharePoint (texto, número, fecha, sí/no).
3. Publicar este archivo en GitHub Pages.
4. Embeber la URL de GitHub Pages en una página de SharePoint.

**Auto-actualización:** la app revisa el último commit de este archivo en GitHub y se recarga sola si detecta una versión nueva — no hace falta que el técnico reinstale nada, basta con hacer `push` a `main`.

## Problemas ya resueltos (para no repetirlos)

- **Filtrar por columnas no indexadas en SharePoint vía Graph** (`granja_id`, `consecutivo`) devuelve error 400 si no se agrega el header `Prefer: HonorNonIndexedQueriesWarningMayFailRandomly` en la petición — aunque los datos sí existan en la lista.
- **`acquireTokenPopup` (MSAL)** requiere un gesto de usuario (click) para no ser bloqueado por el navegador; evitar dispararlo desde temporizadores automáticos sin interacción reciente.
- **Categoría de consolidación:** usar siempre límite inferior estricto en las comparaciones (`>X && <=Y`), nunca solo `<=Y`, para no asignar mal la categoría 1 a animales con 0% de consolidación.

## Repos relacionados

| Repo | Qué es |
|---|---|
| `cercafe-kpis/Inspeccion-pulmones` (este) | App de captura para técnicos de campo |
| `cercafe-kpis/dashboard-pulmones` | Dashboard de análisis de resultados por lote |
