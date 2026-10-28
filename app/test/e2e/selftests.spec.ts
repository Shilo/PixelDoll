import { openStudio } from './immersive-helpers.ts'
import { expect, test } from '@playwright/test'
import { browserSelfTests } from '../../src/lib/selftests.ts'
import { readFile } from 'node:fs/promises'

test('offline Motion Lab edits and roundtrips motions without requesting generations',async({page},testInfo)=>{
  const paid:string[]=[],errors:string[]=[];
  await page.addInitScript(()=>localStorage.setItem('pixeldoll.agentKey','off'));
  await page.route('https://*.pixellab.ai/**',route=>{paid.push(route.request().method());return route.abort()});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/motion-lab.html');await expect(page.getByRole('status')).toContainText('Offline lab ready');
  await page.getByRole('combobox',{name:'Direction',exact:true}).selectOption('east');
  await expect(page.getByRole('spinbutton',{name:'Camera bearing',exact:true})).not.toHaveValue('0');
  await page.getByRole('combobox',{name:'Preset',exact:true}).selectOption('death');
  await expect(page.getByRole('checkbox',{name:'Append terminal buffer'})).toBeChecked();
  await expect(page.getByRole('region',{name:'Pose diagnostics'})).toContainText('128 × 128 px');
  await page.getByRole('combobox',{name:'Preset',exact:true}).selectOption('idle');
  await page.getByRole('checkbox',{name:'Correct reference joints'}).check();
  const field=page.getByRole('spinbutton',{name:'X, fraction',exact:true}),previous=await field.inputValue();
  await field.fill(String(Number(previous)+0.005));await page.getByRole('button',{name:'Apply joint edit',exact:true}).click();
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(field).toHaveValue(previous);
  await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(field).not.toHaveValue(previous);
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Save motion document'}).click();const file=await(await downloading).path();
  await page.getByRole('combobox',{name:'Body',exact:true}).selectOption('chibi');
  await page.locator('input[type=file]').setInputFiles(file!);await expect(page.getByRole('combobox',{name:'Body',exact:true})).toHaveValue('c27man');
  await expect(page.getByRole('button',{name:/Generate candidate/})).toBeDisabled();
  await page.screenshot({path:testInfo.outputPath('motion-lab.png'),fullPage:true});expect(paid).toEqual([]);expect(errors).toEqual([]);
});

test('Motion Lab preserves candidate review, buffer exclusion and authored hold in credential-free exports',async({page})=>{
  const paid:string[]=[];await page.addInitScript(()=>localStorage.setItem('pixeldoll.agentKey','off'));await page.route('https://*.pixellab.ai/**',route=>{paid.push(route.request().method());return route.abort()});
  await page.goto('/motion-lab.html');await expect(page.getByRole('status')).toContainText('Offline lab ready');
  await page.evaluate(async()=>{
    const dbPath='/src/lib/store/db.ts',modelPath='/src/ui/motion-lab/model.ts',db=await import(dbPath),model=await import(modelPath),library=await(await fetch('/fixtures/motion-lab/library.json')).json();
    const document=model.newDocument(library,library.fixtures[0],library.clips.find((c:{id:string})=>c.id==='death')),png=document.fixture.references.south.png;
    const bytes=Uint8Array.from(atob(png),(c)=>c.charCodeAt(0)),sha=await db.putBlob(bytes),now=Date.now();
    await db.put('jobs','motion-review-fixture',{id:'motion-review-fixture',label:'Review fixture',tag:'motion-lab-2026-10-28',method:'POST',endpoint:'/animate-with-skeleton-v3',params:{},inputs:[sha],requestHash:'fixture',state:'done',attempts:1,nextAt:0,createdAt:now,finishedAt:now,jobs:[{id:'fixture-remote',status:'completed',done:true,results:Array.from({length:10},(_,i)=>({label:String(i),sha}))}],gens:3,usd:0});
    localStorage.setItem('pixeldoll.motionLab.2026-10-28',JSON.stringify({version:1,reservations:[{id:'fixture',jobId:'motion-review-fixture',estimate:3,label:'Review fixture',document,seed:7,createdAt:new Date(now).toISOString()}]}));
  });
  await page.reload();const candidate=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Review fixture',exact:true})});
  await expect(candidate.getByRole('button',{name:'Export reviewed clip',exact:true})).toBeDisabled();
  await candidate.getByRole('button',{name:'Inspect raw frame 10',exact:true}).click();await expect(candidate.getByRole('checkbox',{name:'Use selected frame'})).not.toBeChecked();
  await candidate.getByRole('combobox',{name:'Review status',exact:true}).selectOption('accepted');await candidate.getByRole('textbox').fill('Fixture for export persistence only; no visual qualification.');
  await candidate.getByRole('button',{name:'Save review',exact:true}).click();await expect(candidate.getByRole('status')).toHaveText('Review saved locally.');await page.reload();
  await expect(candidate.getByRole('textbox')).toHaveValue('Fixture for export persistence only; no visual qualification.');
  const downloading=page.waitForEvent('download');await candidate.getByRole('button',{name:'Export reviewed clip',exact:true}).click();const output=JSON.parse(await readFile((await(await downloading).path())!,'utf8'));
  expect(output.frames).toHaveLength(9);expect(output.frames.at(-1).sourceIndex).toBe(8);expect(output.frames.at(-1).duration).toBe(output.frames[0].duration+600);expect(output.kind).toBe('pixeldoll-reviewed-motion');expect(paid).toEqual([]);
});

test('browser PNG and IndexedDB self-tests preserve every registered check', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'))
  await page.route('https://api.pixellab.ai/**', (route) => route.abort())
  await page.goto('/#/selftest')
  const result = page.getByTestId('selftest')
  // Wait for the run to finish (the shard's first cold dev-server load may be slow), then fail at once with the harness log.
  await expect(result).toHaveAttribute('data-failures', /^\d+$/, { timeout: 20_000 })
  const text = await result.innerText(), lines = text.split('\n')
  expect(await result.getAttribute('data-failures'), text).toBe('0')
  expect(lines).toHaveLength(browserSelfTests.length + 1)
  for (const [name] of browserSelfTests) expect(lines).toContain('ok   ' + name)
  expect(lines.at(-1)).toBe('all self-tests passed')
  expect(errors).toEqual([])
})

test('move QA survives real storage, ZIP export and directional replacements', async ({ page }) => {
  const errors: string[] = [], paid: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('https://api.pixellab.ai/**', route => { paid.push(route.request().method()); return route.abort() })
  await page.goto('/test/fixtures/qa-summary.html')
  const run = async (id: string) => { await page.locator(`#${id}`).click(); await expect(page.getByRole('status')).toHaveText(`PASS ${id}`) }
  const value = (key: string) => page.locator('#summary tr').filter({ has: page.getByRole('rowheader', { name: key, exact: true }) }).locator('td')
  await run('create'); await expect(value('status')).toHaveText('pass')
  await run('add'); await expect(value('status')).toHaveText('fail'); await expect(value('shiftedFrames')).toHaveText('2'); await expect(value('maxKeyOutside')).toHaveText('0.2')
  await page.reload(); await run('reload'); await expect(value('status')).toHaveText('fail')
  await run('south'); await expect(value('shiftedFrames')).toHaveText('1'); await expect(value('status')).toHaveText('fail')
  await run('roundtrip')
  await run('east'); await expect(value('status')).toHaveText('pass'); await expect(value('shiftedFrames')).toHaveText('0'); await expect(value('strayPx')).toHaveText('0')
  await run('roundtrip'); await run('legacy'); await expect(value('status')).toHaveText('warn'); await expect(value('legacy')).toContainText('"clips"')
  expect(errors).toEqual([]); expect(paid).toEqual([])
})

test('copying a demo publishes its images atomically against concurrent garbage collection', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await page.route('https://*.pixellab.ai/**', route => route.abort())
  await openStudio(page, '/'); await expect(page.locator('.world-actors')).toBeVisible()
  const result = await page.evaluate(async () => {
    const statePath = '/src/studio/state.svelte.ts', dbPath = '/src/lib/store/db.ts', projectPath = '/src/lib/store/project.ts'
    const state = await import(statePath), db = await import(dbPath), project = await import(projectPath)
    let done = false
    const copying = state.copyDemo().finally(() => { done = true })
    while (!done) await db.gcBlobs()
    const id = await copying, saved = await project.loadProject(id)
    return { current: state.doc.id, id, name: saved.rec.manifest.name, images: saved.project.images.size }
  })
  expect(result.current).toBe(result.id); expect(result.name).toBe('Adventurer copy'); expect(result.images).toBeGreaterThan(0)
})
