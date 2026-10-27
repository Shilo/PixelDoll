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
function visibleInViewport(target: HTMLElement | null): target is HTMLElement {
  if (!target?.isConnected || !target.getClientRects().length || target.closest('[popover]:not(:popover-open)')) return false
  let { left, top, right, bottom } = target.getBoundingClientRect()
  left = Math.max(left, 0); top = Math.max(top, 0)
  right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight)
  for (let parent = target.parentElement; parent && right > left && bottom > top; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    const bounds = parent.getBoundingClientRect()
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right) }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom) }
  }
  return right > left && bottom > top
}
export function restoreTrigger(target: HTMLElement | null) {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')
  if (dialog) {
    if (visibleInViewport(target) && dialog.contains(target)) target.focus({ preventScroll: true })
    return
  }
  const fallback = [...document.querySelectorAll<HTMLElement>('.project-btn,.experience-header button')].find(visibleInViewport)
  ;(visibleInViewport(target) ? target : fallback)?.focus({ preventScroll: true })
}
const placements = new WeakMap<HTMLElement, () => void>()
const openers = new WeakMap<HTMLElement, HTMLElement>()
export function popoverFocus(event: {currentTarget: HTMLElement; newState: string}, focusFirst = true) {
  const menu = event.currentTarget
  const activated = openingTrigger()
  const source = activated?.getAttribute('popovertarget') === menu.id && visibleInViewport(activated)
    ? activated
    : [...document.querySelectorAll<HTMLElement>(`[popovertarget="${CSS.escape(menu.id)}"]`)].find(visibleInViewport) ?? null
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
        void computePosition(opener, menu, {
          strategy: 'fixed',
          placement: (menu.dataset.placement || 'bottom-end') as Placement,
          middleware: [
            offset(8),
            flip({ padding: 8, fallbackAxisSideDirection: 'start' }),
            shift({ padding: 8 }),
            size({ padding: 8, apply({ availableHeight }) {
              const maxHeight = `${Math.max(0, availableHeight)}px`
              if (surface.style.maxHeight !== maxHeight) surface.style.maxHeight = maxHeight
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
    if (focusFirst) requestAnimationFrame(() => {
      if (!menu.matches(':popover-open')) return
      // Hidden (phone-only) and disabled rows ignore focus(), so move on to the first row that takes it.
      for (const row of menu.querySelectorAll<HTMLElement>('button,[href],input')) { row.focus(); if (document.activeElement === row) break }
    })
  } else {
    openers.delete(menu)
    const surface = menu.querySelector<HTMLElement>(':scope > .bu-popover-surface')
    if (surface) surface.style.maxHeight = ''
    // Do not steal focus from a control/world the user clicked to dismiss it.
    if (document.activeElement === document.body || menu.contains(document.activeElement) || document.activeElement === opener) restoreTrigger(opener)
  }
}
