/** Svelte action: a backdrop click must begin and end outside the dialog, without dragging. */
export function backdropDismiss(dialog: HTMLDialogElement, dismiss: () => void) {
  let press: { id: number; x: number; y: number; released: boolean } | undefined
  const reset = () => { press = undefined }
  const outside = (event: MouseEvent) => {
    const { left, top, right, bottom } = dialog.getBoundingClientRect()
    return event.target === dialog && (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom)
  }
  // Allow small hand jitter while distinguishing clicks/taps from selection, scrolling, and dragging.
  const moved = (event: MouseEvent) => !press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8
  const down = (event: PointerEvent) => {
    reset()
    // Dismiss a nested native popover first, leaving its parent dialog intact.
    if (dialog.open && event.isPrimary && event.button === 0 && outside(event) && !dialog.querySelector('[popover]:popover-open')) {
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, released: false }
    }
  }
  const move = (event: PointerEvent) => {
    if (press?.id === event.pointerId && (moved(event) || event.buttons !== 1)) reset()
  }
  const up = (event: PointerEvent) => {
    if (!press || press.id !== event.pointerId || event.button !== 0 || !outside(event) || moved(event)) reset()
    else press.released = true
  }
  const click = (event: MouseEvent) => {
    const intentional = press?.released && event.button === 0 && outside(event) && !moved(event)
      && (!('pointerId' in event) || event.pointerId === press.id)
    reset()
    // Activate on click so the completed gesture cannot click through to the world beneath the modal.
    if (intentional && dialog.open && !event.defaultPrevented) dismiss()
  }
  const lostCapture = () => { if (!press?.released) reset() }
  const view = dialog.ownerDocument.defaultView!
  dialog.addEventListener('pointerdown', down, true)
  dialog.addEventListener('pointermove', move, true)
  dialog.addEventListener('pointerup', up, true)
  dialog.addEventListener('pointercancel', reset, true)
  dialog.addEventListener('lostpointercapture', lostCapture, true)
  dialog.addEventListener('click', click)
  dialog.addEventListener('close', reset)
  view.addEventListener('blur', reset)
  return {
    update(next: () => void) { dismiss = next; reset() },
    destroy() {
      reset()
      dialog.removeEventListener('pointerdown', down, true)
      dialog.removeEventListener('pointermove', move, true)
      dialog.removeEventListener('pointerup', up, true)
      dialog.removeEventListener('pointercancel', reset, true)
      dialog.removeEventListener('lostpointercapture', lostCapture, true)
      dialog.removeEventListener('click', click)
      dialog.removeEventListener('close', reset)
      view.removeEventListener('blur', reset)
    },
  }
}
