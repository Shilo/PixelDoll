import { THEMES, REFLECTION, MOTION } from './config.js';
import { stageLayout } from './stage-layout.mjs';
const vertex = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
const fragment = `#version 300 es
precision highp float;
uniform vec2 viewport,anchor,camera;uniform float horizon,focal,height,depth,tile;
uniform vec3 seam,fog,base;uniform sampler2D material;out vec4 color;
void main(){vec2 s=vec2(gl_FragCoord.x,viewport.y-gl_FragCoord.y);float dy=s.y-horizon;if(dy<=0.){color=vec4(0);return;}
float z=focal*height/dy;vec2 world=vec2(camera.x+(s.x-anchor.x)*z/focal,camera.y+z-depth);vec2 uv=world/tile;
vec3 c=mix(base,texture(material,uv*2.).rgb,.45);vec2 edge=abs(fract(uv-.5)-.5)/max(fwidth(uv),vec2(.0001));float line=1.-clamp(min(edge.x,edge.y),0.,1.);
c=mix(c,seam,line*.48);float mist=clamp((z-depth*.6)/(depth*4.),0.,.94);c=mix(c,fog,mist);
color=vec4(c,smoothstep(0.,24.,dy));}`;
export class World {
    constructor() {
        this.sky = document.querySelector('#sky');
        this.ground = document.querySelector('#ground');
        this.actors = document.querySelector('#actors');
        this.ctx = this.actors.getContext('2d');
        this.images = new Map();
        this.loadCounts = {};
        this.stamp = '';
        this.hitAreas = [];
        const gl = this.ground.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false });
        if (!gl)
            throw Error('This visual prototype needs WebGL 2 for the continuous ground. Try a browser with hardware acceleration enabled.');
        this.gl = gl;
        const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw Error(gl.getShaderInfoLog(s)); return s; };
        this.program = gl.createProgram();
        gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw Error(gl.getProgramInfoLog(this.program));
        gl.useProgram(this.program);
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(this.program, 'p');
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        this.textures = new Map();
        this.reflections = new WeakMap();
    }
    async load(url) { if (!this.images.has(url)) {
        this.loadCounts[url] = (this.loadCounts[url] ?? 0) + 1;
        this.images.set(url, new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(Error('Background unavailable')); im.src = url; }));
    } return this.images.get(url); }
    async prepare() { for (const t of Object.values(THEMES))
        await Promise.all(Object.values(t.backgrounds).map(url => this.load(url))); }
    layout(state) {
        const w = innerWidth, h = innerHeight, mobile = w <= 760, short = h <= 540 && w >= h;
        const { width: stageWidth, center: x, top, bottom } = stageLayout();
        const studio = state.screen === 'studio';
        let y = mobile ? (short ? h * .65 : h * (studio ? .52 : .575)) : h * (studio ? .755 : .77);
        let scale = Math.max(2, Math.floor(Math.min(mobile ? stageWidth / (studio ? 110 : 100) : stageWidth / 130, h * (mobile ? (studio ? .24 : .26) : (studio ? .40 : .43)) / 50)));
        const dpr = devicePixelRatio || 1;
        // Keep the approved roomy composition. Compact stages must fit the whole
        // frame, including the raised neighbouring characters on selection.
        const compact = mobile || short, raised = studio ? 0 : 30;
        if (compact) scale = Math.min(scale, Math.max(1 / dpr, (bottom - top - raised) / 64));
        scale = Math.max(1, Math.floor(scale * dpr)) / dpr;
        if (compact) y = Math.min(bottom, Math.max(top + 64 * scale + raised, y));
        return { w, h, mobile, x, y, scale, stageWidth, dpr };
    }
    projection(state, camera) { const l = this.layout(state), side = state.view === 'side'; const horizon = side ? l.y - l.h * .13 : -l.h * .40, focal = l.h * 1.1, height = side ? 95 : 600, depth = focal * height / (l.y - horizon); return { ...l, horizon, focal, height, depth, camera }; }
    point(x, y, p) { const z = p.depth + y - p.camera.y; return { x: p.x + (x - p.camera.x) * p.focal / z, y: p.horizon + p.focal * p.height / z }; }
    texture(theme, image) {
        const key = theme + image.src;
        if (this.textures.has(key))
            return this.textures.get(key);
        const gl = this.gl, t = THEMES[theme], s = t.sample, c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        // Mirrored material patch repeats continuously; the world owns the tile seams, not the image.
        for (let y = 0; y < 2; y++)
            for (let x = 0; x < 2; x++) {
                g.save();
                g.translate(x ? 256 : 0, y ? 256 : 0);
                g.scale(x ? -1 : 1, y ? -1 : 1);
                g.drawImage(image, image.width * s[0], image.height * s[1], image.width * s[2], image.height * s[3], 0, 0, 128, 128);
                g.restore();
            }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.textures.set(key, tex);
        return tex;
    }
    async backdrop(state) {
        const l = this.layout(state), view = state.screen === 'studio' ? state.view : state.screen, t = THEMES[state.theme], url = t.backgrounds[view] ?? t.backgrounds.preview;
        const stamp = [url, view, l.w, l.h, l.dpr].join('|');
        if (stamp === this.stamp)
            return;
        this.stamp = stamp;
        const image = await this.load(url);
        if (stamp !== this.stamp)
            return;
        const dpr = l.dpr;
        for (const c of [this.sky, this.ground, this.actors]) {
            c.width = Math.round(l.w * dpr);
            c.height = Math.round(l.h * dpr);
            // A fractional CSS viewport can round the backing store up. Match
            // its CSS size so the browser does not resample our device pixels.
            c.style.width = `${c.width / dpr}px`;
            c.style.height = `${c.height / dpr}px`;
        }
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.dpr = dpr;
        const g = this.sky.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const live = state.screen === 'studio' && state.view !== 'preview';
        this.ground.style.display = live ? 'block' : 'none';
        if (live) {
            const p = this.projection(state, { x: 0, y: 0 });
            g.drawImage(image, 0, 0, image.width, image.height * t.horizon, 0, 0, l.w, Math.max(p.horizon + 24, 1));
            this.liveSkyImage = image;
            this.skyHorizon = p.horizon;
            this.currentTexture = this.texture(state.theme, image);
        }
        else {
            this.liveSkyImage = null;
            const dh = l.mobile ? l.h * .70 : l.h, dw = l.mobile ? image.width * dh / image.height : l.w;
            g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bu-surface').trim();
            g.fillRect(0, 0, l.w, l.h);
            g.drawImage(image, (l.w - dw) / 2, 0, dw, dh);
        }
    }
    floor(state, camera) {
        const p = this.projection(state, camera), gl = this.gl, t = THEMES[state.theme], d = this.dpr || 1;
        // Sheet expansion and hint dismissal can move the measured stage without
        // changing the viewport. Repaint cached sky only when its horizon moves.
        if (this.liveSkyImage && this.skyHorizon !== p.horizon) {
            const image = this.liveSkyImage, g = this.sky.getContext('2d');
            g.clearRect(0, 0, p.w, p.h);
            g.drawImage(image, 0, 0, image.width, image.height * t.horizon, 0, 0, p.w, Math.max(p.horizon + 24, 1));
            this.skyHorizon = p.horizon;
        }
        gl.viewport(0, 0, this.ground.width, this.ground.height);
        gl.useProgram(this.program);
        const set = (name, fn, ...args) => gl[fn](gl.getUniformLocation(this.program, name), ...args);
        set('viewport', 'uniform2f', p.w * d, p.h * d);
        set('anchor', 'uniform2f', p.x * d, p.y * d);
        set('camera', 'uniform2f', camera.x, camera.y);
        set('horizon', 'uniform1f', p.horizon * d);
        set('focal', 'uniform1f', p.focal * d);
        set('height', 'uniform1f', p.height);
        set('depth', 'uniform1f', p.depth);
        set('tile', 'uniform1f', MOTION.tileSize);
        set('base', 'uniform3fv', t.floor);
        set('seam', 'uniform3fv', t.seam);
        set('fog', 'uniform3fv', t.fog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.currentTexture ?? null);
        set('material', 'uniform1i', 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return p;
    }
    drawSprite(canvas, cx, feet, scale, reflection) {
        const dpr = this.dpr || 1, snap = value => Math.round(value * dpr) / dpr;
        const g = this.ctx, x = snap(cx - 32 * scale), y = snap(feet - 64 * scale);
        g.imageSmoothingEnabled = false;
        if (reflection && REFLECTION.enabled) {
            let r = this.reflections.get(canvas);
            if (!r) {
                r = document.createElement('canvas');
                r.width = canvas.width;
                r.height = canvas.height;
                const z = r.getContext('2d');
                z.translate(0, r.height);
                z.scale(1, -1);
                z.drawImage(canvas, 0, 0);
                z.setTransform(1, 0, 0, 1, 0, 0);
                z.globalCompositeOperation = 'destination-in';
                const fade = z.createLinearGradient(0, 0, 0, r.height);
                fade.addColorStop(0, 'rgba(255,255,255,1)');
                fade.addColorStop(.7, 'rgba(255,255,255,0)');
                z.fillStyle = fade;
                z.fillRect(0, 0, r.width, r.height);
                this.reflections.set(canvas, r);
            }
            g.globalAlpha = REFLECTION.opacity;
            g.drawImage(r, x, snap(feet), 64 * scale, 64 * scale * REFLECTION.compression);
            g.globalAlpha = 1;
        }
        g.drawImage(canvas, x, y, 64 * scale, 64 * scale);
        return { x, y, w: 64 * scale, h: 64 * scale };
    }
    draw(state, demo, characters, resolved, camera, position) {
        const l = this.layout(state), g = this.ctx;
        g.clearRect(0, 0, l.w, l.h);
        this.hitAreas = [];
        if (state.screen === 'creation')
            return;
        if (state.screen === 'selection') {
            const n = characters.length, selected = state.character;
            const neighborScale = Math.min(l.scale, Math.max(1, Math.round(Math.max(2, Math.round(l.scale * .56)) * l.dpr)) / l.dpr);
            for (const [offset, smaller] of [[-1, true], [1, true], [0, false]]) {
                if (n < 2 && smaller)
                    continue;
                const ix = (selected + offset + n) % n;
                if (n === 2 && offset === 1)
                    continue;
                const c = characters[ix], sc = smaller ? neighborScale : l.scale, xx = l.x + offset * (l.stageWidth * (l.mobile ? .32 : .25)), yy = l.y - (smaller ? 30 : 0);
                const spr = demo.sprite(c.items, 'walk', 'south', 0);
                const r = this.drawSprite(spr.canvas, xx, yy, sc, REFLECTION.selection);
                this.hitAreas.push({ ...r, index: ix });
            }
            return;
        }
        const live = state.view !== 'preview', p = live ? this.floor(state, camera) : null, pt = p ? this.point(position.x, position.y, p) : { x: l.x, y: l.y };
        if (!resolved.clip || !resolved.dir)
            return;
        const { canvas } = demo.sprite(characters[state.character].items, resolved.clip, resolved.dir, resolved.cell ?? 0);
        this.actorBounds = this.drawSprite(canvas, pt.x, pt.y, l.scale, REFLECTION[state.view]);
    }
}
