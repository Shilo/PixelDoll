<script>
  import Check from '@lucide/svelte/icons/check';
  let { label, options, value = $bindable() } = $props();
  let group;
  function key(event) {
    const keys=['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const i=options.indexOf(value), step=['ArrowRight','ArrowDown'].includes(event.key)?1:-1;
    value=options[event.key==='Home'?0:event.key==='End'?options.length-1:(i+step+options.length)%options.length];
    group.querySelectorAll('button')[options.indexOf(value)].focus();
  }
</script>
<div bind:this={group} class="pd-choice-group" role="radiogroup" aria-label={label}>{#each options as option}<button class="pd-btn" role="radio" aria-checked={value===option} tabindex={value===option?0:-1} onkeydown={key} onclick={() => value=option}>{option}{#if value===option}<Check />{/if}</button>{/each}</div>
