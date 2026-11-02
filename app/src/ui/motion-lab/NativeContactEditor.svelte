<script lang="ts">
  import { untrack } from 'svelte';
  import type { Img } from '../../lib/image/png.ts';
  import { createNativeContactDraft, measureNativeContacts, nativeContactExport, nativeContactKey, validateNativeContacts, type NativeContactBinding, type NativeContactMark } from './native-contacts.ts';
  let { binding, images, index, pause }: { binding: NativeContactBinding; images: Img[]; index: number; pause: () => void } = $props();
  let draft = $state(untrack(() => createNativeContactDraft($state.snapshot(binding)))), track = $state<NativeContactMark['track']>('A'), landmark = $state<NativeContactMark['landmark']>('heel'), stance = $state('stance-1');
  let canvas = $state<HTMLCanvasElement>(), error = $state(''), status = $state(''), ready = $state(false);
  const measured = $derived(measureNativeContacts(draft));
  $effect(() => {
    const expected = $state.snapshot(binding), sources = images; let active = true;
    draft = createNativeContactDraft(expected); ready = false; error = ''; status = '';
    void (async () => {
      const key = await nativeContactKey(expected), saved = localStorage.getItem(key);
      const checked = await validateNativeContacts(saved ? JSON.parse(saved) : createNativeContactDraft(expected), expected, sources);
      if (active) { draft = checked; ready = true; }
    })().catch(e => { if (active) { error = e instanceof Error ? e.message : String(e); } });
    return () => { active = false; };
  });
  $effect(() => {
    if (!canvas || !images[index]) return;
    const image = images[index], context = canvas.getContext('2d')!;
    canvas.width = image.w; canvas.height = image.h; context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.w, image.h), 0, 0);
    for (const mark of draft.marks.filter(m => m.frame === index)) { context.fillStyle = mark.track === 'A' ? '#ff6565' : '#657eff'; context.fillRect(mark.x - 1, mark.y, 3, 1); context.fillRect(mark.x, mark.y - 1, 1, 3); }
  });
  function mark(event: PointerEvent) {
    if (!ready || !canvas || !images[index]) return; pause();
    const rect = canvas.getBoundingClientRect(), x = Math.floor((event.clientX - rect.left) * canvas.width / rect.width), y = Math.floor((event.clientY - rect.top) * canvas.height / rect.height);
    if (!stance.trim()) { error = 'Enter a stance label before marking its visible foot.'; return; }
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || images[index].data[(y * canvas.width + x) * 4 + 3] !== 255) { error = 'Choose an opaque pixel on the same visible heel or toe contour. Leave hidden feet unmarked.'; return; }
    draft.marks = [...draft.marks.filter(m => !(m.frame === index && m.track === track && m.stance === stance)), { frame: index, track, landmark, stance, x, y }]; error = '';
  }
  function speed(axis: 'x' | 'y', event: Event) { const input = event.target as HTMLInputElement; draft.speed[axis] = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null; error = input.value.trim() && draft.speed[axis] === null ? 'Enter a finite 2D speed or leave it unset.' : ''; }
  async function action(fn: () => Promise<void>) { try { await fn(); error = ''; } catch (e) { error = e instanceof Error ? e.message : String(e); } }
  async function save() { const expected = $state.snapshot(binding), value = $state.snapshot(draft), sources = images, key = await nativeContactKey(expected), checked = await validateNativeContacts(value, expected, sources); localStorage.setItem(key, JSON.stringify(checked)); status = 'Native foot draft saved locally, including unset speed and unmarked feet.'; }
  async function reset() { const expected = $state.snapshot(binding), key = await nativeContactKey(expected), checked = await validateNativeContacts(createNativeContactDraft(expected), expected, images); if (key !== await nativeContactKey(binding)) throw new Error('The native source changed while resetting its review.'); draft = checked; ready = true; status = 'Started an empty native foot draft. Save to replace the prior local draft.'; }
  async function imported(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    if (file.size > 2_000_000) throw new Error('Native foot review exceeds 2 MB.');
    const expected = $state.snapshot(binding), sources = images, key = await nativeContactKey(expected), checked = await validateNativeContacts(JSON.parse(await file.text()), expected, sources);
    if (key !== await nativeContactKey(binding)) throw new Error('The native source changed while importing. Select its matching review again.');
    draft = checked; ready = true; status = 'Imported review for these exact frames and durations.';
  }
  async function exported() {
    const data = await nativeContactExport($state.snapshot(draft), binding, images), url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = 'native-foot-review.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status = 'Exported partial, unqualified native foot evidence.';
  }
</script>
<section class="native-contacts bu-stack" aria-label="Native 2D foot review">
  <h4>Native 2D foot review</h4><p>Manually track visible feet as A and B, without guessing anatomical side. Keep the same heel or toe contour landmark and stance label across marked frames. Leave hidden or ambiguous feet unmarked. No camera, 3D contact or body correction is inferred.</p>
  <label>Import native foot review<input type="file" accept="application/json" onchange={e => action(() => imported(e))}></label>
  <div class="bu-actions"><label>Foot track<select class="bu-select" bind:value={track}><option>A</option><option>B</option></select></label><label>Native foot landmark<select class="bu-select" bind:value={landmark}><option value="heel">Heel</option><option value="toe">Toe</option></select></label><label>Stance label<input class="bu-input" bind:value={stance}></label><button class="bu-btn" disabled={!ready} onclick={() => draft.marks = draft.marks.filter(m => !(m.frame === index && m.track === track && m.stance === stance))}>Clear selected foot mark</button></div>
  <p>Explicit 2D travel speed in native pixels/second. Positive X points right; positive Y points down. Leave either component blank when unknown. This does not change playback or the body.</p>
  <div class="bu-actions"><label>Native travel X, px/s<input class="bu-input" type="number" value={draft.speed.x ?? ''} oninput={e => speed('x', e)}></label><label>Native travel Y, px/s<input class="bu-input" type="number" value={draft.speed.y ?? ''} oninput={e => speed('y', e)}></label></div>
  <canvas bind:this={canvas} aria-label="Mark native visible foot" onpointerdown={mark}></canvas><p>Frame {index + 1}: {draft.marks.filter(m => m.frame === index).map(m => `${m.track}/${m.stance} ${m.landmark} (${m.x}, ${m.y})`).join('; ') || 'unmarked'}.</p>
  {#if measured.partial}<p>Partial review. Missing or inconsistent data do not yield measurements for the affected stance.</p>{/if}
  <p>Partial describes annotation coverage only: both tracks across all frames. Hidden feet should remain unmarked. Even complete annotations do not identify physical contact windows or qualify the animation.</p>
  {#each measured.stances as row}<p>Track {row.track}, {row.stance}, {row.samples} marked boundaries: {row.reason ?? `sampled boundary span ${row.boundarySpanPx!.toFixed(2)} native px.`}</p>{/each}
  {#if measured.intervalHolds.length}<p>Separate held-frame travel: {measured.intervalHolds.map(h => `${h.frame + 1}: ${h.displacementPx.toFixed(2)} px`).join('; ')}. Boundary span does not measure continuous foot planting or certify quality.</p>{/if}
  <label>Native foot review notes<textarea class="bu-input" bind:value={draft.notes}></textarea></label><div class="bu-actions"><button class="bu-btn" disabled={!ready} onclick={() => action(save)}>Save native foot draft</button><button class="bu-btn" disabled={!ready} onclick={() => action(exported)}>Export native foot review</button><button class="bu-btn" onclick={() => action(reset)}>Reset native foot draft</button></div>
  {#if status}<p role="status">{status}</p>{/if}{#if error}<p role="alert" class="bu-error">{error}</p>{/if}
</section>
<style>.native-contacts{padding:16px}.native-contacts canvas{width:320px;max-width:100%;height:auto;image-rendering:pixelated;touch-action:none}.native-contacts input[type=number]{width:120px}.native-contacts textarea{min-height:70px}</style>
