<script lang="ts">
  import {labQueue} from './run.ts';
  import {browserMcp,type McpTool} from './mcp.ts';
  let {connected,download}:{connected:boolean;download:(name:string,value:unknown)=>void}=$props();
  let client:ReturnType<typeof browserMcp>|undefined,tools=$state<McpTool[]>([]),events=$state<{operation:string;at:string;result:unknown}[]>([]),busy=$state(false),error=$state(''),search=$state('bald'),character=$state('');
  const latest=$derived(events.at(-1));
  async function action(kind:'inspect'|'list'|'character'){if(busy)return;busy=true;error='';try{let result:unknown;if(kind==='inspect'){client=browserMcp(labQueue.key);const catalog=await client.inspect();tools=catalog.tools;result=catalog;}else{if(!client)throw new Error('Inspect the live tool schema first.');result=await client.read(kind==='list'?'list_characters':'get_character',kind==='list'?{search,limit:10}:{character_id:character,include_preview:false});}events.push({operation:kind,at:new Date().toISOString(),result});}catch(e){error=(e as Error).message;}finally{busy=false;}}
  function exported(){download('pixeldoll-custom-v3-inspection.json',{version:1,date:'2026-11-01',connected,paidRequests:0,events,error});}
</script>
<section class="bu-dialog-surface probe" aria-label="Custom Skeleton v3 inspection"><h2>Custom Skeleton v3 inspection</h2><p>Read-only MCP checks. Inspect the live schema and existing benchmark characters before any custom-motion call. This panel cannot queue generation.</p>
  <div class="bu-actions"><button class="bu-btn" disabled={!connected||busy} onclick={()=>action('inspect')}>Inspect custom V3 MCP schema (free)</button><label>Benchmark character search<input class="bu-input" bind:value={search}></label><button class="bu-btn" disabled={!tools.length||busy} onclick={()=>action('list')}>Find benchmark characters (free)</button><label>Managed character ID<input class="bu-input" bind:value={character}></label><button class="bu-btn" disabled={!tools.length||!character||busy} onclick={()=>action('character')}>Read benchmark character (free)</button><button class="bu-btn" onclick={exported}>Export custom V3 inspection</button></div>
  <p aria-live="polite">{busy?'Reading PixelLab MCP…':`${events.length} completed read-only checks.`}</p>{#if error}<p role="alert" class="bu-error">{error}</p>{/if}{#if latest}<details open><summary>{latest.operation} response</summary><pre>{JSON.stringify(latest.result,null,2)}</pre></details>{/if}
</section>
<style>.probe{padding:16px;display:grid;gap:12px}.probe pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto}.probe label{display:grid;gap:6px}</style>
