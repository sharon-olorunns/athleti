import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative base so the same build works on Netlify, Vercel and GitHub Pages
  // (project pages serve from a /repo-name/ subpath).
  base: './',
  plugins: [
    react(),
    VitePWA({
      /*
       * 'prompt' rather than 'autoUpdate': a new service worker must never take
       * over mid-workout. The app offers the update as a banner and reloads only
       * when the user says so, and never while a session is in progress.
       */
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        // The whole app is a handful of files; precaching all of them is what
        // makes aeroplane mode work on first open after install.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Nothing here is fetched from a network at runtime, so there is no
        // runtime caching to configure.
      },
      manifest: {
        name: 'Trainer',
        short_name: 'Trainer',
        description: 'Offline workout tracker and gym timer',
        // Relative, so an install from a subpath scopes correctly.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0810',
        theme_color: '#0a0810',
        categories: ['health', 'fitness'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
