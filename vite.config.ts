import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative base so the same build works on Netlify, Vercel and GitHub Pages
  // (project pages serve from a /repo-name/ subpath).
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
