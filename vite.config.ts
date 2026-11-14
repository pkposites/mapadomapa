import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import netlify from '@netlify/vite-plugin'
import { readFileSync } from 'node:fs'

// Data de abertura dos pedidos: fonte única em shared/launch.ts (lida como texto para não depender do carregador de TS).
const REQUESTS_OPEN_LABEL = readFileSync(new URL('./shared/launch.ts', import.meta.url), 'utf8').match(/REQUESTS_OPEN_DATE = '(\d{4})-(\d{2})-(\d{2})'/)!.slice(1).reverse().join('/')

/**
 * Rede de segurança SÓ do servidor de desenvolvimento: se o navegador abortar uma requisição
 * no meio (ex.: trocar de página durante um POST), o middleware do @netlify/dev rejeita uma
 * promessa sem tratamento e o Node encerraria o servidor. Aqui apenas registramos e seguimos.
 * (Não existe no build nem em produção.)
 */
function keepDevServerAlive() {
  const FLAG = '__MDM_DEV_GUARD__'
  const g = globalThis as Record<string, unknown>
  if (g[FLAG]) return
  g[FLAG] = true
  process.on('unhandledRejection', (err) => {
    console.warn('[dev] requisição abortada/erro ignorado para manter o servidor ativo:', (err as Error)?.message ?? err)
  })
}

export default defineConfig(({ command }) => {
  if (command === 'serve') keepDevServerAlive()
  return {
  // O banco local (.netlify/db) grava arquivos o tempo todo; vigiá-los deixava o servidor a >100% de CPU.
  server: { watch: { ignored: ['**/.netlify/**', '**/dist/**', '**/e2e/**', '**/tests/**', '**/docs/**', '**/brand/**'] } },
  plugins: [
    // index.html lê a data de abertura da fonte única (shared/launch.ts)
    { name: 'launch-date', transformIndexHtml: (html: string) => html.replaceAll('%REQUESTS_OPEN_LABEL%', REQUESTS_OPEN_LABEL) },
    // Emula Functions + banco local. Edge Functions desligadas (o projeto não usa; evita depender do Deno).
    netlify({ edgeFunctions: { enabled: false } }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // o registro é feito em src/main.tsx (com verificação periódica de nova versão)
      includeAssets: ['favicon.ico', 'favicon.png', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'Mapa do Mapa',
        short_name: 'Mapa do Mapa',
        description:
          'Receba pedidos de orçamento direto no seu celular. Pré-cadastro gratuito em São Paulo.',
        lang: 'pt-BR',
        id: '/area',
        start_url: '/area',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#141715',
        theme_color: '#141715',
        shortcuts: [
          { name: 'Mensagens', short_name: 'Mensagens', url: '/area/mensagens', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Meu Perfil', short_name: 'Perfil', url: '/area/perfil', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Versão nova assume sem reinstalar; nada de /api entra no cache (cadastro e mensagens sempre frescos).
        importScripts: ['push-sw.js'], // avisos push (public/push-sw.js)
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
        // Só rotas reais do app usam o index.html offline; endereços inexistentes vão à rede e recebem a página 404.
        navigateFallbackAllowlist: [/^\/$/, /^\/(cadastro|entrar|privacidade|termos|conta|profissional|area|admin)(\/.*)?$/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // A landing é em português: só precisamos dos subconjuntos latinos da fonte.
        globIgnores: ['**/*cyrillic*', '**/*greek*', '**/*vietnamese*', '**/push-sw.js'],
      },
    }),
  ],
  }
})
