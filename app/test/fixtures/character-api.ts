// Offline transport used by Playwright and the dev-only Codex-browser fixture. No credentials or network calls.
import { base64ToBytes, bytesToBase64, makeImg, type Img } from '../../src/lib/image/png.ts'
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { DIRECTIONS, type DirectionName, type Keypoint } from '../../src/lib/rig/rig.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { opaqueBox } from '../../src/lib/rig/normalize.ts'
type Image = { base64: string }
interface Input { description?: string; image_size?: { width: number }; reference_image?: Image; direction_images?: Partial<Record<DirectionName, Image>>; first_frame?: Image; keypoints?: Keypoint[][]; directions?: DirectionName[]; image?: Image }
export class CharacterApi {
  calls: { method: string; path: string; body: Input | null }[] = []
  private jobs = new Map<string, object>()
  private images = new Map<string, Uint8Array>()
  private standing = new Map<DirectionName, { image: Img; points: Keypoint[] }>()
  private markers = new Map<number, { size: number; points: Keypoint[] }>()
  private serial = 0
  private json(body: unknown, status = 200) { return Response.json(body, { status }) }
  private points(im: Img): Keypoint[] {
    const b = opaqueBox(im)!, cx = (b.x0 + b.x1) / 2, h = b.y1 - b.y0
    return LABELS.map(label => ({ label, x: (cx + (label.startsWith('RIGHT') ? -h / 10 : label.startsWith('LEFT') ? h / 10 : 0)) / im.w,
      y: (b.y0 + h * (/NOSE|EYE|EAR/.test(label) ? .12 : /NECK|SHOULDER/.test(label) ? .27 : /ELBOW/.test(label) ? .4 : /ARM/.test(label) ? .55 : /HIP/.test(label) ? .58 : /KNEE/.test(label) ? .78 : .96)) / im.h }))
  }
  private async output(im: Img, points?: Keypoint[]): Promise<string> {
    if (points) {
      const b = opaqueBox(im)!, id = ++this.serial, x = Math.floor((b.x0 + b.x1) / 2), y = Math.floor((b.y0 + b.y1) / 2)
      im = { ...im, data: new Uint8ClampedArray(im.data) }; im.data.set([17, id >> 8, id & 255, 255], (y * im.w + x) * 4)
      this.markers.set(id, { size: im.w, points })
    }
    return bytesToBase64(await encodePngBytes(im))
  }
  private async job(last: object) {
    const id = `fixture-job-${++this.serial}`
    this.jobs.set(id, { id, status: 'completed', created_at: '', usage: { type: 'generations', generations: 3 }, last_response: last })
    return this.json({ background_job_id: id })
  }
  async handle(method: string, url: string, body: Input | null = null): Promise<Response> {
    const path = new URL(url).pathname
    this.calls.push({ method, path, body })
    if (this.images.has(path)) return new Response(this.images.get(path)! as Uint8Array<ArrayBuffer>, { headers: { 'content-type': 'image/png' } })
    if (path === '/v2/balance') return this.json({ credits: { type: 'usd', usd: 0 }, subscription: { type: 'generations', status: 'active', plan: 'Tier 3: fixture', generations: 10000, total: 10000 } })
    if (path.startsWith('/v2/background-jobs/')) return this.json(this.jobs.get(path.split('/').pop()!) ?? {}, this.jobs.has(path.split('/').pop()!) ? 200 : 404)
    if (path === '/v2/enhance-character-v3-prompt') {
      if (body?.description?.includes('[slow]')) await new Promise(r => setTimeout(r, 2000))
      if (body?.description?.includes('[fail]')) return this.json({ detail: 'Offline enhancement failure' }, 503)
      if (body?.description?.includes('[invalid]')) return this.json({ enhanced_prompt: '' })
      return this.json({ enhanced_prompt: `${body?.description}\nSubtle freckles and expressive eyes.`, usage: { type: 'generations', generations: .05 } })
    }
    if (path === '/v2/create-character-v3' && body?.reference_image) {
      for (const dir of DIRECTIONS) {
        const ref = dir === 'south' ? body.reference_image : body.direction_images?.[dir]
        if (!ref) return this.json({ detail: `Missing original ${dir}` }, 422)
        const image = await decodePngBytes(base64ToBytes(ref.base64))
        this.standing.set(dir, { image, points: this.points(image) })
      }
      return this.json({ character_id: '00000000-0000-4000-8000-000000000001', usage: { type: 'generations', generations: .25 } })
    }
    if (path === '/v2/create-character-v3') {
      const size = body?.image_size?.width ?? 64, urls: Record<string, string> = {}
      for (const [index, dir] of DIRECTIONS.entries()) {
        const im = makeImg(size, size)
        for (let y = Math.floor(size * .14); y < Math.floor(size * .87); y++) for (let x = Math.floor(size * .35); x < Math.floor(size * .58); x++) im.data.set([140 + index * 9, 100, 80, 255], (y * size + x) * 4)
        const path = `/creator-fixture/${++this.serial}/${dir}.png`
        this.images.set(path, await encodePngBytes(im)); urls[dir] = `https://cdn.pixellab.ai${path}`
      }
      return this.job({ storage_urls: urls })
    }
    if (path.startsWith('/v2/characters/') && method === 'GET') return this.json({ skeletons: { '2d_references': Object.fromEntries([...this.standing].map(([dir, { points }]) => [dir, { keypoints: Object.fromEntries(points.map(p => [p.label, { x: p.x, y: p.y }])) }])) } })
    if (path === '/v2/characters/animations') {
      const dir = body!.directions![0], source = this.standing.get(dir)!, images = []
      for (let i = 0; i < 8; i++) images.push({ type: 'base64', base64: await this.output(source.image, source.points) })
      return this.job({ direction: dir, images })
    }
    if (path === '/v2/animate-with-skeleton-v3') {
      const im = await decodePngBytes(base64ToBytes(body!.first_frame!.base64)), images = []
      for (const points of body!.keypoints!) images.push({ type: 'base64', base64: await this.output(im, points) })
      return this.job({ images })
    }
    if (path === '/v2/estimate-skeleton') {
      const im = await decodePngBytes(base64ToBytes(body!.image!.base64))
      let points = this.points(im)
      for (let p = 0; p < im.data.length; p += 4) if (im.data[p] === 17 && im.data[p + 3] === 255) {
        const record = this.markers.get(im.data[p + 1] * 256 + im.data[p + 2])
        if (record) { const offset = Math.floor((im.w - record.size) / 2); points = record.points.map(k => ({ ...k, x: (k.x * record.size + offset) / im.w, y: (k.y * record.size + offset) / im.h })); break }
      }
      return this.json({ keypoints: points, usage: { type: 'generations', generations: .1 } })
    }
    return this.json({ detail: `Unexpected offline fixture request: ${method} ${path}` }, 422)
  }
}
