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

/** Login manual (botón "Iniciar sesión con Microsoft"). Devuelve la cuenta. */
export async function loginPopup(): Promise<AccountInfo> {
  const app = crearMsalApp()
  await app.initialize()
  const r = await app.loginPopup({ scopes: SCOPES_LOGIN })
  return r.account as AccountInfo
}

/** Al abrir la app: devuelve la cuenta ya guardada (sin pedir login) o null. */
export async function restaurarCuenta(): Promise<AccountInfo | null> {
  try {
    const app = crearMsalApp()
    await app.initialize()
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

/** Cierra la sesión de Microsoft. Devuelve false si no había MSAL (el llamador muestra el login). */
export function logout(): boolean {
  if (!msalApp) return false
  msalApp.logout()
  return true
}
