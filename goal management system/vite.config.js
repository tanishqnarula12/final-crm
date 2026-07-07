import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest, not generateSW: src/sw.js has custom Web Push
      // (`push` / `notificationclick`) handlers the generated variant can't express.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        // The vendor JS chunk (recharts/xlsx/socket.io/lucide) runs ~9 MB
        // unminified-gzip; raise well past the 2 MB default rather than
        // exclude it from precache.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        // Lets `npm run dev` exercise the SW/push path without a full build.
        enabled: true,
        type: 'module',
      },
      manifest: {
        id: '/',
        name: 'Team Fintness CRM',
        short_name: 'Fintness CRM',
        description: 'Team Fintness — client, goal, lead and proposal management CRM.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        orientation: 'portrait-primary',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
