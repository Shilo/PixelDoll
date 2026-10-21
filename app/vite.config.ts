import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // ponytail: relative base so GitHub Pages subpath just works
  plugins: [svelte()],
})
