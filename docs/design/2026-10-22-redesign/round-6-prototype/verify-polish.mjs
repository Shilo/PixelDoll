// Follow-up behavior/composition checks against the isolated, keyless prototype.
import { chromium, webkit } from '../../../../app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202';
assert.equal(new URL(base).hostname, '127.0.0.1');
const engine = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium';
const creatorOnly = process.env.POLISH_CREATOR_BOUNDARIES === '1';
const matrix = creatorOnly
  ? [...[1350, 1351, 1000, 1001, 760, 761].flatMap(width => [[width, 540], [width, 541]]), [540, 390], [541, 390]]
  : [[320, 500], [390, 844], [450, 800], [568, 320], [769, 889], [844, 390], [1101, 800], [1175, 711], [1350, 500], [1350, 800], [1469, 889], [1920, 1080]];
const requestedWidths = process.env.POLISH_WIDTHS?.split(',').map(Number);
if (requestedWidths) assert.ok(requestedWidths.every(width => matrix.some(viewport => viewport[0] === width)), 'POLISH_WIDTHS must select widths from the documented matrix');
const viewports = requestedWidths ? matrix.filter(viewport => requestedWidths.includes(viewport[0])) : matrix;
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
const errors = [], external = [], cases = [];
const sceneTextMinimum = { normal: Infinity, large: Infinity };
let currentCase = '';

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function stageCenter(page, screen) {
  await settle(page);
  const measurements = await page.evaluate(screen => {
    const snapshot = window.prototype.snapshot(), rail = document.querySelector(screen === 'selection' ? '.library' : '.wardrobe');
    const r = rail.getBoundingClientRect();
    // A right-side rail excludes horizontal scene space; a bottom sheet does not.
    const sidebar = rail.checkVisibility() && r.left > innerWidth * .25 && r.width < innerWidth * .65;
    const expected = sidebar ? r.left / 2 : innerWidth / 2;
    const actor = screen === 'selection' ? snapshot.selectionActors?.find(box => box.index === snapshot.state.character) : snapshot.actorBounds;
    const label = document.querySelector(screen === 'selection' ? '.selected-name' : '.playback');
    const l = label?.getBoundingClientRect();
    return { expected, actorCenter: actor && actor.x + actor.w / 2, labelCenter: l && l.x + l.width / 2, rail: { x: r.left, width: r.width }, sidebar };
  }, screen);
  assert.equal(typeof measurements.actorCenter, 'number', `${currentCase} ${screen}: actual painted actor bounds are available`);
  assert.ok(Math.abs(measurements.actorCenter - measurements.expected) <= 2, `${currentCase} ${screen}: actor centers in space excluding the actual sidebar: ${JSON.stringify(measurements)}`);
  if (measurements.labelCenter !== undefined) assert.ok(Math.abs(measurements.labelCenter - measurements.expected) <= 2, `${currentCase} ${screen}: caption/playback shares the actor's center: ${JSON.stringify(measurements)}`);
}

async function canvasCharacter(page, index) {
  await settle(page);
  const point = await page.evaluate(index => {
    const box = window.prototype.snapshot().selectionActors?.find(box => box.index === index);
    if (!box) return null;
    for (const fy of [.5, .7, .3]) for (const fx of [.5, .7, .3, .9, .1]) {
      const x = box.x + box.w * fx, y = box.y + box.h * fy;
      if (x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && document.elementFromPoint(x, y)?.id === 'actors') return { x, y };
    }
    return null;
  }, index);
  assert.ok(point, `${currentCase}: character ${index} has a reachable scene target`);
  await page.mouse.click(point.x, point.y);
}

async function partsAnchored(page) {
  const placement = await page.evaluate(() => {
    const a = document.querySelector('[data-action="slot:all"]').getBoundingClientRect(), p = document.querySelector('.parts-popover').getBoundingClientRect(), nav = document.querySelector('.mode-tabs').getBoundingClientRect();
    const above = a.top - 8 - p.height;
    return { anchorTop: a.top, anchorBottom: a.bottom, top: p.top, bottom: p.bottom, left: p.left, right: p.right, height: p.height, viewport: innerHeight, navTop: nav.top, navBottom: nav.bottom, aboveCoversNavigation: above < nav.bottom && above + p.height > nav.top };
  });
  assert.ok(placement.left >= 11 && placement.right <= (await page.evaluate(() => innerWidth)) - 11 && placement.top >= 11 && placement.bottom <= placement.viewport - 11, `${currentCase}: anchored parts menu stays within viewport margins`);
  if (placement.anchorBottom + 8 + placement.height <= placement.viewport - 12) assert.ok(Math.abs(placement.top - placement.anchorBottom - 8) <= 1, `${currentCase}: parts menu sits 8px below its trigger when space permits`);
  else if (placement.anchorTop - 8 - placement.height >= 12 && !placement.aboveCoversNavigation) assert.ok(Math.abs(placement.bottom - placement.anchorTop + 8) <= 1, `${currentCase}: parts menu sits 8px above its trigger when below cannot fit`);
  else assert.ok(placement.bottom <= placement.navTop - 7 || placement.top >= placement.navBottom + 7, `${currentCase}: constrained placement keeps panel navigation reachable`);
}

async function partsStayBounded(page) {
  if (!await page.locator('.parts-popover').count()) return;
  const bounds = await page.locator('.parts-popover').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
  assert.ok(bounds.left >= 11 && bounds.right <= bounds.width - 11 && bounds.top >= 11 && bounds.bottom <= bounds.height - 11, `${currentCase}: parts menu stays inside the viewport after anchor scrolling/resizing: ${JSON.stringify(bounds)}`);
}

async function creatorMaterials(page) {
  const controls = await page.locator('.creator .presets button,.creator .frame-row button,.creator .compass button,.creator input,.creator select,.creator textarea,.draft-name input').evaluateAll(elements => {
    const context = document.createElement('canvas').getContext('2d');
    const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v); };
    const over = (top, bottom) => { const alpha = top[3] + bottom[3] * (1 - top[3]); return [...top.slice(0, 3).map((v, i) => (v * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / (alpha || 1)), alpha]; };
    const luminance = color => color.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    return elements.filter(el => !el.disabled && el.checkVisibility()).map(el => {
      let fill = [0, 0, 0, 0], text = rgba(getComputedStyle(el).color);
      for (let node = el; node && node.id !== 'ui'; node = node.parentElement) {
        const style = getComputedStyle(node), backing = rgba(style.backgroundColor), opacity = Number(style.opacity);
        fill = over(fill, backing); text = over(text, backing);
        fill[3] *= opacity; text[3] *= opacity;
      }
      const contrast = Math.min(...[0, 255].map(backdrop => {
        const bg = over(fill, [backdrop, backdrop, backdrop, 1]), fg = over(text, [backdrop, backdrop, backdrop, 1]), a = luminance(fg), b = luminance(bg);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      }));
      return { name: el.dataset.action || el.dataset.draft, alpha: fill[3], contrast };
    });
  });
  assert.ok(controls.length > 20);
  for (const control of controls) {
    assert.ok(control.alpha >= .92, `${currentCase}: ${control.name} has enough backing over the scene (${control.alpha})`);
    assert.ok(control.contrast >= 4.5, `${currentCase}: ${control.name} text retains 4.5:1 contrast over either extreme backdrop (${control.contrast})`);
  }
}

async function creatorSceneText(page) {
  const originalScroll = await page.locator('.creator').evaluate(el => el.scrollTop);
  for (const fraction of [0, .5, 1]) {
    await page.locator('.creator').evaluate((el, fraction) => el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction, fraction);
    const targets = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d');
      return [...document.querySelectorAll('.creation-workspace h1,.creation-workspace label,.creator small,.creator .exact-excerpt,.creator p.muted,.create-footer small,.size-guide,.size-guide dt,.size-guide dd,.editor-tabs button,.editor-actions button')].flatMap(el => {
        if (!el.checkVisibility() || el.disabled) return [];
        const style = getComputedStyle(el); context.clearRect(0, 0, 1, 1); context.fillStyle = style.color; context.fillRect(0, 0, 1, 1);
        const color = [...context.getImageData(0, 0, 1, 1).data];
        return [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).flatMap(node => {
          const range = document.createRange(); range.selectNodeContents(node);
          return [...range.getClientRects()].flatMap(rect => {
            let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right), top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
            for (let ancestor = el; ancestor && ancestor.id !== 'ui'; ancestor = ancestor.parentElement) {
              const s = getComputedStyle(ancestor), a = ancestor.getBoundingClientRect();
              if (s.overflowX !== 'visible') { left = Math.max(left, a.left + ancestor.clientLeft); right = Math.min(right, a.left + ancestor.clientLeft + ancestor.clientWidth); }
              if (s.overflowY !== 'visible') { top = Math.max(top, a.top + ancestor.clientTop); bottom = Math.min(bottom, a.top + ancestor.clientTop + ancestor.clientHeight); }
            }
            return right - left >= 2 && bottom - top >= 2 ? [{ text: node.textContent.trim().slice(0, 36), left, right, top, bottom, color, threshold: parseFloat(style.fontSize) >= 24 ? 3 : 4.5 }] : [];
          });
        });
      });
    });
    const hide = await page.addStyleTag({ content: '.creation-workspace * { color:transparent!important; text-shadow:none!important; }' });
    let png;
    try { png = (await page.screenshot({ scale: 'css' })).toString('base64'); }
    finally { await hide.evaluate(el => el.remove()); }
    const contrasts = await page.evaluate(async ({ png, targets }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const luminance = color => color.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
      return targets.map(target => {
        let minimum = Infinity;
        for (let y = Math.ceil(target.top); y < target.bottom; y += 4) for (let x = Math.ceil(target.left); x < target.right; x += 4) {
          const background = [...context.getImageData(x, y, 1, 1).data], alpha = target.color[3] / 255;
          const foreground = target.color.slice(0, 3).map((value, i) => value * alpha + background[i] * (1 - alpha));
          const a = luminance(foreground), b = luminance(background);
          minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05));
        }
        return { text: target.text, contrast: minimum, threshold: target.threshold };
      });
    }, { png, targets });
    assert.ok(contrasts.length > 0);
    for (const result of contrasts) {
      const role = result.threshold === 3 ? 'large' : 'normal'; sceneTextMinimum[role] = Math.min(sceneTextMinimum[role], result.contrast);
      assert.ok(result.contrast >= result.threshold, `${currentCase}: creator text "${result.text}" meets ${result.threshold}:1 against its actual scene backing (${result.contrast.toFixed(2)}:1)`);
    }
  }
  await page.locator('.creator').evaluate((el, scroll) => el.scrollTop = scroll, originalScroll);
}

async function checkCreator(page) {
  const geometry = await page.locator('.creator').evaluate(form => {
    const title = document.querySelector('.draft-header h1').getBoundingClientRect(), name = document.querySelector('.draft-name').getBoundingClientRect(), footer = document.querySelector('.create-footer').getBoundingClientRect(), f = form.getBoundingClientRect();
    const rows = [...form.querySelectorAll('.editor-actions,.presets,.compass>div,.frame-row')];
    const overflow = rows.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className || el.textContent.trim().slice(0, 20));
    const unreachable = [];
    for (const control of form.querySelectorAll('button:not(:disabled),input,textarea,select')) {
      if (!control.checkVisibility()) continue;
      control.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = control.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (r.left < f.left - 2 || r.right > f.right + 2 || !control.contains(hit)) unreachable.push(control.dataset.action || control.dataset.draft);
    }
    form.scrollTop = 0;
    const mirrors = [...form.querySelectorAll('.mirror')].map(el => el.getBoundingClientRect());
    return {
      headerOverlaps: Math.min(title.right, name.right) > Math.max(title.left, name.left) && Math.min(title.bottom, name.bottom) > Math.max(title.top, name.top),
      bounded: f.width > 0 && f.height > 0 && f.left >= 0 && f.right <= innerWidth + 1 && f.bottom <= footer.top + 1 && footer.bottom <= innerHeight + 1,
      overflow, unreachable, formOverflow: form.scrollWidth > form.clientWidth + 1,
      coarseMirrors: !matchMedia('(pointer:coarse)').matches || mirrors.every(r => r.width >= 44 && r.height >= 44),
    };
  });
  assert.equal(geometry.headerOverlaps, false, `${currentCase}: creator title and Name remain separate`);
  assert.ok(geometry.bounded && !geometry.formOverflow, `${currentCase}: creator form and footer fit the viewport`);
  assert.deepEqual(geometry.overflow, [], `${currentCase}: creator control rows fit their columns`);
  assert.deepEqual(geometry.unreachable, [], `${currentCase}: every creator control is reachable through scrolling`);
  assert.equal(geometry.coarseMirrors, true, `${currentCase}: coarse-pointer mirror targets retain 44px size`);
  const joins = await page.locator('.compass>div').evaluateAll(cells => cells.filter(cell => cell.querySelectorAll('button').length === 2).map(cell => {
    const [left, right] = cell.querySelectorAll('button'), l = left.getBoundingClientRect(), r = right.getBoundingClientRect(), a = getComputedStyle(left), b = getComputedStyle(right);
    return { seam: r.left - l.right, aligned: Math.abs(l.top - r.top) <= 1 && Math.abs(l.height - r.height) <= 1, inner: [a.borderTopRightRadius, a.borderBottomRightRadius, b.borderTopLeftRadius, b.borderBottomLeftRadius].every(value => parseFloat(value) === 0), outer: [a.borderTopLeftRadius, a.borderBottomLeftRadius, b.borderTopRightRadius, b.borderBottomRightRadius].every(value => parseFloat(value) > 0) };
  }));
  assert.equal(joins.length, 6);
  for (const join of joins) assert.ok(Math.abs(join.seam) <= 1 && join.aligned && join.inner && join.outer, `${currentCase}: mirror and facing form one flush outer-rounded group`);
  await creatorMaterials(page); await creatorSceneText(page);
}

try {
  for (const theme of ['obsidian', 'porcelain']) for (const [width, height] of viewports) {
    currentCase = `${theme} ${width}×${height}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: creatorOnly || width <= 760 });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/@vite/client') return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (url.origin === new URL(base).origin) return route.continue();
      external.push(url.href); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
    const snapshot = () => page.evaluate(() => window.prototype.snapshot());
    await page.goto(base); await page.waitForFunction(() => window.prototype?.ready);
    if ((await snapshot()).state.theme !== theme) { await click('more'); await click('theme:' + theme); }
    if (creatorOnly) {
      await click('create'); await checkCreator(page);
      cases.push({ theme, viewport: [width, height] }); await context.close(); continue;
    }
    await stageCenter(page, 'selection');
    if (width === 1469) for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width, height }]) {
      await page.setViewportSize(viewport); await stageCenter(page, 'selection');
    }
    const first = (await snapshot()).state.character, next = (first + 1) % 3;
    const rows = page.locator('.library [data-action^="character:"]');
    if (await rows.filter({ visible: true }).count()) {
      await click('character:' + next);
      assert.equal((await snapshot()).state.screen, 'selection', `${currentCase}: first click selects an unselected row`);
      assert.equal((await snapshot()).state.character, next);
      await click('character:' + next);
      assert.equal((await snapshot()).state.screen, 'studio', `${currentCase}: repeat click opens selected character`);
      await click('back');
      await click('character:' + next);
      assert.equal((await snapshot()).state.screen, 'studio', `${currentCase}: a single click on an already selected row opens it`);
      await click('back');
      const doubleClickTarget = ((await snapshot()).state.character + 1) % 3;
      await page.locator(`.library [data-action="character:${doubleClickTarget}"]`).dblclick();
      assert.equal((await snapshot()).state.screen, 'studio', `${currentCase}: a real double-click opens an unselected row`);
      assert.equal((await snapshot()).state.character, doubleClickTarget);
      await click('back');
    }
    const selected = (await snapshot()).state.character;
    await canvasCharacter(page, selected);
    assert.equal((await snapshot()).state.screen, 'studio', `${currentCase}: selected scene character opens customization`);
    await click('back');
    const other = ((await snapshot()).state.character + 1) % 3;
    await canvasCharacter(page, other);
    assert.equal((await snapshot()).state.screen, 'selection', `${currentCase}: first scene click selects another character`);
    assert.equal((await snapshot()).state.character, other);
    await canvasCharacter(page, other);
    assert.equal((await snapshot()).state.screen, 'studio', `${currentCase}: second scene click opens that character`);
    await click('play'); await stageCenter(page, 'studio');
    if (width === 1469) for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width, height }]) {
      await page.setViewportSize(viewport); await stageCenter(page, 'studio');
    }
    assert.deepEqual(await page.locator('.mode-tabs button').allTextContents().then(values => values.map(v => v.trim())), ['Wardrobe', 'Colors', 'Outfits', 'Moves'], `${currentCase}: panel order`);
    assert.equal((await page.locator('[data-action="slot:all"]').innerText()).trim(), 'More', `${currentCase}: additional-parts trigger uses the requested label`);
    await click('slot:all');
    await partsAnchored(page);
    assert.equal(await page.locator('.parts-popover small').innerText(), 'Additional equipment');
    assert.deepEqual(await page.locator('.parts-popover button').allTextContents().then(values => values.map(v => v.trim())), ['Back', 'Held item'], `${currentCase}: additional parts are not duplicated`);
    await page.locator('.wardrobe-scroll').evaluate(el => el.scrollTop = el.scrollHeight);
    await settle(page); await partsStayBounded(page);
    if (width === 844) {
      await page.setViewportSize({ width: 568, height: 320 }); await settle(page); await partsStayBounded(page);
      await page.setViewportSize({ width, height }); await settle(page); await partsStayBounded(page);
    }
    if (await page.locator('.parts-popover').count()) await page.keyboard.press('Escape');
    for (const slot of ['back', 'main_hand']) {
      await click('slot:all'); await click('slot:' + slot);
      assert.equal((await snapshot()).state.slot, slot, `${currentCase}: additional ${slot} choice remains reachable, including in a scrolled popup`);
      assert.equal(await page.locator('.parts-popover').count(), 0);
      assert.equal(await page.locator('[data-action="slot:all"]').getAttribute('aria-pressed'), 'true');
    }
    await click('slot:head');
    for (const panel of ['Wardrobe', 'Colors', 'Outfits', 'Moves']) {
      await click('panel:Wardrobe'); await click('slot:all'); await click('panel:' + panel);
      assert.equal(await page.locator('.popover').count(), 0, `${currentCase}: ${panel} panel activation dismisses parts popup`);
      assert.equal(await page.locator(`[data-action="panel:${panel}"]`).getAttribute('aria-pressed'), 'true');
    }
    await click('panel:Wardrobe'); await click('more');
    const github = await page.locator('.popover a[href*="github.com"]').evaluate(link => {
      const nodes = [...link.querySelectorAll('svg')], icons = nodes.map(el => el.getBoundingClientRect());
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT); let node, text;
      while (node = walker.nextNode()) if (node.textContent.trim() === 'GitHub') { const range = document.createRange(); range.selectNodeContents(node); text = range.getBoundingClientRect(); break; }
      const style = getComputedStyle(link), r = link.getBoundingClientRect();
      return { icons: icons.length, painted: nodes.every(el => { const box = el.getBBox(); return box.width > 0 && box.height > 0; }), ordered: icons.length === 2 && !!text && icons[0].right <= text.left + 1 && icons[1].left >= text.right - 1, rightAligned: icons.length === 2 && Math.abs(icons[1].right - (r.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth))) <= 1 };
    });
    assert.equal(github.icons, 2); assert.equal(github.ordered, true, `${currentCase}: GitHub identity icon is left of text and external arrow is right`);
    assert.equal(github.painted, true, `${currentCase}: both GitHub-row icons contain visible artwork`);
    assert.equal(github.rightAligned, true, `${currentCase}: external arrow aligns to the menu row's right content edge`);
    await page.keyboard.press('Escape');
    if (width <= 760 && height > width) {
      const tabs = await page.locator('.view-tabs').evaluate(nav => {
        const buttons = [...nav.querySelectorAll('button')], style = getComputedStyle(nav), context = document.createElement('canvas').getContext('2d');
        const bounds = buttons.map(el => el.getBoundingClientRect());
        return { left: bounds[0].left, identityLeft: document.querySelector('.identity').getBoundingClientRect().left, gaps: bounds.slice(1).map((r, i) => r.left - bounds[i].right), gap: parseFloat(style.columnGap) || 0, intrinsic: buttons.every(el => { const s = getComputedStyle(el); context.font = s.font; return el.getBoundingClientRect().width <= context.measureText(el.textContent.trim()).width + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth) + 2; }) };
      });
      assert.ok(Math.abs(tabs.left - tabs.identityLeft) <= 1 && tabs.intrinsic && tabs.gaps.every(gap => gap <= tabs.gap + 1), `${currentCase}: phone tabs remain intrinsic and grouped at the left content edge`);
      const promptGap = await page.evaluate(() => document.querySelector('.view-tabs').getBoundingClientRect().top - document.querySelector('.prompt-line').getBoundingClientRect().bottom);
      assert.ok(promptGap >= 8, `${currentCase}: phone view tabs have breathing room below the prompt (${promptGap}px)`);
    }
    for (const view of ['topdown', 'side']) { await click('view:' + view); await stageCenter(page, 'studio'); }
    await click('back'); await click('create');
    await checkCreator(page);
    cases.push({ theme, viewport: [width, height] }); await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const checks = creatorOnly ? ['Creator width thresholds 1350/1000/760 and short-height/min-width 540/541 branches', 'Creator title/name, control-row fit, scroll reachability, footer bounds and coarse mirror targets', 'Attached mirror/facing seams and creator control opacity/contrast', 'Creator heading/muted text contrast against actual screenshot backdrops at three scroll positions'] : ['Selected row repeat/real double-click and world-character activation', 'Actor, caption and playback share actual free-stage center, including resize', 'Panel order, additional parts and dismissal through all four panels', 'Intrinsic left-aligned phone tabs; GitHub identity icon and right-edge external arrow', 'Attached mirror/facing seams and creator control opacity/contrast', 'Creator heading/muted text contrast against actual screenshot backdrops at three scroll positions'];
  console.log(JSON.stringify({ result: 'passed', engine, mode: creatorOnly ? 'creator-boundaries' : 'full', cases: cases.length, minimumSceneTextContrast: Object.fromEntries(Object.entries(sceneTextMinimum).map(([role, value]) => [role, Number(value.toFixed(2))])), checks, errors, external }, null, 2));
} catch (error) { console.error('Failed case: ' + currentCase); throw error; }
finally { await browser.close(); }
