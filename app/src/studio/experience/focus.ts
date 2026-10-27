import { arrow, autoUpdate, computePosition, flip, hide, offset, shift, size, type Placement } from '@floating-ui/dom'

/** Capture actual activation; WebKit pointer clicks need not focus a button. */
let trigger: HTMLElement | null = null
export function rememberActivation(event: Event) {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button,a,[role=button]') : null
  if (!target) return
  const popover = target.closest<HTMLElement>('[popover]')
  trigger = popover ? document.querySelector<HTMLElement>(`[popovertarget="${popover.id}"]`) : target
}
export function openingTrigger(): HTMLElement | null { return trigger?.isConnected ? trigger : document.activeElement as HTMLElement | null }
export function restoreTrigger(target: HTMLElement | null) {
  if (document.querySelector('dialog[open]')) return
  const visible = target?.isConnected && target.getClientRects().length && !target.closest('[popover]:not(:popover-open)')
  ;(visible ? target : document.querySelector<HTMLElement>('.project-btn,.experience-header button'))?.focus({preventScroll:true})
}
const placements = new WeakMap<HTMLElement, () => void>()
const openers = new WeakMap<HTMLElement, HTMLElement>()
export function popoverFocus(event: ToggleEvent & {currentTarget:EventTarget & HTMLElement}) {
  const menu = event.currentTarget
  const activated = openingTrigger()
  const source = activated?.getAttribute('popovertarget') === menu.id && activated.getClientRects().length
    ? activated
    : [...document.querySelectorAll<HTMLElement>(`[popovertarget="${CSS.escape(menu.id)}"]`)].find(el => el.getClientRects().length) ?? null
  const opener = event.newState === 'open' ? source : openers.get(menu) ?? source
  const prior = placements.get(menu)
  prior?.()
  placements.delete(menu)
  delete menu.dataset.positioned
  if (event.newState === 'open') {
    if (opener) openers.set(menu, opener)
    const surface = menu.querySelector<HTMLElement>(':scope > .bu-popover-surface')
    const pointer = menu.querySelector<HTMLElement>(':scope > .bu-popover-arrow')
    if (opener && surface && pointer) {
      let active = true
      let sequence = 0
      const place = () => {
        const current = ++sequence
        surface.style.maxHeight = ''
        void computePosition(opener, menu, {
          strategy: 'fixed',
          placement: (menu.dataset.placement || 'bottom-end') as Placement,
          middleware: [
            offset(8),
            flip({ padding: 8, fallbackAxisSideDirection: 'start' }),
            shift({ padding: 8 }),
            size({ padding: 8, apply({ availableHeight }) {
              surface.style.maxHeight = `${Math.max(0, availableHeight)}px`
            } }),
            arrow({ element: pointer, padding: 12 }),
            hide(),
          ],
        }).then(({ x, y, placement, middlewareData }) => {
          if (!active || current !== sequence) return
          if (middlewareData.hide?.referenceHidden) { menu.hidePopover(); return }
          menu.style.left = `${x}px`
          menu.style.top = `${y}px`
          menu.dataset.side = placement.split('-')[0]
          const point = middlewareData.arrow
          if (point?.x !== undefined) menu.style.setProperty('--bu-arrow-x', `${point.x}px`)
          if (point?.y !== undefined) menu.style.setProperty('--bu-arrow-y', `${point.y}px`)
          if (!point || Math.abs(point.centerOffset) > 1) menu.dataset.arrowHidden = ''
          else delete menu.dataset.arrowHidden
          menu.dataset.positioned = ''
        })
      }
      const stop = autoUpdate(opener, menu, place)
      placements.set(menu, () => { active = false; stop() })
    }
    requestAnimationFrame(() => {
      if (!menu.matches(':popover-open')) return
      // Hidden (phone-only) and disabled rows ignore focus(), so move on to the first row that takes it.
      for (const row of menu.querySelectorAll<HTMLElement>('button,[href],input')) { row.focus(); if (document.activeElement === row) break }
    })
  } else {
    openers.delete(menu)
    // Do not steal focus from a control/world the user clicked to dismiss it.
    if (document.activeElement === document.body || menu.contains(document.activeElement) || document.activeElement === opener) restoreTrigger(opener)
  }
}
