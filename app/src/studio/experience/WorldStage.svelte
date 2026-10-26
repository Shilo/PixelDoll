<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { ui, doc, store, view, toast } from '../state.svelte.ts'
  import { experience, characters, setMode } from './state.svelte.ts'
  import type { Ground, RenderOptions } from './ground.ts'
  import { MOTION, REFLECTION, WORLDS } from './config.ts'
  import { paintedFrame, actorScale } from './bounds.ts'
  import { buildPresentation, resolvePreview, resolveLive, renderPresentation, advancePlayback, type Presentation } from './presentation.ts'
  import { keyboardVector, pointerVector, nearestDirection, integrateMovement, MOVEMENT_KEYS, type Vector } from './movement.ts'
  let host: HTMLDivElement, canvas: HTMLCanvasElement, floor: HTMLCanvasElement, sky: HTMLCanvasElement
  let note = $state(''), rendererWarning = $state('')
  let stick = $state<{id:number;x:number;y:number;dx:number;dy:number}|null>(null)
  const secondaryTouches = new Map<number,{button:HTMLButtonElement;x:number;y:number}>()
  let consumedTouch:{x:number;y:number;until:number}|null=null
  const availability = $derived.by(() => { void doc.rev; return view.project ? buildPresentation(view.project,{loading:doc.loading,sourceProject:store.project??undefined,variants:doc.variants}) : null })
  const fitFrame = $derived.by(() => { void doc.rev; return view.project ? paintedFrame(view.project,doc.items) : null })
  const keys = new Set<string>()
  let position:Vector={x:0,y:0}, camera:Vector={x:0,y:0}, previous:Presentation|undefined
  let hasMoved=false
  let clock:ReturnType<typeof advancePlayback>|undefined
  const noticed = new Set<string>()
  function release(){if(stick&&host?.hasPointerCapture(stick.id))host.releasePointerCapture(stick.id);stick=null;secondaryTouches.clear()}
  let reset = () => { keys.clear(); release(); position={x:0,y:0};camera={x:0,y:0};previous=undefined;clock=undefined;noticed.clear();note='';hasMoved=false }
  $effect(() => { void doc.id; void experience.mode; untrack(reset) })
  // Live views briefly name their movement controls, as in the approved prototype; moving or 6.5s dismisses it.
  let hint = $state(false)
  $effect(() => { void doc.id; const live=experience.mode!=='preview'; hint=live; if(!live)return; const t=setTimeout(()=>hint=false,6500); return ()=>clearTimeout(t) })
  $effect(() => { void doc.rev; noticed.clear() })
  // The top-down and side-scroller renderer stays out of the startup bundle until a live view first opens.
  let scene:typeof import('./ground.ts')|undefined, sceneLoad:Promise<void>|undefined, sceneError=''
  $effect(() => { if(experience.mode!=='preview') sceneLoad??=import('./ground.ts').then(m=>{scene=m;sceneError=''},(error)=>{console.error(error);sceneLoad=undefined;sceneError='Test world unavailable — reload to try again.'}) })
  $effect(() => { if(ui.sheet) {keys.clear();release()} })
  function previewFacing() {
    if(experience.mode!=='preview'||!availability||ui.sheet||document.activeElement!==host)return
    const direction=nearestDirection(availability.directions,keyboardVector(keys),ui.dir)
    if(direction)ui.dir=direction
  }
  function keyup(e:KeyboardEvent) { keys.delete(e.key.toLowerCase());previewFacing() }
  function key(e:KeyboardEvent) {
    if(e.target!==host || ui.sheet || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
    const k=e.key.toLowerCase()
    if(MOVEMENT_KEYS.has(k)) {e.preventDefault();if(e.repeat&&!keys.has(k))return;keys.add(k)
      previewFacing()
    } else if(!e.repeat && ['1','2','3'].includes(k)) {e.preventDefault();setMode((['preview','topdown','side'] as const)[Number(k)-1])}
    else if(!e.repeat && (k==='escape'||k==='backspace')) {
      e.preventDefault()
      const popover=document.querySelector<HTMLElement>('[popover]:popover-open'),prompt=document.querySelector<HTMLDetailsElement>('.prompt-disclosure[open]')
      if(popover)popover.hidePopover();else if(prompt)prompt.open=false;else characters()
    }
    else if(!e.repeat && k===' ' && experience.mode==='preview') {e.preventDefault();ui.playing=!ui.playing}
    else if((k===','||k==='.')&&experience.mode==='preview'){e.preventDefault();ui.playing=false;ui.frame+=k==='.'?1:(view.anim?.frames.length??1)-1}
  }
  function down(e:PointerEvent) {if(e.button!==0||ui.sheet)return;host.focus({preventScroll:true});if(experience.mode==='preview'||stick)return;host.setPointerCapture(e.pointerId);stick={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0}}
  function drag(e:PointerEvent){if(stick?.id===e.pointerId)stick={...stick,dx:e.clientX-stick.x,dy:e.clientY-stick.y}}
  function up(e:PointerEvent){if(stick?.id===e.pointerId){stick=null;if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId)}}
  function stop(){keys.clear();release()}
  // Non-primary touch taps do not consistently produce native clicks. Keep the
  // first world finger's capture while a deliberate second tap operates a button.
  function secondaryDown(e:PointerEvent){
    const button=e.target instanceof Element?e.target.closest<HTMLButtonElement>('button'):null
    if(stick&&e.pointerType==='touch'&&!e.isPrimary&&button&&!button.disabled)secondaryTouches.set(e.pointerId,{button,x:e.clientX,y:e.clientY})
  }
  function secondaryUp(e:PointerEvent){
    const touch=secondaryTouches.get(e.pointerId);secondaryTouches.delete(e.pointerId)
    if(!touch||e.type==='pointercancel')return
    const under=document.elementFromPoint(e.clientX,e.clientY)?.closest('button')
    if(under!==touch.button||touch.button.disabled||Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>8)return
    e.preventDefault();touch.button.click()
    consumedTouch={x:e.clientX,y:e.clientY,until:performance.now()+500}
  }
  function compatibilityClick(e:MouseEvent){
    if(e.isTrusted&&consumedTouch&&performance.now()<consumedTouch.until&&Math.hypot(e.clientX-consumedTouch.x,e.clientY-consumedTouch.y)<8){consumedTouch=null;e.preventDefault();e.stopImmediatePropagation()}
  }
  onMount(() => {
    document.addEventListener('pointerdown',secondaryDown,true)
    document.addEventListener('pointerup',secondaryUp,true)
    document.addEventListener('pointercancel',secondaryUp,true)
    document.addEventListener('click',compatibilityClick,true)
    let ground:Ground|undefined
    const g=canvas.getContext('2d')!, source=document.createElement('canvas'), sg=source.getContext('2d')!
    const reflected=document.createElement('canvas'), rg=reflected.getContext('2d')!, skyContext=sky.getContext('2d')!
    let skyStamp='', disposed=false
    let raf=0, last=performance.now(), renderKey='', lastProject:unknown, imageCache:ReturnType<typeof renderPresentation>|null=null
    const animate=(now:number)=>{
      const dt=Math.min(50,now-last);last=now
      const a=availability, rect=host.getBoundingClientRect(), dpr=devicePixelRatio||1
      const width=innerWidth,height=innerHeight
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);renderKey=''}
      g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,width,height);g.imageSmoothingEnabled=false
      const mobile=width<=760, short=height<=540&&width>=height
      const desiredY=height*(mobile?(short?.65:.52):.755)
      const anchor={x:rect.x+rect.width/2,y:Math.max(rect.top,Math.min(rect.bottom-8,desiredY))}
      const anchorRatio=rect.height>0?(anchor.y-rect.y)/rect.height:0
      const preferred=Math.max(1,Math.floor(Math.min(rect.width/(mobile?110:130),height*(mobile?.24:.40)/50)))
      let velocity=keyboardVector(keys,experience.mode==='side')
      if(stick)velocity=pointerVector(stick.dx,stick.dy,MOTION.joystickRadius,MOTION.deadZone/MOTION.joystickRadius,experience.mode==='side')
      if(ui.sheet||document.hidden)velocity={x:0,y:0}
      const live=experience.mode!=='preview'
      if(live)({position,camera}=integrateMovement(position,camera,velocity,dt/1000,MOTION.speed,MOTION.cameraResponse))
      const options:RenderOptions={width,height,dpr,theme:ui.theme,mode:experience.mode,anchor,camera}
      const world=WORLDS[ui.theme], skyUrl=world.backgrounds[experience.mode], s=live?scene:undefined
      const horizon=s?.projection(options).horizon
      const nextSky=[skyUrl,width,height,dpr,horizon??'preview'].join('|')
      if(nextSky!==skyStamp){
        skyStamp=nextSky;sky.width=Math.round(width*dpr);sky.height=Math.round(height*dpr)
        if(s&&horizon!==undefined)void s.loadBackground(skyUrl).then(image=>{
          if(disposed||skyStamp!==nextSky)return
          skyContext.setTransform(dpr,0,0,dpr,0,0)
          skyContext.drawImage(image,0,0,image.width,image.height*world.horizon,0,0,width,Math.max(horizon+24,1))
        }).catch(()=>{})
      }
      if(scene){ground??=new scene.Ground(floor);ground.render(options)}
      rendererWarning=ground?.warning??(live?sceneError:'')
      if(a){
        const p=live?resolveLive(a,{velocity,previous,defaultDirection:experience.mode==='side'?nearestDirection(a.directions,{x:1,y:0},ui.dir)??undefined:ui.dir}):resolvePreview(a,{clip:ui.anim,direction:ui.dir})
        experience.presentation=p.kind
        if(live)clock=advancePlayback(p,clock,dt)
        const cell=live?clock?.cell:p.kind==='animation'?view.cell:p.cell
        const nextKey=JSON.stringify([p.kind,p.clip,p.direction,cell,doc.items,doc.rev])
        if(lastProject!==a||nextKey!==renderKey){imageCache=renderPresentation(a,doc.items,p,cell);renderKey=nextKey;lastProject=a
          if(imageCache.image){source.width=imageCache.image.w;source.height=imageCache.image.h;sg.putImageData(new ImageData(new Uint8ClampedArray(imageCache.image.data),source.width,source.height),0,0)
            reflected.width=source.width;reflected.height=source.height;rg.drawImage(source,0,0)
            rg.globalCompositeOperation='destination-in';const fade=rg.createLinearGradient(0,0,0,imageCache.frame.y);fade.addColorStop(0,'transparent');fade.addColorStop(.3,'transparent');fade.addColorStop(1,'black');rg.fillStyle=fade;rg.fillRect(0,0,source.width,source.height);rg.globalCompositeOperation='source-over'
          }
        }
        const result=imageCache, img=result?.image
        note=[p.issue,result?.hiddenItems.length?`${result.hiddenItems.length} equipped item${result.hiddenItems.length===1?'':'s'} hidden for this view`:''].filter(Boolean).join(' · ')
        if((velocity.x||velocity.y)&&!hasMoved){hasMoved=true;hint=false}
        if(live&&hasMoved){const issues=[[p.issueKey,p.issue],[result?.issueKey,result?.issue]];for(const [id,text] of issues)if(id&&text&&!noticed.has(id)){noticed.add(id);toast(text)}}
        if(img&&result){
          const frame=result.frame, point=s?s.project(position,options):anchor
          const scale=actorScale(fitFrame??frame,rect,dpr,preferred,anchorRatio)
          const snap=(n:number)=>Math.round(n*dpr)/dpr
          const x=snap(point.x-frame.x*scale),y=snap(point.y-frame.y*scale)
          if(REFLECTION.enabled&&REFLECTION[experience.mode]){g.save();g.globalAlpha=REFLECTION.opacity;g.translate(0,snap(point.y));g.scale(1,-REFLECTION.compression);g.drawImage(reflected,x,-frame.y*scale,img.w*scale,img.h*scale);g.restore()}
          g.drawImage(source,x,y,img.w*scale,img.h*scale)
          host.dataset.position=`${position.x.toFixed(2)},${position.y.toFixed(2)}`;host.dataset.camera=`${camera.x.toFixed(2)},${camera.y.toFixed(2)}`;host.dataset.presentation=p.kind;host.dataset.facing=p.direction??''
        }
        previous=p
      }
      raf=requestAnimationFrame(animate)
    }
    raf=requestAnimationFrame(animate)
    return()=>{
      disposed=true;cancelAnimationFrame(raf);ground?.destroy()
      document.removeEventListener('pointerdown',secondaryDown,true)
      document.removeEventListener('pointerup',secondaryUp,true)
      document.removeEventListener('pointercancel',secondaryUp,true)
      document.removeEventListener('click',compatibilityClick,true)
    }
  })
</script>
<svelte:window onkeyup={keyup} onblur={stop} onresize={stop}/>
<svelte:document onvisibilitychange={stop}/>
<!-- A focused game surface owns directional input; controls remain native outside it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="world-stage bu-focus" bind:this={host} role="application" tabindex="0" aria-label={experience.mode==='preview'?'Character preview. WASD or arrows change facing. Keys 1, 2, 3 switch views.':experience.mode==='side'?'Side-scroller test world. A/D, left/right arrows or horizontal drag to move. Keys 1, 2, 3 switch views.':'Character test world. WASD, arrows or drag to move. Keys 1, 2, 3 switch views.'} onkeydown={key} onfocusout={()=>keys.clear()} onpointerdown={down} onpointermove={drag} onpointerup={up} onpointercancel={up} onlostpointercapture={up} class:live={experience.mode!=='preview'}>
  <div class="world-input" aria-hidden="true"></div>
  <canvas class="world-sky" bind:this={sky} aria-hidden="true"></canvas>
  <canvas class="world-ground" bind:this={floor} aria-hidden="true"></canvas>
  <canvas class="world-actors" bind:this={canvas} aria-hidden="true"></canvas>
  {#if doc.loading}<span class="world-loading">Loading character…</span>{/if}
</div>
<!-- One bottom-anchored stack: the movement hint always sits above the fallback note, whatever the note wraps to. -->
{#if hint||note||rendererWarning}<div class="world-notes">{#if hint}<p class="world-hint">{matchMedia('(pointer:coarse)').matches?'Drag in the world to move':experience.mode==='side'?'Focus world · A/D or ←/→ to move':'Focus world · WASD or arrow keys to move'}</p>{/if}{#if note||rendererWarning}<p class="world-coverage">{[rendererWarning,note].filter(Boolean).join(' · ')}</p>{/if}</div>{/if}
{#if stick}<div class="world-stick" style:left="{stick.x}px" style:top="{stick.y}px" aria-hidden="true"><span style:transform="translate({Math.max(-40,Math.min(40,stick.dx))}px,{Math.max(-40,Math.min(40,stick.dy))}px)"></span></div>{/if}
