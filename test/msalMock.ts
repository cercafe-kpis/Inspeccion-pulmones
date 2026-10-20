// SOLO PARA PRUEBAS LOCALES (npx vite build --mode test): reemplaza MSAL por una cuenta ficticia.
import type { AccountInfo } from '@azure/msal-browser'
const cuenta = () => ({ username: localStorage.getItem('mockUser') || 'admin@test.co', name: 'Usuario Prueba' }) as AccountInfo
export function crearMsalApp() { return null }
export async function loginPopup() { return cuenta() }
export async function restaurarCuenta() { return localStorage.getItem('mockLogged') ? cuenta() : null }
export async function getToken(silencioso?: boolean) { if (silencioso && localStorage.getItem('mockSilentFail')) { const e = new Error('La sesión de Microsoft venció') as Error & { tipo?: string }; e.tipo = 'auth'; throw e } return 'token-falso' }
export function haySesionMicrosoft() { return true }
export async function logout() { localStorage.removeItem("mockUser"); return false }
export function enPopupMsal() { return false }
export function enIframe() { return false }
