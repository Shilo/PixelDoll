// Ownership tripwire, paired with browser contracts; not a CSS correctness proof.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../../app/package.json', import.meta.url));
const { parse } = require('postcss');
const controls = /(?:\bbutton\b|\binput\b|\bselect\b|\btextarea\b|\.(?:bu-[\w-]+|primary|outline|item|none|swatch|character-row|popover|playback|dialog-panel|facing|mirror)(?![\w-]))/;
const material = /^(?:background(?:-.+)?|border(?:-(?:top|right|bottom|left|inline|block))?(?:-(?:color|style|width|radius))?|border-(?:top|bottom)-(?:left|right)-radius|outline(?:-.+)?|box-shadow|filter|backdrop-filter|-webkit-backdrop-filter)$/;
const allowed = new Map([
  // These are scene/modal composition, not component appearance overrides.
  ['#dialog.bronze-dialog-overlay', new Set(['background','border','border-radius'])],
  ['#dialog.bronze-dialog-overlay::backdrop', new Set(['background'])],
]);
export function checkOwnership(css, file = 'fixture') {
  const violations = [];
  parse(css).walkRules(rule => {
    if (!controls.test(rule.selector) && !/\[aria-(?:pressed|selected)/.test(rule.selector)) return;
    rule.walkDecls(decl => {
      const state = /:(?:hover|focus|active|disabled)|\[aria-(?:pressed|selected)/.test(rule.selector);
      if ((material.test(decl.prop) || (state && ['color','font-weight','opacity'].includes(decl.prop))) && !allowed.get(rule.selector)?.has(decl.prop)) violations.push(`${rule.selector}: ${decl.prop}`);
    });
  });
  assert.deepEqual(violations, [], `${file}: shared appearance must be fixed in Bronze UI`);
}
for (const file of ['styles.css','creator.css','bronze-theme.css']) checkOwnership(await readFile(new URL(file, import.meta.url), 'utf8'), file);
for (const regression of ['.item:hover{background:var(--bu-hover)}','@media(max-width:600px){.compass button{border:1px solid red}}','.bu-input:focus-visible{outline:0}','.swatch[aria-pressed=true]{opacity:.2}','.editor-tabs [aria-pressed=true]{border-bottom:2px solid var(--bu-accent)}']) assert.throws(() => checkOwnership(regression));
console.log('Theme ownership passed: component materials/states stay in Bronze UI; host geometry stays local.');
