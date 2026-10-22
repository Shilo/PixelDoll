import { expect, test } from '@playwright/test'
import { browserSelfTests } from '../../src/lib/selftests.ts'

test('browser PNG and IndexedDB self-tests preserve every registered check', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'))
  await page.route('https://api.pixellab.ai/**', (route) => route.abort())
  await page.goto('/#/selftest')
  const result = page.getByTestId('selftest')
  await expect(result).toHaveAttribute('data-failures', '0')
  const lines = (await result.innerText()).split('\n')
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
