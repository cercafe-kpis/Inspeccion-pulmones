import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Build de la app de captura (Inspección Pulmonar).
 *
 * - base './' (rutas relativas): funciona igual en https://cercafe-kpis.github.io/Inspeccion-pulmones/
 *   sin depender del nombre exacto del repositorio.
 * - El service worker se sigue llamando `sw.js` y vive en la misma carpeta que antes: así REEMPLAZA
 *   al service worker viejo en los celulares que ya tienen la PWA instalada (mismo nombre + mismo
 *   alcance). Si se cambiara el nombre, el viejo seguiría activo en esos celulares.
 * - skipWaiting/clientsClaim: la versión nueva se activa sola apenas se descarga (mismo ajuste que
 *   tuvo que hacerse en la app de Recepción de Cerdos; sin esto la actualización nunca "llegaba").
 */
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false, // se usa public/manifest.json tal cual estaba
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,json}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: 'index.html',
        // recuperar.html es una página aparte: no debe caer en el fallback de index.html
        navigateFallbackDenylist: [/recuperar\.html/],
      },
    }),
  ],
})
