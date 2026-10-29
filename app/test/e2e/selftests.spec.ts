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
  const calibrated=await field.inputValue();await page.getByRole('combobox',{name:'Preset',exact:true}).selectOption('walk');await expect(field).toHaveValue(calibrated);
  await page.getByRole('combobox',{name:'Preset',exact:true}).selectOption('idle');await expect(field).toHaveValue(calibrated);
  await page.getByRole('spinbutton',{name:'Camera elevation',exact:true}).fill('17');
  await page.getByRole('button',{name:'Save body/view calibration',exact:true}).click();await expect(page.getByRole('status')).toContainText('Calibration saved');
  await page.getByRole('combobox',{name:'Body',exact:true}).selectOption('chibi');await page.getByRole('combobox',{name:'Body',exact:true}).selectOption('c27man');await page.getByRole('combobox',{name:'Direction',exact:true}).selectOption('east');await expect(field).toHaveValue(calibrated);await expect(page.getByRole('spinbutton',{name:'Camera elevation',exact:true})).toHaveValue('17');
  await page.reload();await expect(page.getByRole('status')).toContainText('Offline lab ready');await page.getByRole('combobox',{name:'Direction',exact:true}).selectOption('east');await page.getByRole('checkbox',{name:'Correct reference joints'}).check();await expect(field).toHaveValue(calibrated);await expect(page.getByRole('spinbutton',{name:'Camera elevation',exact:true})).toHaveValue('17');
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Save motion document'}).click();const file=await(await downloading).path();
  await page.getByRole('combobox',{name:'Body',exact:true}).selectOption('chibi');
  await page.locator('input[type=file]').setInputFiles(file!);await expect(page.getByRole('combobox',{name:'Body',exact:true})).toHaveValue('c27man');
  await page.getByRole('combobox',{name:'KayKit control',exact:true}).selectOption('walk');await expect(page.getByRole('combobox',{name:'Preset',exact:true})).toHaveValue('kaykit-walk');
  await page.getByRole('combobox',{name:'Body',exact:true}).selectOption('chibi');await expect(page.getByRole('combobox',{name:'Preset',exact:true})).toHaveValue('kaykit-walk');
  await expect(page.getByRole('button',{name:/Generate candidate/})).toBeDisabled();
  await page.getByRole('combobox',{name:'Preset',exact:true}).selectOption('run');await page.getByRole('button',{name:'Draft stance contacts',exact:true}).click();await page.getByRole('button',{name:'Sample contact events',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'World Z speed, px/s',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Remove authored contacts',exact:true}).click();await expect(page.getByRole('button',{name:'Sample contact events',exact:true})).toBeDisabled();
  await page.screenshot({path:testInfo.outputPath('motion-lab.png'),fullPage:true});expect(paid).toEqual([]);expect(errors).toEqual([]);
});

test('Motion Lab preserves candidate review, buffer exclusion and authored hold in credential-free exports',async({page})=>{
  await page.clock.install();
  const paid:string[]=[];await page.addInitScript(()=>localStorage.setItem('pixeldoll.agentKey','off'));await page.route('https://*.pixellab.ai/**',route=>{paid.push(route.request().method());return route.abort()});
  await page.goto('/motion-lab.html');await expect(page.getByRole('status')).toContainText('Offline lab ready');
  await page.evaluate(async()=>{
    const dbPath='/src/lib/store/db.ts',modelPath='/src/ui/motion-lab/model.ts',db=await import(dbPath),model=await import(modelPath),library=await(await fetch('/fixtures/motion-lab/library.json')).json();
    const document=model.newDocument(library,library.fixtures[0],library.clips.find((c:{id:string})=>c.id==='death')),png=document.fixture.references.south.png;
    document.times=[0,1.1,2.2];document.durations=[1100,1100,400];
    const pngPath='/src/lib/image/pngraw.ts',codec=await import(pngPath),native=await codec.decodePngBytes(Uint8Array.from(atob(png),(c)=>c.charCodeAt(0)));
    const bytes=await codec.encodePngBytes(model.paddedReference(native,document.padding)),sha=await db.putBlob(bytes),now=Date.now();
    const rendered=model.renderPoses(document),params={first_frame:{$blob:sha},first_frame_keypoints:rendered.result.rest,keypoints:rendered.poses};
    await db.put('jobs','motion-review-fixture',{id:'motion-review-fixture',label:'Review fixture',tag:'motion-lab-2026-10-28',method:'POST',endpoint:'/animate-with-skeleton-v3',params,inputs:[sha],requestHash:'fixture',state:'done',attempts:1,nextAt:0,createdAt:now,finishedAt:now,jobs:[{id:'fixture-remote',status:'completed',done:true,results:Array.from({length:4},(_,i)=>({label:String(i),sha}))}],gens:3,usd:0});
    localStorage.setItem('pixeldoll.motionLab.2026-10-28',JSON.stringify({version:1,reservations:[{id:'fixture',jobId:'motion-review-fixture',estimate:3,label:'Review fixture',document,seed:7,createdAt:new Date(now).toISOString()}]}));
  });
  await page.reload();const candidate=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Review fixture',exact:true})});
  await expect(candidate.getByRole('button',{name:'Export reviewed clip',exact:true})).toBeDisabled();
  await candidate.getByRole('button',{name:'Inspect raw frame 4',exact:true}).click();await expect(candidate.getByRole('checkbox',{name:'Use selected frame'})).not.toBeChecked();
  await candidate.getByRole('button',{name:'Inspect raw frame 3',exact:true}).click();await candidate.getByRole('spinbutton',{name:'Selected frame duration, ms',exact:true}).fill('450');
  await candidate.getByRole('combobox',{name:'Review status',exact:true}).selectOption('accepted');await candidate.getByRole('textbox').fill('Fixture for export persistence only; no visual qualification.');
  await page.evaluate(async()=>{const path='/src/ui/motion-lab/run.ts';await(await import(path)).connectLab()});
  await expect(candidate.getByRole('textbox')).toHaveValue('Fixture for export persistence only; no visual qualification.');
  await candidate.getByRole('button',{name:'Save review',exact:true}).click();await expect(candidate.getByRole('status')).toHaveText('Review saved locally.');await page.reload();
  await expect(candidate.getByRole('textbox')).toHaveValue('Fixture for export persistence only; no visual qualification.');
  const downloading=page.waitForEvent('download');await candidate.getByRole('button',{name:'Export reviewed clip',exact:true}).click();const output=JSON.parse(await readFile((await(await downloading).path())!,'utf8'));
  expect(output.frames).toHaveLength(3);expect(output.frames.at(-1).sourceIndex).toBe(2);expect(output.frames.at(-1).duration).toBe(1050);expect(output.frames[0].duration).toBe(1100);expect(output.frames[0].keypoints).toHaveLength(18);expect(output.reference.keypoints).toHaveLength(18);expect(output.loop).toBe(false);expect(output.kind).toBe('pixeldoll-reviewed-motion');expect(output.cell).toEqual({w:128,h:128});expect(output.pivot.x).toBe(output.fixture.pivot.x+24);
  await candidate.getByRole('button',{name:'Inspect raw frame 1',exact:true}).click();await candidate.getByRole('button',{name:'Play candidate',exact:true}).click();await page.clock.runFor(4000);await expect(candidate.getByRole('button',{name:'Play candidate',exact:true})).toBeVisible();await expect(candidate.getByText('Raw frame 3/4',{exact:true})).toBeVisible();expect(paid).toEqual([]);
  await candidate.getByRole('button',{name:'Author held item',exact:true}).click();const editor=page.getByRole('region',{name:'Authored held item',exact:true});
  await editor.getByLabel('Attachment PNG',{exact:true}).setInputFiles({name:'synthetic-source.png',mimeType:'image/png',buffer:Buffer.from(output.reference.png,'base64')});
  await editor.getByRole('spinbutton',{name:'Blade angle, degrees',exact:true}).fill('35');await editor.getByRole('textbox',{name:'Attachment review notes',exact:true}).fill('Synthetic UI fixture only, no weapon quality claim.');
  await editor.getByRole('button',{name:'Save attachment draft',exact:true}).click();await expect(editor.getByRole('status')).toContainText('saved locally');
  const attachmentDownload=page.waitForEvent('download');await editor.getByRole('button',{name:'Save attachment document',exact:true}).click();const attachment=JSON.parse(await readFile((await(await attachmentDownload).path())!,'utf8'));
  expect(attachment.body.hashes).toHaveLength(4);expect(attachment.frames[0].angle).toBe(35);expect(attachment.body.jobId).toBe('motion-review-fixture');expect(attachment.body.padding).toBeGreaterThan(0);
  await page.reload();await candidate.getByRole('button',{name:'Author held item',exact:true}).click();await expect(editor.getByRole('spinbutton',{name:'Blade angle, degrees',exact:true})).toHaveValue('35');expect(paid).toEqual([]);
});

test('Motion Lab blocks mirrors, unresolved reservations and an exhausted budget before paid transport',async({page})=>{
  const paid:string[]=[];await page.addInitScript(()=>localStorage.setItem('pixeldoll.agentKey','off'));
  await page.route('https://*.pixellab.ai/**',route=>{if(route.request().method()==='POST')paid.push(route.request().url());return route.abort()});
  await page.goto('/motion-lab.html');await expect(page.getByRole('status')).toContainText('Offline lab ready');
  const result=await page.evaluate(async()=>{
    const runPath='/src/ui/motion-lab/run.ts',modelPath='/src/ui/motion-lab/model.ts',run=await import(runPath),model=await import(modelPath),library=await(await fetch('/fixtures/motion-lab/library.json')).json();
    const messages:string[]=[];try{await run.generateCandidate(model.newDocument(library,library.fixtures[0],library.clips[0],'west'),7)}catch(e){messages.push((e as Error).message)}
    const doc=model.newDocument(library),original=run.labQueue.enqueue;let calls=0;run.labQueue.setKey('synthetic-test-value');
    run.labQueue.enqueue=async()=>{calls++;throw new Error('Simulated enqueue preparation failure')};
    try{await run.generateCandidate(doc,7)}catch(e){messages.push((e as Error).message)}finally{run.labQueue.enqueue=original}
    try{await run.generateCandidate(doc,7)}catch(e){messages.push((e as Error).message)}
    const ledger=run.readLedger(),unresolved=ledger.reservations.length;ledger.reservations[0].estimate=run.LAB_CAP;localStorage.setItem('pixeldoll.motionLab.2026-10-28',JSON.stringify(ledger));
    try{await run.generateCandidate(doc,8)}catch(e){messages.push((e as Error).message)}
    const charged={...ledger,reservations:ledger.reservations.map((r:Record<string,unknown>)=>({...r,jobId:'charge-fixture'}))};
    return{messages,calls,unresolved,finalReservations:run.readLedger().reservations.length,chargedReserved:run.phaseReserved(charged,new Map([['charge-fixture',run.LAB_CAP+5]])),cap:run.LAB_CAP};
  });
  expect(result.messages[0]).toContain('mirrored frozen');expect(result.messages[1]).toBe('Simulated enqueue preparation failure');expect(result.messages[2]).toContain('unresolved reservation');expect(result.messages[3]).toContain('allowance is exhausted');
  expect(result.calls).toBe(1);expect(result.unresolved).toBe(1);expect(result.finalReservations).toBe(1);expect(result.chargedReserved).toBe(result.cap+5);expect(paid).toEqual([]);
});

test('Motion Lab stores visible sole marks and reports only sampled projected displacement',async({page})=>{
  const paid:string[]=[];await page.addInitScript(()=>localStorage.setItem('pixeldoll.agentKey','off'));await page.route('https://*.pixellab.ai/**',route=>{paid.push(route.request().method());return route.abort()});
  await page.goto('/motion-lab.html');await expect(page.getByRole('status')).toContainText('Offline lab ready');
  const sole=await page.evaluate(async()=>{
    const dbPath='/src/lib/store/db.ts',modelPath='/src/ui/motion-lab/model.ts',diagnosticsPath='/src/ui/motion-lab/diagnostics.ts',codecPath='/src/lib/image/pngraw.ts',db=await import(dbPath),model=await import(modelPath),diagnostics=await import(diagnosticsPath),codec=await import(codecPath),library=await(await fetch('/fixtures/motion-lab/library.json')).json();
    const doc=model.newDocument(library,library.fixtures[0],library.clips.find((c:{id:string})=>c.id==='run'),'east');doc.planting=diagnostics.proposePlanting(doc,[0,50]);Object.assign(doc,diagnostics.contactSampling(doc));const png=doc.fixture.references.east.png,bytes=Uint8Array.from(atob(png),(c)=>c.charCodeAt(0)),image=await codec.decodePngBytes(bytes),sha=await db.putBlob(bytes),now=Date.now(),rendered=model.renderPoses(doc);
    let point={x:0,y:0};for(let y=Math.floor(image.h*0.75);y<image.h;y++)for(let x=0;x<image.w;x++)if(image.data[(y*image.w+x)*4+3])point={x:x+0.5,y:y+0.5};
    await db.put('jobs','sole-fixture',{id:'sole-fixture',label:'Synthetic sole fixture',tag:'motion-lab-2026-10-28',method:'POST',endpoint:'/animate-with-skeleton-v3',params:{first_frame:{$blob:sha},first_frame_keypoints:rendered.result.rest,keypoints:rendered.poses},inputs:[sha],requestHash:'fixture',state:'done',attempts:1,nextAt:0,createdAt:now,finishedAt:now,jobs:[{id:'fixture-remote',status:'completed',done:true,results:Array.from({length:12},(_,i)=>({label:String(i),sha}))}],gens:3,usd:0});
    localStorage.setItem('pixeldoll.motionLab.2026-10-28',JSON.stringify({version:1,reservations:[{id:'fixture',jobId:'sole-fixture',estimate:3,label:'Synthetic sole fixture',document:doc,seed:7,createdAt:new Date(now).toISOString()}]}));return{x:point.x/image.w*320,y:point.y/image.h*320};
  });
  await page.reload();await page.getByRole('button',{name:'Measure rendered soles',exact:true}).click();const editor=page.getByRole('region',{name:'Rendered sole qualification',exact:true});await editor.getByRole('combobox',{name:'Measured foot',exact:true}).selectOption('LEFT LEG');
  for(const frame of [2,3]){await page.getByRole('button',{name:`Inspect raw frame ${frame}`,exact:true}).click();await editor.getByLabel('Mark visible sole landmark',{exact:true}).click({position:sole});}
  await editor.getByRole('textbox',{name:'Sole review notes',exact:true}).fill('Synthetic UI fixture, not a rendered quality claim.');await editor.getByRole('button',{name:'Save sole measurements',exact:true}).click();await expect(editor.getByRole('status')).toContainText('saved locally');
  const downloading=page.waitForEvent('download');await editor.getByRole('button',{name:'Export sole measurements',exact:true}).click();const output=JSON.parse(await readFile((await(await downloading).path())!,'utf8')),left=output.measurements.find((m:{foot:string})=>m.foot==='LEFT LEG');expect(left.complete).toBe(true);expect(left.worldSpan).toBeGreaterThan(0.1);expect(output.qualified).toBe(false);
  await page.reload();await page.getByRole('button',{name:'Measure rendered soles',exact:true}).click();await expect(editor.getByRole('textbox',{name:'Sole review notes',exact:true})).toHaveValue('Synthetic UI fixture, not a rendered quality claim.');expect(paid).toEqual([]);
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
