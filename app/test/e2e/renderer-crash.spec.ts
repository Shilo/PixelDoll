import { test, expect } from '@playwright/test'
import { nativeCrashTrace, retainedFitFollower, retainedFitStage, queueOwner } from './retained-equipment.ts'

test.use({ trace: { ...nativeCrashTrace } })

test('a follower recovers retained equipment work after an abrupt renderer crash without cleanup', async ({ page, context }) => {
  const requests: string[] = []
  await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
  await context.route('https://*.pixellab.ai/**', async route => { requests.push(route.request().method()); await route.abort() })
  const follower = await retainedFitFollower(page, context)
  await page.evaluate(() => addEventListener('pagehide', () => localStorage.setItem('crash-test:pagehide', 'yes')))
  const previousOwner = await queueOwner(follower)
  expect(previousOwner).toBeTruthy()
  expect(await retainedFitStage(follower)).toBe('rest-running')
  const cdp = await context.newCDPSession(page)
  const crashed = page.waitForEvent('crash')
  let crashError: Error | undefined
  void cdp.send('Page.crash').catch((error: Error) => { crashError = error })
  await crashed
  // Page.crash can leave its protocol call pending; the crash event is the success signal.
  // A renderer crash cannot run our pagehide release. The browser must release its dead client's Web Lock.
  expect(await follower.evaluate(() => localStorage.getItem('crash-test:pagehide'))).toBeNull()
  await expect.poll(() => retainedFitStage(follower), { timeout: 15_000 }).toBe('needs-attention')
  const currentOwner = await queueOwner(follower)
  expect(currentOwner).toBeTruthy(); expect(currentOwner).not.toBe(previousOwner)
  if (crashError) expect(crashError.message).toMatch(/crash|closed|detached/i)
  expect(requests).toEqual([])
})
