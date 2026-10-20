// SOLO PARA PRUEBAS LOCALES (npx vite build --mode test): reemplaza MSAL por una cuenta ficticia.
import type { AccountInfo } from '@azure/msal-browser'
const cuenta = () => ({ username: localStorage.getItem('mockUser') || 'admin@test.co', name: 'Usuario Prueba' }) as AccountInfo
export function crearMsalApp() { return null }
export async function loginPopup() { return cuenta() }
export async function restaurarCuenta() { return localStorage.getItem('mockLogged') ? cuenta() : null }
export async function getToken() { return 'token-falso' }
export function haySesionMicrosoft() { return true }
export function logout() { return true }
