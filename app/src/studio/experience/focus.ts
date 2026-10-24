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
export function popoverFocus(event: ToggleEvent & {currentTarget:EventTarget & HTMLElement}) {
  const menu = event.currentTarget
  const opener = document.querySelector<HTMLElement>(`[popovertarget="${menu.id}"]`)
  const prior = placements.get(menu)
  if (prior) window.removeEventListener('resize', prior)
  if (event.newState === 'open') {
    // Position against the actual trigger, including short landscape viewports.
    // Native popover supplies top-layer behavior; the host owns placement only.
    const place = () => {
      if (!opener) return
      const rect = opener.getBoundingClientRect(), edge = 8
      Object.assign(menu.style, { position:'fixed', margin:'0', right:'auto', bottom:'auto', maxHeight:`${innerHeight-edge*2}px`, maxWidth:`${innerWidth-edge*2}px`, overflowY:'auto' })
      const width = menu.offsetWidth, height = menu.offsetHeight
      const below = innerHeight-rect.bottom-edge
      const preferred = below >= height || below >= rect.top ? rect.bottom+edge : rect.top-height-edge
      menu.style.left = `${Math.max(edge,Math.min(innerWidth-width-edge,rect.right-width))}px`
      menu.style.top = `${Math.max(edge,Math.min(innerHeight-height-edge,preferred))}px`
    }
    place()
    placements.set(menu, place)
    window.addEventListener('resize', place)
    menu.querySelector<HTMLElement>('button,[href],input')?.focus()
  } else {
    placements.delete(menu)
    // Do not steal focus from a control/world the user clicked to dismiss it.
    if (document.activeElement === document.body || menu.contains(document.activeElement) || document.activeElement === opener) restoreTrigger(opener)
  }
}
