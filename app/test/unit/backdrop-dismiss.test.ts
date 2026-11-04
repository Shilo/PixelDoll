import { describe, expect, test, vi } from 'vitest'
import { backdropDismiss } from '../../src/studio/backdropDismiss.ts'

function setup() {
  const view = new EventTarget()
  const dialog = Object.assign(new EventTarget(), {
    open: true,
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 400, bottom: 400 }),
    querySelector: vi.fn((): object | null => null),
  }) as unknown as HTMLDialogElement
  const dismiss = vi.fn(), action = backdropDismiss(dialog, dismiss), content = new EventTarget()
  function send(type: string, fields: Record<string, unknown> = {}, target: EventTarget = dialog) {
    const event = Object.assign(new Event(type, { cancelable: true }), { clientX: 50, clientY: 50, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true }, fields)
    Object.defineProperty(event, 'target', { value: target })
    dialog.dispatchEvent(event)
  }
  const tap = () => { send('pointerdown'); send('pointerup'); send('click') }
  return { dialog, view, content, dismiss, action, send, tap }
}

describe('intentional backdrop dismissal', () => {
  test.each(['mouse', 'touch', 'pen'])('%s closes once after a completed backdrop click with small jitter', pointerType => {
    const s = setup()
    s.send('pointerdown', { pointerType })
    s.send('pointermove', { pointerType, clientX: 53 })
    s.send('pointerup', { pointerType, clientX: 53 })
    expect(s.dismiss).not.toHaveBeenCalled()
    // Touch releases implicit pointer capture before the synthesized click.
    s.send('lostpointercapture')
    s.send('click', { pointerType, clientX: 53 }); s.send('click')
    expect(s.dismiss).toHaveBeenCalledTimes(1)
    s.action.destroy()
  })

  test('content-to-backdrop and backdrop-to-content releases never close', () => {
    const s = setup()
    s.send('pointerdown', { clientX: 150, clientY: 150 }, s.content)
    s.send('pointerup'); s.send('click')
    s.send('pointerdown'); s.send('pointerup', { clientX: 150, clientY: 150 }, s.content); s.send('click')
    expect(s.dismiss).not.toHaveBeenCalled()
    s.tap(); expect(s.dismiss).toHaveBeenCalledTimes(1)
    s.action.destroy()
  })

  test('bare dialog space inside its bounds is content, including captured touch releases outside', () => {
    const s = setup()
    s.send('pointerdown', { clientX: 150, clientY: 150 }); s.send('pointerup'); s.send('click')
    s.send('pointerdown'); s.send('pointerup', { clientX: 150, clientY: 150 }); s.send('click')
    expect(s.dismiss).not.toHaveBeenCalled()
    s.action.destroy()
  })

  test('backdrop drags remain canceled after returning to their starting point', () => {
    const s = setup()
    s.send('pointerdown'); s.send('pointermove', { clientX: 80 }); s.send('pointermove'); s.send('pointerup'); s.send('click')
    s.send('pointerdown'); s.send('pointerup', { clientX: 80 }); s.send('click', { clientX: 80 })
    expect(s.dismiss).not.toHaveBeenCalled()
    s.action.destroy()
  })

  test.each(['pointercancel', 'lostpointercapture', 'close', 'blur'])('%s clears an unfinished gesture', event => {
    const s = setup()
    s.send('pointerdown')
    if (event === 'blur') s.view.dispatchEvent(new Event('blur'))
    else s.send(event)
    s.send('pointerup'); s.send('click')
    expect(s.dismiss).not.toHaveBeenCalled()
    s.tap(); expect(s.dismiss).toHaveBeenCalledTimes(1)
    s.action.destroy()
  })

  test('secondary buttons, multitouch, mismatched pointers and orphan clicks never close', () => {
    const s = setup()
    s.send('click')
    s.send('pointerdown', { button: 2 }); s.send('pointerup'); s.send('click')
    s.send('pointerdown'); s.send('pointerdown', { pointerId: 2, isPrimary: false }); s.send('pointerup'); s.send('click')
    s.send('pointerdown'); s.send('pointerup', { pointerId: 2 }); s.send('click')
    s.send('pointerdown'); s.send('pointerup'); s.send('click', { pointerId: 2 })
    s.send('pointerdown'); s.send('pointermove', { buttons: 3 }); s.send('pointerup'); s.send('click')
    expect(s.dismiss).not.toHaveBeenCalled()
    s.action.destroy()
  })

  test('a nested open popover consumes the backdrop gesture before its parent', () => {
    const s = setup()
    vi.mocked(s.dialog.querySelector).mockReturnValueOnce({} as Element)
    s.send('pointerdown'); s.send('pointerup'); s.send('click')
    expect(s.dismiss).not.toHaveBeenCalled()
    s.tap(); expect(s.dismiss).toHaveBeenCalledTimes(1)
    s.action.destroy()
  })

  test('uses the latest cancellation guard and removes listeners on destroy', () => {
    const s = setup(), next = vi.fn()
    let disabled = true
    s.action.update(() => { if (!disabled) next() })
    s.tap(); expect(next).not.toHaveBeenCalled()
    disabled = false
    s.tap(); expect(next).toHaveBeenCalledTimes(1)
    s.send('pointerdown'); s.send('pointerup'); s.action.update(next); s.send('click')
    expect(next).toHaveBeenCalledTimes(1)
    s.action.destroy(); s.tap()
    expect(next).toHaveBeenCalledTimes(1)
    expect(s.dismiss).not.toHaveBeenCalled()
  })
})
