<script>
  import { onMount } from 'svelte';
  import { loadDemo } from '../../round-6-prototype/assets.js';
  import dark from '../../round-5-mockups/assets/obsidian-stage.png?url';
  import light from '../../round-5-mockups/assets/porcelain-stage.png?url';
  let { theme, playing = true, direction = 'south', outfit = 'default', onready = () => {} } = $props();
  let canvas, reflection, demo, error = $state('');
  onMount(() => {
    let alive = true, raf, start = performance.now();
    loadDemo().then(data => {
      if (!alive) return; demo = data;
      const clothes = { ...data.m.presets[0].items };
      onready({ demo, thumbnail: data.sprite(clothes,'walk','south',0).canvas.toDataURL() });
      let index = 0, lastKey = '';
      function draw(now) {
        const anim = demo.m.rig.animations.find(a => a.id === 'walk');
        if (playing) index = Math.floor((now - start)/100)%anim.frames.length;
        const key = `${outfit}/${direction}/${index}`;
        if (key === lastKey) { raf = requestAnimationFrame(draw); return; }
        lastKey = key;
        const source = demo.sprite({...clothes,head:outfit === 'default' ? clothes.head : outfit},'walk',direction,anim.frames[index].cell).canvas;
        const ctx = canvas.getContext('2d'); canvas.width = source.width; canvas.height = source.height;
        ctx.drawImage(source,0,0);
        reflection.width=source.width;reflection.height=source.height;
        const reflected=reflection.getContext('2d'); reflected.translate(0,source.height);reflected.scale(1,-1);reflected.globalAlpha=.12;reflected.drawImage(source,0,0);
        raf = requestAnimationFrame(draw);
      }
      raf = requestAnimationFrame(draw);
    }).catch(() => { error = 'Demo artwork could not load.'; });
    return () => { alive = false; cancelAnimationFrame(raf); };
  });
</script>
<div class="scene" style:background-image="url('{theme === 'dark' ? dark : light}')"><div class="scene-scrim"></div><div class="scene-actor"><canvas bind:this={canvas} width="64" height="64" aria-label="Unshaded demo character facing {direction}"></canvas><canvas bind:this={reflection} class="scene-reflection" width="64" height="64" aria-hidden="true"></canvas></div>{#if error}<p role="alert">{error}</p>{/if}</div>
