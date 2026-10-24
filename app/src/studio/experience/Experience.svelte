<script lang="ts">
  import { onMount, tick } from 'svelte'
  import Toolbar from '../Toolbar.svelte'
  import PhonePanel from '../PhonePanel.svelte'
  import WorldStage from './WorldStage.svelte'
  import CharacterThumb from './CharacterThumb.svelte'
  import { ui,doc,store,openProject,refreshProjects } from '../state.svelte.ts'
  import { experience,customize,characters,setMode,type WorldMode } from './state.svelte.ts'
  import { WORLDS,REFLECTION } from './config.ts'
  import { ChevronDown,ChevronLeft,ChevronRight,Play,Pause,Grid2x2,Copy } from '../icons.ts'
  import { directionInfo } from './movement.ts'
  let search=$state('')
  let copyMessage=$state('')
  async function copyPrompt(){try{await navigator.clipboard.writeText(prompt);copyMessage='Copied'}catch{copyMessage='Select the prompt to copy it'}}
  let selection=$state<HTMLDivElement>()
  let viewportWidth=$state(1280),viewportHeight=$state(720)
  const m=$derived(store.project?.manifest)
  const name=$derived(store.projects.find(p=>p.id===doc.id)?.name.replace(/ \(demo\)$/,'')??m?.name??'Character')
  const prompt=$derived(m?.items.find(it=>it.id===m.rig.baseItem)?.prompt??'')
  const list=$derived(store.projects.filter(p=>!p.dev&&p.name.toLowerCase().includes(search.toLowerCase())))
  $effect(()=>{if(search&&list.length&&!doc.loading&&!list.some(p=>p.id===doc.id))void openProject(list[0].id)})
  const index=$derived(list.findIndex(p=>p.id===doc.id))
  const neighbors=$derived(list.length>1?[-1,0,1].filter(n=>!(list.length===2&&n===1)).map(offset=>({offset,p:list[(Math.max(0,index)+offset+list.length)%list.length]})):list.map(p=>({offset:0,p})))
  const tabs=[['wardrobe','Wardrobe'],['colours','Colors'],['outfits','Outfits'],['moves','Moves']] as const
  const modes=[['preview','Preview'],['topdown','Top-down'],['side','Side-scroller']] as const
  const castScale=$derived.by(()=>{
    const mobile=viewportWidth<=760,short=viewportHeight<=540
    const rail=Math.min(414,Math.max(300,viewportWidth*.2156))
    const edge=Math.min(56,Math.max(28,viewportWidth*.0292))
    const width=mobile?viewportWidth:viewportWidth-rail-edge
    return Math.max(1,Math.floor(Math.min(width/(mobile?100:130),viewportHeight*(short?.3:mobile?.26:.43)/50)))
  })
  const castSize=(offset:number)=>64*(offset?Math.max(1,Math.round(castScale*.56)):castScale)
  const background=$derived(WORLDS[ui.theme].backgrounds[ui.sheet==='create'?'creation':experience.screen==='characters'?'selection':experience.mode])
  async function pick(id:string){if(doc.loading)return;if(id===doc.id)customize();else await openProject(id)}
  function next(delta:number){if(!list.length||doc.loading)return;void openProject(list[(Math.max(0,index)+delta+list.length)%list.length].id)}
  function selectionKey(e:KeyboardEvent){if(e.target!==selection||ui.sheet||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;const k=e.key.toLowerCase();if(['a','w','arrowleft','arrowup','d','s','arrowright','arrowdown'].includes(k)){e.preventDefault();next(['a','w','arrowleft','arrowup'].includes(k)?-1:1)}else if(k==='enter'&&list.length){e.preventDefault();customize()}}
  onMount(()=>{const short=matchMedia('(max-width:760px) and (max-height:700px)');if(short.matches)experience.expanded=true;window.addEventListener('wheel',wheel,{passive:false});return()=>window.removeEventListener('wheel',wheel)})
  let wheelAmount=0,lastWheelAt=0,lastWheelStep=-Infinity
  function wheel(e:WheelEvent){
    if(experience.screen!=='characters'||ui.sheet||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||document.querySelector(':popover-open')){wheelAmount=0;return}
    if(!e.deltaY||Math.abs(e.deltaX)>Math.abs(e.deltaY))return
    e.preventDefault()
    const now=performance.now(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1)
    if(now-lastWheelAt>180||Math.sign(delta)!==Math.sign(wheelAmount))wheelAmount=0
    lastWheelAt=now
    if(now-lastWheelStep<180){wheelAmount=0;return}
    wheelAmount+=delta
    if(Math.abs(wheelAmount)<40)return
    next(Math.sign(wheelAmount));wheelAmount=0;lastWheelStep=now
  }
  async function changeMode(mode:WorldMode){setMode(mode);await tick();document.querySelector<HTMLElement>('.world-stage')?.focus({preventScroll:true})}
  function panel(id:typeof ui.tab){document.querySelectorAll<HTMLElement>('[popover]:popover-open').forEach(el=>el.hidePopover());ui.tab=id}
  $effect(()=>{if(experience.mode!=='preview'&&ui.tab==='moves')ui.tab='wardrobe'})
  $effect(()=>{
    const screen=experience.screen
    void tick().then(()=>{
      if(!ui.sheet)(screen==='characters'?selection:document.querySelector<HTMLElement>('.world-stage'))?.focus({preventScroll:true})
    })
  })

  function back(e:KeyboardEvent) {
    if(e.repeat||!['Escape','Backspace'].includes(e.key)||ui.sheet||e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return
    if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))return
    const popover=document.querySelector<HTMLElement>('[popover]:popover-open')
    if(popover){if(e.key==='Backspace'){popover.hidePopover();e.preventDefault()}return}
    // Backspace on ordinary controls stays native; the focused world owns Back.
    if(e.key==='Backspace')return
    const disclosure=document.querySelector<HTMLDetailsElement>('.prompt-disclosure[open]')
    if(disclosure){disclosure.open=false;e.preventDefault();return}
    if(experience.screen==='studio'){characters();e.preventDefault()}
  }
  $effect(()=>{
    void doc.id; void search
    void tick().then(()=>{
      const row=document.querySelector<HTMLElement>('.character-row[aria-pressed="true"]')
      if(row?.getClientRects().length)row.scrollIntoView({block:'nearest',inline:'nearest'})
    })
  })
</script>
<svelte:window onkeydown={back} bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight}/>
<div class="experience" class:selection={experience.screen==='characters'} class:expanded={experience.expanded} style:--world-image="url('{background}')">
  <div class="scene-backdrop" aria-hidden="true"></div>
  <div class="scene-reading" aria-hidden="true"></div>
  <Toolbar />
  {#if experience.screen==='characters'}
    <div class="scene-identity"><h1>Characters</h1><p>{store.projects.filter(p=>!p.dev).length} on this device</p></div>
    <!-- Keyboard focus on this game region scopes selection shortcuts. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="selection-world bu-focus" role="application" aria-label="Character selection. WASD or arrows select; Enter customizes." tabindex="0" bind:this={selection} onkeydown={selectionKey}>
      <div class="cast">
        {#each neighbors as {p,offset} (p.id)}
          <button class="cast-character" class:chosen={!offset} onclick={()=>pick(p.id)} aria-label={offset?`Select ${p.name}`:`Customize ${name}`}>
            <CharacterThumb id={p.id} name={p.name} size={castSize(offset)}/>
            {#if REFLECTION.enabled&&REFLECTION.selection}<span class="cast-reflection" aria-hidden="true"><CharacterThumb id={p.id} name={p.name} size={castSize(offset)}/></span>{/if}
          </button>
        {/each}
      </div>
      {#if list.length}<div class="selected-caption"><button class="selected-name project-btn" popovertarget="project-menu" onclick={()=>void refreshProjects()}><h2>{name}</h2><ChevronDown size={16}/></button><div><button class="bu-action" data-variant="quiet" aria-label="Previous character" disabled={list.length<2} onclick={()=>next(-1)}><ChevronLeft size={18}/></button><span>{doc.id.startsWith('fixture:')?'Demo character':'Saved on this device'} · {Math.max(0,index)+1} / {list.length}</span><button class="bu-action" data-variant="quiet" aria-label="Next character" disabled={list.length<2} onclick={()=>next(1)}><ChevronRight size={18}/></button></div></div>{:else}<p class="empty-cast">No matching characters</p>{/if}
    </div>
    <aside class="cast-library" aria-label="Your characters"><h2>Your characters</h2><input class="bu-input" type="search" aria-label="Search characters" placeholder="Search characters" bind:value={search}/><div class="character-rows">
      {#each list as p(p.id)}<button class="bu-action character-row" data-variant="row" aria-pressed={p.id===doc.id} onclick={()=>pick(p.id)}><CharacterThumb id={p.id} name={p.name}/><span><strong>{p.name.replace(/ \(demo\)$/,'')}</strong><small>{p.demo?'Demo character':'Saved on this device'}</small></span></button>{:else}<p class="muted">No matching characters</p>{/each}
    </div><button class="bu-action customize-action" data-variant="primary" onclick={customize} disabled={doc.loading||!m||!list.length}>Customize {name}<ChevronRight size={16}/></button></aside>
  {:else}
    <div class="scene-identity"><p>Customize character</p><button class="project-btn" popovertarget="project-menu" aria-haspopup="menu" onclick={()=>void refreshProjects()}><h1>{name}</h1><ChevronDown size={18}/></button>
      {#if prompt}<details class="prompt-disclosure" ontoggle={()=>copyMessage=''}><summary>{prompt}<ChevronDown size={16}/></summary><div><p>{prompt}</p><button class="bu-action" data-variant="outline" onclick={copyPrompt}><Copy size={16}/>{copyMessage||'Copy prompt'}</button></div></details>{/if}
      <nav class="view-modes" aria-label="Character view">{#each modes as [id,label]}<button class="bu-action" data-variant="tab" aria-pressed={experience.mode===id} onclick={()=>changeMode(id as WorldMode)}>{label}</button>{/each}</nav>
    </div>
    <div class="experience-stage">
      <WorldStage/>
    </div>
    {#if experience.mode==='preview'&&m}
      <div class="experience-playback"><div class="playback-bar bu-floating" role="toolbar" aria-label="Preview controls">
        <button class="bu-action" data-variant="quiet" aria-label={ui.playing?'Pause':'Play'} onclick={()=>ui.playing=!ui.playing}>{#if ui.playing}<Pause size={18}/>{:else}<Play size={18}/>{/if}</button>
        <label><span class="sr">Move</span><select class="bu-select" data-variant="quiet" bind:value={ui.anim} onchange={()=>ui.frame=0}>{#each m.rig.animations as a}<option value={a.id}>{a.id[0].toUpperCase()+a.id.slice(1).replaceAll('-',' ')}</option>{/each}</select></label>
        {#if experience.presentation!=='animation'}<span class="small muted">{experience.presentation==='unavailable'?'Unavailable':'Still'}</span>{/if}
        <div class="facing-buttons" role="group" aria-label="Direction">{#each m.rig.directions as d}<button class="bu-action" data-variant="direction" aria-pressed={ui.dir===d.id} aria-label="Face {d.id}" onclick={()=>ui.dir=d.id}>{directionInfo(d.id)?.short??d.id}</button>{/each}</div>
        <button class="bu-action" data-variant="quiet" onclick={()=>ui.sheet='inspect'}><Grid2x2 size={16}/><span>Inspect</span></button>
      </div></div>
    {/if}
    <aside class="equipment-rail" aria-label="Customization"><button class="sheet-expand bu-action" data-variant="quiet" aria-label={experience.expanded?'Collapse equipment':'Expand equipment'} aria-expanded={experience.expanded} onclick={()=>experience.expanded=!experience.expanded}><span></span></button><nav class="equipment-modes" aria-label="Customization panels">{#each tabs.filter(t=>experience.mode==='preview'||t[0]!=='moves') as [id,label]}<button class="bu-action" data-variant="tab" aria-pressed={ui.tab===id} onclick={()=>panel(id)}>{label}</button>{/each}</nav><div class="equipment-scroll"><PhonePanel/></div></aside>
  {/if}
  {#if doc.error}<p class="experience-error" role="alert">{doc.error}</p>{/if}
</div>
