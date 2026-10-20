import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import { CONFIG, SCOPES_GRAPH, SCOPES_LOGIN } from '../config'
import { conTimeout, errTipo, type ErrorTipado } from '../graph/errores'

/**
 * Login con Microsoft — MISMA lógica y MISMA versión de MSAL (2.38.3) que la app anterior, a propósito:
 * así la sesión guardada en el celular sigue sirviendo y ningún técnico tiene que volver a iniciar sesión
 * por el cambio de estructura.
 */

let msalApp: PublicClientApplication | null = null

/**
 * Crea (una sola vez) la instancia de MSAL. cacheLocation 'localStorage' para que la sesión sobreviva
 * un cierre completo de la PWA (con sessionStorage, cerrar la app obligaba a reloguear justo cuando más
 * se necesita el token: para verificar duplicados al reabrir a mitad de un lote).
 */
export function crearMsalApp(): PublicClientApplication {
  if (msalApp) return msalApp
  msalApp = new PublicClientApplication({
    auth: {
      clientId: CONFIG.CLIENT_ID,
      authority: `https://login.microsoftonline.com/${CONFIG.TENANT_ID}`,
      redirectUri: location.origin + location.pathname,
    },
    cache: { cacheLocation: 'localStorage' },
  })
  return msalApp
}

/** ¿La app está dentro de otra página (web part "Insertar" de SharePoint / Tu.HUB)? */
export function enIframe(): boolean {
  try { return window.self !== window.top } catch { return true }
}

/**
 * MSAL deja una marca "interacción en curso" mientras hay un popup o redirect abierto. Si ese popup
 * se cerró mal (o un cierre de sesión no pudo terminar dentro de SharePoint), la marca queda pegada y
 * el siguiente login falla con "interaction_in_progress". Se borra antes de cada login manual.
 */
function limpiarInteraccionPegada() {
  for (const st of [sessionStorage, localStorage]) {
    try {
      Object.keys(st).filter((k) => k.includes('interaction.status')).forEach((k) => st.removeItem(k))
    } catch { /* almacenamiento bloqueado */ }
  }
}

/**
 * ¿Esta página es la ventana emergente de inicio de sesión de Microsoft que volvió a la app?
 * En ese caso la app NO debe arrancar ni tocar la respuesta (#code=…): la ventana principal la lee
 * y cierra esta ventana. Si la app la procesara, el inicio de sesión quedaría a medias.
 */
export function enPopupMsal(): boolean {
  try {
    if (!window.opener || window.opener === window) return false
    return (typeof window.name === 'string' && window.name.startsWith('msal.')) || /[#&?](code|error|state)=/.test(location.hash)
  } catch {
    return false
  }
}

/** initialize + procesar cualquier respuesta de redirect pendiente (cierra interacciones a medias). */
async function listo(): Promise<PublicClientApplication> {
  const app = crearMsalApp()
  await app.initialize()
  if (!enPopupMsal()) await app.handleRedirectPromise().catch((e) => console.warn('handleRedirectPromise:', (e as Error)?.message))
  return app
}

/** Login manual (botón "Iniciar sesión con Microsoft"). Devuelve la cuenta. */
export async function loginPopup(): Promise<AccountInfo> {
  const app = await listo()
  limpiarInteraccionPegada()
  // Dentro de SharePoint siempre se deja escoger la cuenta (para poder cambiar de usuario después de "Salir").
  const r = await app.loginPopup({ scopes: SCOPES_LOGIN, prompt: enIframe() ? 'select_account' : undefined })
  return r.account as AccountInfo
}

/** Al abrir la app: devuelve la cuenta ya guardada (sin pedir login) o null. */
export async function restaurarCuenta(): Promise<AccountInfo | null> {
  try {
    const app = await listo()
    const cuentas = app.getAllAccounts()
    return cuentas.length > 0 ? cuentas[0] : null
  } catch (e) {
    console.warn('No se pudo restaurar sesión automáticamente:', (e as Error).message)
    return null
  }
}

/**
 * Token para Microsoft Graph. Primero en silencio; si venció:
 *  - sin red → error tipo 'red' (no tiene sentido abrir el popup);
 *  - llamada automática (silencioso) → error tipo 'auth' (el navegador bloquearía el popup);
 *  - llamada por un toque del técnico → abre el popup de login.
 */
export async function getToken(silencioso?: boolean): Promise<string | null> {
  if (!msalApp) return null
  const cuenta = msalApp.getAllAccounts()[0]
  try {
    const r = await conTimeout(msalApp.acquireTokenSilent({ scopes: SCOPES_GRAPH, account: cuenta }), 20000, 'renovar sesión')
    return r.accessToken
  } catch (e) {
    const err = e as ErrorTipado & { errorCode?: string }
    if (!navigator.onLine || err.tipo === 'red' || /network|post_request_failed|endpoints_resolution/i.test(err.errorCode || '')) {
      throw errTipo('Sin conexión estable para renovar la sesión', 'red')
    }
    if (silencioso) {
      throw errTipo('La sesión de Microsoft venció — toque la barra azul para iniciar sesión', 'auth')
    }
    try {
      limpiarInteraccionPegada()
      const r = await msalApp.acquireTokenPopup({ scopes: SCOPES_GRAPH })
      return r.accessToken
    } catch (e2) {
      throw errTipo('No se pudo iniciar sesión: ' + ((e2 as Error)?.message || e2), 'auth')
    }
  }
}

/** ¿Hay una cuenta de Microsoft con sesión iniciada en este celular? */
export function haySesionMicrosoft(): boolean {
  try {
    return !!(msalApp && msalApp.getAllAccounts().length > 0)
  } catch {
    return false
  }
}

/**
 * Cierra la sesión.
 *  - App abierta directamente (celular / pestaña propia): cierre normal de Microsoft (redirect), como antes.
 *  - Dentro de SharePoint (iframe): la página de Microsoft no se deja mostrar dentro de otra página, así que
 *    solo se borra la sesión guardada en este navegador y se vuelve a la pantalla de login (sin navegar).
 * Devuelve false cuando el llamador debe mostrar el login él mismo.
 */
export async function logout(): Promise<boolean> {
  if (!msalApp) return false
  limpiarInteraccionPegada()
  if (enIframe()) {
    try {
      await msalApp.logoutRedirect({ onRedirectNavigate: () => false })
    } catch (e) {
      console.warn('logout local:', (e as Error)?.message)
    }
    limpiarInteraccionPegada()
    return false
  }
  await msalApp.logoutRedirect()
  return true
}
