// Keyless prototype checks for control affordance, paint order and intermediate layouts.
import { chromium, webkit } from '../../../../app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const base = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5202';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Only the isolated local prototype is supported');
const viewports = [[320, 500], [320, 568], [390, 844], [450, 800], [568, 320], [760, 800], [844, 390], [1100, 800], [1101, 800], [1175, 711], [1280, 800], [1469, 889], [1920, 1080]];
const engine = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
const results = [], errors = [], external = [];
let currentCase = '';

async function boundedChoices(page, selector, label) {
  const choices = await page.locator(selector).evaluateAll(elements => elements.filter(el => el.checkVisibility()).map(el => {
    const style = getComputedStyle(el), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    context.fillStyle = style.borderTopColor; context.fillRect(0, 0, 1, 1);
    return { text: el.textContent.trim(), border: parseFloat(style.borderTopWidth), style: style.borderTopStyle, alpha: context.getImageData(0, 0, 1, 1).data[3] };
  }));
  assert.ok(choices.length > 0, `${label}: controls exist`);
  for (const choice of choices) assert.ok(choice.border >= 1 && !['none', 'hidden'].includes(choice.style) && choice.alpha >= 32, `${label}: ${choice.text} has a visible resting boundary`);
}

async function nativeOptions(page, theme, label) {
  const options = await page.locator('select option').evaluateAll(elements => elements.map(el => {
    const style = getComputedStyle(el), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
    const foreground = rgba(style.color), background = rgba(style.backgroundColor);
    const luminance = color => color.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    return { alpha: background[3], contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), scheme: style.colorScheme };
  }));
  assert.ok(options.length > 0);
  for (const option of options) {
    assert.equal(option.alpha, 255, `${label}: native option has an explicit opaque backing`);
    assert.ok(option.contrast >= 4.5, `${label}: native option text contrast is at least 4.5:1`);
    assert.equal(option.scheme, theme === 'obsidian' ? 'dark' : 'light');
  }
}

try {
  for (const theme of ['obsidian', 'porcelain']) for (const [width, height] of viewports) {
    currentCase = `${theme} ${width}×${height}`;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width <= 760 });
    await context.route('**/*', route => {
      // Unrelated gallery/document edits must not reload a browser mid-interaction.
      if (new URL(route.request().url()).pathname === '/@vite/client') return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
    await page.goto(base); await page.waitForFunction(() => window.prototype?.ready);
    if (await page.evaluate(() => window.prototype.snapshot().state.theme) !== theme) { await click('more'); await click('theme:' + theme); }
    await click('create');
    const titleAndName = await page.evaluate(() => {
      const title = document.querySelector('.draft-header h1').getBoundingClientRect(), name = document.querySelector('.draft-name').getBoundingClientRect();
      return { horizontal: Math.min(title.right, name.right) - Math.max(title.left, name.left), vertical: Math.min(title.bottom, name.bottom) - Math.max(title.top, name.top) };
    });
    assert.ok(titleAndName.horizontal <= 0 || titleAndName.vertical <= 0, `${theme} ${width}×${height}: creator title and name do not intersect`);
    const creatorTargets = await page.evaluate(() => {
      const footer = document.querySelector('.create-footer'), action = footer.querySelector('button.primary');
      const style = getComputedStyle(footer), available = footer.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return {
        actionWidth: action.getBoundingClientRect().width, available,
        coarse: matchMedia('(pointer:coarse)').matches,
        mirrors: [...document.querySelectorAll('.compass .mirror')].map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; }),
        overflowingCompassCells: [...document.querySelectorAll('.compass>div')].filter(el => el.scrollWidth > el.clientWidth + 1).length,
      };
    });
    if (width <= 760 && height > width) assert.ok(Math.abs(creatorTargets.actionWidth - creatorTargets.available) <= 1, `${currentCase}: portrait Create action fills the footer width`);
    if (creatorTargets.coarse) {
      assert.equal(creatorTargets.mirrors.length, 6);
      for (const mirror of creatorTargets.mirrors) assert.ok(mirror.width >= 44 && mirror.height >= 44, `${currentCase}: coarse-pointer mirror target remains at least 44px`);
      assert.equal(creatorTargets.overflowingCompassCells, 0, `${currentCase}: enlarged mirror targets fit their compass cells`);
    }
    const fields = await page.locator('.creator input,.creator textarea,.creator select,.draft-name input').evaluateAll(elements => elements.map(el => ({ key: el.dataset.draft, font: parseFloat(getComputedStyle(el).fontSize), scheme: getComputedStyle(el).colorScheme })));
    for (const field of fields) {
      assert.ok(field.font >= 15 && field.font <= 16, `${theme} ${width}×${height}: ${field.key} uses readable, restrained field text`);
      assert.equal(field.scheme, theme === 'obsidian' ? 'dark' : 'light', `${field.key}: native control scheme`);
    }
    await nativeOptions(page, theme, `${theme} creator`);
    const unreachable = await page.locator('.creator').evaluate(form => {
      const failures = [];
      for (const control of form.querySelectorAll('button:not(:disabled),input,textarea,select')) {
        if (!control.checkVisibility()) continue;
        control.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = control.getBoundingClientRect(), f = form.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (r.left < f.left - 2 || r.right > f.right + 2 || !control.contains(hit)) failures.push(control.dataset.action || control.dataset.draft || control.ariaLabel);
      }
      const r = form.getBoundingClientRect(), footer = document.querySelector('.create-footer').getBoundingClientRect();
      if (form.scrollWidth > form.clientWidth + 1 || r.bottom > footer.top + 1) failures.push('form overflow/footer intersection');
      return failures;
    });
    assert.deepEqual(unreachable, [], `${theme} ${width}×${height}: every creator control remains reachable through its scroll surface`);
    for (const editor of ['Prompt', 'Appearance']) {
      await click('editor:' + editor);
      const indicator = await page.locator('.editor-tabs [aria-pressed=true]').evaluate(el => ({ width: parseFloat(getComputedStyle(el).borderBottomWidth), style: getComputedStyle(el).borderBottomStyle }));
      assert.ok(indicator.width >= 1 && indicator.style !== 'none', `${theme}: selected ${editor} editor has a visible indicator`);
    }
    await click('back'); await click('customize'); await click('play');
    const animation = page.locator('[data-field=clip]');
    if (await animation.evaluate(el => getComputedStyle(el).appearance === 'base-select')) {
      const openPicker = () => width <= 760 ? animation.tap() : animation.click();
      await openPicker();
      assert.equal(await animation.evaluate(el => el.matches(':open')), true, `${currentCase}: native animation picker opens`);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.prototype.snapshot().state.screen), 'studio', `${currentCase}: picker Escape preserves the screen`);
      assert.equal(await animation.evaluate(el => document.activeElement === el), true, `${currentCase}: picker Escape returns select focus`);
      await openPicker();
      const option = page.locator('option[value="cross-punch"]');
      if (width <= 760) await option.tap(); else await option.click();
      await page.waitForFunction(() => window.prototype.snapshot().state.clip === 'cross-punch');
      assert.equal(await animation.inputValue(), 'cross-punch', `${currentCase}: clicking an option emits the native change`);
      assert.equal(await animation.evaluate(el => document.activeElement === el), true, `${currentCase}: selection retains select focus`);
      const fits = await animation.evaluate(el => {
        const style = getComputedStyle(el), icon = getComputedStyle(el, '::picker-icon'), context = document.createElement('canvas').getContext('2d'); context.font = style.font;
        const arrow = parseFloat(icon.width) || 20, gap = parseFloat(style.columnGap) || 0;
        return context.measureText(el.selectedOptions[0].textContent.trim()).width <= el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - arrow - gap;
      });
      assert.ok(fits, `${currentCase}: selected animation label fits beside its picker arrow`);
      await animation.selectOption('walk');
    }
    const playbackBounds = await page.locator('.playback').evaluate(el => {
      const r = el.getBoundingClientRect();
      const obscured = [...el.querySelectorAll('button,select')].filter(control => {
        const b = control.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return b.left < 0 || b.right > innerWidth + 1 || !control.contains(hit);
      }).map(control => control.dataset.action || control.ariaLabel);
      return { inside: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, overflow: el.scrollWidth > el.clientWidth + 1, obscured };
    });
    assert.equal(playbackBounds.inside, true, `${currentCase}: playback stays within the viewport`);
    assert.equal(playbackBounds.overflow, false, `${currentCase}: playback controls fit their surface`);
    assert.deepEqual(playbackBounds.obscured, [], `${currentCase}: every playback control has a reachable centre`);
    for (const action of ['more', 'characters', 'description', 'slot:all']) {
      await click(action);
      const bounds = await page.locator('.popover').evaluate(el => {
        const r = el.getBoundingClientRect(), identity = document.querySelector('.identity').getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, identityLeft: identity.left };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= width + 1 && bounds.top >= 0 && bounds.bottom <= height + 1, `${currentCase}: ${action} popup is inside the viewport`);
      if (['characters', 'description'].includes(action)) assert.ok(Math.abs(bounds.left - bounds.identityLeft) <= 1, `${currentCase}: ${action} popup retains its identity anchor`);
      await page.keyboard.press('Escape');
    }
    for (const view of ['preview', 'topdown', 'side']) {
      await click('view:' + view);
      await boundedChoices(page, '.item,.none', `${theme} ${width}×${height} ${view} equipment`);
      await click('slot:all');
      const stacking = await page.evaluate(() => {
        const menu = document.querySelector('.popover'), m = menu.getBoundingClientRect();
        const samples = [...document.querySelectorAll('.item span')].flatMap(label => {
          const r = label.getBoundingClientRect(), left = Math.max(m.left, r.left), right = Math.min(m.right, r.right), top = Math.max(m.top, r.top), bottom = Math.min(m.bottom, r.bottom);
          if (right <= left || bottom <= top || !label.checkVisibility()) return [];
          return [{ label: label.textContent.trim(), menuWins: menu.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)) }];
        });
        return { z: Number(getComputedStyle(menu).zIndex), samples };
      });
      assert.ok(stacking.z > 1, `${theme} ${width}×${height} ${view}: menu is above elevated equipment labels`);
      for (const sample of stacking.samples) assert.ok(sample.menuWins, `${theme} ${width}×${height} ${view}: parts menu wins the hit test over ${sample.label}`);
      await page.keyboard.press('Escape');
    }
    await click('view:preview'); await click('panel:Moves');
    await boundedChoices(page, '.wardrobe .character-list button', `${theme} ${width}×${height} moves`);
    await click('panel:Outfits'); await boundedChoices(page, '.wardrobe .character-list button', `${theme} ${width}×${height} outfits`);
    await click('panel:Colours'); assert.equal(await page.locator('.wardrobe h2').innerText(), 'Equipment colours');
    await nativeOptions(page, theme, `${theme} playback`);
    results.push({ theme, viewport: [width, height], result: 'passed' }); await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log(JSON.stringify({ result: 'passed', engine, cases: results.length, checks: ['Creator title/name separation including intermediate widths and 125% equivalent viewport', 'Portrait Create action fills its footer; coarse-pointer mirrors retain 44px targets without overflow', 'Creator field typography, native schemes, selected editor indicators and every control reachable by scrolling', 'Equipment, None, Moves and Outfits resting boundaries', 'Popup bounds/identity anchors; parts stacking and overlap hit tests in all three scene views', 'Opaque native option backing and >=4.5:1 contrast; supported native picker click/tap, selection, Escape, focus and label fit'], errors, external }, null, 2));
} catch (error) { console.error(`Failed case: ${currentCase}`); throw error; }
finally { await browser.close(); }
