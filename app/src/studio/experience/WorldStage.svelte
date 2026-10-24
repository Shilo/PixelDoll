<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { ui, doc, store, view, toast } from '../state.svelte.ts'
  import { experience, characters, setMode } from './state.svelte.ts'
  import { Ground, project, actorScale, type RenderOptions } from './ground.ts'
  import { MOTION, REFLECTION } from './config.ts'
  import { buildPresentation, resolvePreview, resolveLive, renderPresentation, advancePlayback, type Presentation } from './presentation.ts'
  import { keyboardVector, pointerVector, nearestDirection, integrateMovement, MOVEMENT_KEYS, type Vector } from './movement.ts'
  let host: HTMLDivElement, canvas: HTMLCanvasElement, floor: HTMLCanvasElement
  let note = $state(''), rendererWarning = $state('')
  let stick = $state<{id:number;x:number;y:number;dx:number;dy:number}|null>(null)
  const availability = $derived.by(() => { void doc.rev; return view.project ? buildPresentation(view.project,{loading:doc.loading,sourceProject:store.project??undefined,variants:doc.variants}) : null })
  const keys = new Set<string>()
  let position:Vector={x:0,y:0}, camera:Vector={x:0,y:0}, previous:Presentation|undefined
  let hasMoved=false
  let clock:ReturnType<typeof advancePlayback>|undefined
  const noticed = new Set<string>()
  function release(){if(stick&&host?.hasPointerCapture(stick.id))host.releasePointerCapture(stick.id);stick=null}
  let reset = () => { keys.clear(); release(); position={x:0,y:0};camera={x:0,y:0};previous=undefined;clock=undefined;noticed.clear();note='';hasMoved=false }
  $effect(() => { void doc.id; void experience.mode; untrack(reset) })
  $effect(() => { void doc.rev; noticed.clear() })
  $effect(() => { if(ui.sheet) {keys.clear();release()} })
  function key(e:KeyboardEvent) {
    if(e.target!==host || ui.sheet || e.ctrlKey || e.metaKey || e.altKey) return
    const k=e.key.toLowerCase()
    if(MOVEMENT_KEYS.has(k)) {e.preventDefault();keys.add(k)
      if(experience.mode==='preview' && availability) {const dir=nearestDirection(availability.directions,keyboardVector(keys),ui.dir);if(dir)ui.dir=dir}
    } else if(!e.repeat && ['1','2','3'].includes(k)) {e.preventDefault();setMode((['preview','topdown','side'] as const)[Number(k)-1])}
    else if(!e.repeat && (k==='escape'||k==='backspace')) {e.preventDefault();characters()}
    else if(!e.repeat && k===' ' && experience.mode==='preview') {e.preventDefault();ui.playing=!ui.playing}
    else if((k===','||k==='.')&&experience.mode==='preview'){e.preventDefault();ui.playing=false;ui.frame+=k==='.'?1:(view.anim?.frames.length??1)-1}
  }
  function down(e:PointerEvent) {if(e.button!==0||ui.sheet)return;host.focus({preventScroll:true});if(experience.mode==='preview'||stick)return;host.setPointerCapture(e.pointerId);stick={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0}}
  function drag(e:PointerEvent){if(stick?.id===e.pointerId)stick={...stick,dx:e.clientX-stick.x,dy:e.clientY-stick.y}}
  function up(e:PointerEvent){if(stick?.id===e.pointerId){stick=null;if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId)}}
  function stop(){keys.clear();release()}
  onMount(() => {
    const ground=new Ground(floor), g=canvas.getContext('2d')!, source=document.createElement('canvas'), sg=source.getContext('2d')!
    let raf=0, last=performance.now(), renderKey='', lastProject:unknown, imageCache:ReturnType<typeof renderPresentation>|null=null
    const animate=(now:number)=>{
      const dt=Math.min(50,now-last);last=now
      const a=availability, rect=host.getBoundingClientRect(), dpr=devicePixelRatio||1
      const width=innerWidth,height=innerHeight
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);renderKey=''}
      g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,width,height);g.imageSmoothingEnabled=false
      const anchor={x:rect.x+rect.width/2,y:rect.y+rect.height*.77}
      let velocity=keyboardVector(keys,experience.mode==='side')
      if(stick)velocity=pointerVector(stick.dx,stick.dy,MOTION.joystickRadius,MOTION.deadZone/MOTION.joystickRadius,experience.mode==='side')
      if(ui.sheet||document.hidden)velocity={x:0,y:0}
      const live=experience.mode!=='preview'
      if(live)({position,camera}=integrateMovement(position,camera,velocity,dt/1000,MOTION.speed,MOTION.cameraResponse))
      const options:RenderOptions={width,height,dpr,theme:ui.theme,mode:experience.mode,anchor,camera}
      ground.render(options);rendererWarning=ground.warning??''
      if(a){
        const p=live?resolveLive(a,{velocity,previous,defaultDirection:ui.dir}):resolvePreview(a,{clip:ui.anim,direction:ui.dir})
        experience.presentation=p.kind
        if(live)clock=advancePlayback(p,clock,dt)
        const cell=live?clock?.cell:p.kind==='animation'?view.cell:p.cell
        const nextKey=JSON.stringify([p.kind,p.clip,p.direction,cell,doc.items,doc.rev])
        if(lastProject!==a||nextKey!==renderKey){imageCache=renderPresentation(a,doc.items,p,cell);renderKey=nextKey;lastProject=a
          if(imageCache.image){source.width=imageCache.image.w;source.height=imageCache.image.h;sg.putImageData(new ImageData(new Uint8ClampedArray(imageCache.image.data),source.width,source.height),0,0)}
        }
        const result=imageCache, img=result?.image
        note=[p.issue,result?.hiddenItems.length?`${result.hiddenItems.length} equipped item${result.hiddenItems.length===1?'':'s'} hidden for this view`:''].filter(Boolean).join(' · ')
        if(velocity.x||velocity.y)hasMoved=true
        if(live&&hasMoved){const issues=[[p.issueKey,p.issue],[result?.issueKey,result?.issue]];for(const [id,text] of issues)if(id&&text&&!noticed.has(id)){noticed.add(id);toast(text)}}
        if(img&&result){
          const frame=result.frame, point=live?project(position,options):anchor
          const scale=actorScale(frame,rect,dpr)
          const snap=(n:number)=>Math.round(n*dpr)/dpr
          const x=snap(point.x-frame.x*scale),y=snap(point.y-frame.y*scale)
          if(REFLECTION.enabled&&REFLECTION[experience.mode]){g.save();g.globalAlpha=REFLECTION.opacity;g.translate(0,snap(point.y));g.scale(1,-REFLECTION.compression);g.drawImage(source,x,-frame.y*scale,img.w*scale,img.h*scale);g.restore()}
          g.drawImage(source,x,y,img.w*scale,img.h*scale)
          host.dataset.position=`${position.x.toFixed(2)},${position.y.toFixed(2)}`;host.dataset.camera=`${camera.x.toFixed(2)},${camera.y.toFixed(2)}`;host.dataset.presentation=p.kind;host.dataset.facing=p.direction??''
        }
        previous=p
      }
      raf=requestAnimationFrame(animate)
    }
    raf=requestAnimationFrame(animate)
    return()=>{cancelAnimationFrame(raf);ground.destroy()}
  })
</script>
<svelte:window onkeyup={(e)=>keys.delete(e.key.toLowerCase())} onblur={stop} onresize={reset}/>
<svelte:document onvisibilitychange={stop}/>
<!-- A focused game surface owns directional input; controls remain native outside it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="world-stage bu-focus" bind:this={host} role="application" tabindex="0" aria-label={experience.mode==='preview'?'Character preview. WASD or arrows change facing.':'Character test world. WASD, arrows or drag to move.'} onkeydown={key} onfocusout={()=>keys.clear()} onpointerdown={down} onpointermove={drag} onpointerup={up} onpointercancel={up} onlostpointercapture={up} class:live={experience.mode!=='preview'}>
  <div class="world-input" aria-hidden="true"></div>
  <canvas class="world-ground" bind:this={floor} aria-hidden="true"></canvas>
  <canvas class="world-actors" bind:this={canvas} aria-hidden="true"></canvas>
  {#if doc.loading}<span class="world-loading">Loading character…</span>{/if}
</div>
{#if note||rendererWarning}<details class="world-coverage"><summary>{rendererWarning||'View details'}</summary><p>{note||rendererWarning}</p></details>{/if}
{#if stick}<div class="world-stick" style:left="{stick.x}px" style:top="{stick.y}px" aria-hidden="true"><span style:transform="translate({Math.max(-40,Math.min(40,stick.dx))}px,{Math.max(-40,Math.min(40,stick.dy))}px)"></span></div>{/if}
