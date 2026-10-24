import { MOTION, WORLDS, type WorldMode, type WorldTheme } from './config.ts'

export interface Point { x: number; y: number }
/** Fit the complete pivot-relative frame. Oversize gear and large imported
 * sprites must not cross controls. Prefer whole device pixels; a source larger
 * than the available stage is minified with nearest-neighbor sampling. */
export function actorScale(frame: {w:number;h:number;x:number;y:number}, area: {width:number;height:number}, dpr=1): number {
  const density = Math.max(1,dpr)
  const fit = Math.max(0,Math.min(6,
    area.width*.5/Math.max(1,frame.x),
    area.width*.5/Math.max(1,frame.w-frame.x),
    area.height*.77/Math.max(1,frame.y),
    area.height*.23/Math.max(1,frame.h-frame.y)))
  return fit*density<1 ? fit : Math.floor(fit*density)/density
}
export interface RenderOptions {
  /** CSS pixels; the backing store and shader coordinates use physical pixels. */
  width: number; height: number; dpr: number
  theme: WorldTheme; mode: WorldMode
  anchor: Point; camera: Point
}

/** The same perspective as the approved prototype, independent of actor/UI layout. */
export function projection(options: RenderOptions) {
  const { height: viewportHeight, mode, anchor, camera } = options
  const horizon = mode === 'side' ? anchor.y - viewportHeight * .13 : -viewportHeight * .40
  const focal = viewportHeight * 1.1, height = mode === 'side' ? 95 : 600
  const depth = focal * height / (anchor.y - horizon)
  return { horizon, focal, height, depth, anchor, camera }
}

export function project(point: Point, options: RenderOptions): Point {
  if (options.mode === 'preview') return { ...options.anchor }
  const p = projection(options), z = p.depth + point.y - p.camera.y
  return {
    x: p.anchor.x + (point.x - p.camera.x) * p.focal / z,
    y: p.horizon + p.focal * p.height / z,
  }
}

// Shader and sampled/mirrored material math copied from round-six world.js.
const vertex = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0,1);}`
const fragment = `#version 300 es
precision highp float;
uniform vec2 viewport,anchor,camera;uniform float horizon,focal,height,depth,tile;
uniform vec3 seam,fog,base;uniform sampler2D material;out vec4 color;
void main(){vec2 s=vec2(gl_FragCoord.x,viewport.y-gl_FragCoord.y);float dy=s.y-horizon;if(dy<=0.){color=vec4(0);return;}
float z=focal*height/dy;vec2 world=vec2(camera.x+(s.x-anchor.x)*z/focal,camera.y+z-depth);vec2 uv=world/tile;
vec3 c=mix(base,texture(material,uv*2.).rgb,.45);vec2 edge=abs(fract(uv-.5)-.5)/max(fwidth(uv),vec2(.0001));float line=1.-clamp(min(edge.x,edge.y),0.,1.);
c=mix(c,seam,line*.48);float mist=clamp((z-depth*.6)/(depth*4.),0.,.94);c=mix(c,fog,mist);
color=vec4(c,smoothstep(0.,24.,dy));}`

const images = new Map<string, Promise<HTMLImageElement>>()
/** Scene URL, rather than screen, is the cache identity. */
export function loadBackground(url: string): Promise<HTMLImageElement> {
  let pending = images.get(url)
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Background unavailable'))
      image.src = url
    })
    images.set(url, pending)
  }
  return pending
}

/** Transparent continuous floor; the parent owns the static sky/backdrop beneath it. */
export class Ground {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private shaders: WebGLShader[] = []
  private textures = new Map<string, WebGLTexture>()
  private loading = new Set<string>()
  private disposed = false
  private message: string | null = null

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener('webglcontextlost', this.contextLost)
    canvas.addEventListener('webglcontextrestored', this.contextRestored)
    this.initialize()
  }

  /** A static scene remains usable if continuous rendering is unavailable. */
  get warning(): string | null { return this.message }

  private contextLost = (event: Event) => {
    event.preventDefault()
    this.message = 'Continuous ground unavailable — showing the static scene.'
  }
  private contextRestored = () => {
    this.release()
    this.initialize()
  }

  private initialize() {
    try {
      const gl = this.canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false })
      if (!gl) throw new Error('WebGL 2 unavailable')
      this.gl = gl
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)
        if (!shader) throw new Error('Shader unavailable')
        this.shaders.push(shader)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed')
        return shader
      }
      const program = gl.createProgram()
      if (!program) throw new Error('Program unavailable')
      this.program = program
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program linking failed')
      gl.useProgram(program)
      const buffer = gl.createBuffer()
      if (!buffer) throw new Error('Buffer unavailable')
      this.buffer = buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const attribute = gl.getAttribLocation(program, 'p')
      gl.enableVertexAttribArray(attribute)
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)
      this.message = null
    } catch {
      this.release()
      this.message = 'Continuous ground unavailable — showing the static scene.'
    }
  }

  private texture(key: string, theme: WorldTheme, image: HTMLImageElement): WebGLTexture {
    const gl = this.gl!, sample = WORLDS[theme].sample, patch = document.createElement('canvas')
    patch.width = patch.height = 256
    const context = patch.getContext('2d')
    if (!context) throw new Error('Material canvas unavailable')
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      context.save()
      context.translate(x ? 256 : 0, y ? 256 : 0)
      context.scale(x ? -1 : 1, y ? -1 : 1)
      context.drawImage(image, image.width * sample[0], image.height * sample[1], image.width * sample[2], image.height * sample[3], 0, 0, 128, 128)
      context.restore()
    }
    const texture = gl.createTexture()
    if (!texture) throw new Error('Material texture unavailable')
    // Register before uploading so cleanup also covers a failed upload.
    this.textures.set(key, texture)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, patch)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.generateMipmap(gl.TEXTURE_2D)
    return texture
  }

  render(options: RenderOptions): void {
    if (this.disposed) return
    const gl = this.gl, program = this.program
    if (!gl || !program || gl.isContextLost()) return
    const dpr = options.dpr || 1, width = Math.max(1, Math.round(options.width * dpr)), height = Math.max(1, Math.round(options.height * dpr))
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    this.canvas.style.width = `${width / dpr}px`
    this.canvas.style.height = `${height / dpr}px`
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (options.mode === 'preview' || options.width <= 0 || options.height <= 0) return
    const theme = options.theme, world = WORLDS[theme]
    const url = world.backgrounds[options.mode], key = `${theme}:${url}`
    const texture = this.textures.get(key)
    if (!texture) {
      if (!this.loading.has(key)) {
        this.loading.add(key)
        void loadBackground(url).then((image) => {
          if (!this.disposed && this.gl === gl && this.program === program && !gl.isContextLost()) {
            this.texture(key, theme, image)
            this.message = null
          }
        }).catch(() => {
          if (this.disposed || this.program !== program) return
          const failed = this.textures.get(key)
          if (failed) gl.deleteTexture(failed)
          this.textures.delete(key)
          this.message = 'Ground material unavailable — showing the static scene.'
        })
      }
      return
    }
    this.message = null
    const p = projection(options), uniform = (name: string) => gl.getUniformLocation(program, name)
    gl.useProgram(program)
    gl.uniform2f(uniform('viewport'), options.width * dpr, options.height * dpr)
    gl.uniform2f(uniform('anchor'), p.anchor.x * dpr, p.anchor.y * dpr)
    gl.uniform2f(uniform('camera'), options.camera.x, options.camera.y)
    gl.uniform1f(uniform('horizon'), p.horizon * dpr)
    gl.uniform1f(uniform('focal'), p.focal * dpr)
    gl.uniform1f(uniform('height'), p.height)
    gl.uniform1f(uniform('depth'), p.depth)
    gl.uniform1f(uniform('tile'), MOTION.tileSize)
    gl.uniform3fv(uniform('base'), world.floor)
    gl.uniform3fv(uniform('seam'), world.seam)
    gl.uniform3fv(uniform('fog'), world.fog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(uniform('material'), 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private release() {
    if (this.gl) {
      for (const texture of this.textures.values()) this.gl.deleteTexture(texture)
      if (this.buffer) this.gl.deleteBuffer(this.buffer)
      if (this.program) this.gl.deleteProgram(this.program)
      for (const shader of this.shaders) this.gl.deleteShader(shader)
    }
    this.textures.clear()
    this.loading.clear()
    this.shaders = []
    this.buffer = null
    this.program = null
    this.gl = null
  }

  destroy(): void {
    this.disposed = true
    this.canvas.removeEventListener('webglcontextlost', this.contextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestored)
    this.release()
  }
}
