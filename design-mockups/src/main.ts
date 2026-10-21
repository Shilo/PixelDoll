import { mount } from 'svelte'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/600.css'
import '@fontsource-variable/nunito'
import './styles/tokens.css'
import './styles/app.css'
import { ui } from './state.svelte'
import App from './App.svelte'

const html = document.documentElement
const q = new URLSearchParams(location.search)
const mq = matchMedia('(prefers-color-scheme: dark)')
const scheme = () => q.get('scheme') ?? (mq.matches ? 'dark' : 'light')
const sync = () => {
  html.dataset.scheme = scheme()
  html.dataset.theme = scheme() // GlassKit reads data-theme
}
html.dataset.look = ui.look
sync()
mq.addEventListener('change', sync)

if (ui.look === 'B') {
  // GlassKit 1.29.0 (pinned, MIT) — single CSS file, chrome only (D1 / glasskit_review §6).
  await import('@jungherz-de/glasskit/glasskit.css')
  if (matchMedia('(prefers-reduced-transparency: reduce)').matches || q.get('surface') === 'solid') html.dataset.surface = 'solid'
  const coarse = matchMedia('(pointer: coarse), (max-width: 599px), (max-height: 499px)')
  const dens = () => (coarse.matches ? html.removeAttribute('data-density') : (html.dataset.density = 'compact'))
  dens()
  coarse.addEventListener('change', dens)
}

mount(App, { target: document.getElementById('app')! })
