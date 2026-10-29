import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { openStudio } from './immersive-helpers.ts'
import { nativeCrashTrace, retainRunningFit, retainedFitStage } from './retained-equipment.ts'

const execFileAsync = promisify(execFile)

test.use({ trace: { ...nativeCrashTrace } })

test('Export choices and retained equipment survive abrupt browser termination and restart', async ({}, info) => {
  const profile = await mkdtemp(join(tmpdir(), 'pd-crash-'))
  const requests: string[] = []
  const launch = async () => {
    // Exercise the full Chromium browser's persistent-profile implementation for the native crash check.
    const context = await chromium.launchPersistentContext(profile, { headless: true, channel: info.project.use.channel ?? 'chromium', baseURL: info.project.use.baseURL, viewport: { width: 800, height: 600 } })
    await context.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1') })
    await context.route('https://*.pixellab.ai/**', async route => { requests.push(route.request().method() + ' ' + new URL(route.request().url()).pathname); await route.abort() })
    return context
  }
  let context: BrowserContext | undefined
  try {
    context = await launch()
    const page = context.pages()[0]
    await openStudio(page, '/')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: 'Unity', exact: true }).check()
    await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
    await dialog.getByRole('checkbox', { name: 'Walk', exact: true }).check()
    const dressed = dialog.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })
    await expect(dressed).toBeEnabled(); await dressed.uncheck(); await expect(dressed).toBeEnabled()
    await dialog.getByRole('button', { name: 'Close export' }).click()
    await retainRunningFit(page)
    expect(await retainedFitStage(page)).toBe('rest-running')
    await page.evaluate(() => addEventListener('pagehide', () => localStorage.setItem('crash-test:pagehide', 'yes')))

    // Kill only this test's process tree. Parent-only termination can leave children holding the profile's files.
    const browser = context.browser()!
    const browserCdp = await browser.newBrowserCDPSession()
    const processes = await browserCdp.send('SystemInfo.getProcessInfo')
    const pid = processes.processInfo.find(p => p.type === 'browser')?.id
    expect(pid).toBeGreaterThan(0); expect(pid).not.toBe(process.pid)
    await info.attach('owned-browser-processes', { body: JSON.stringify(processes.processInfo.map(p => ({ pid: p.id, type: p.type }))), contentType: 'application/json' })
    const disconnected = new Promise<void>(resolve => browser.once('disconnected', () => resolve()))
    await test.step('Terminate the test browser process tree', async () => {
      if (process.platform === 'win32') await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
      else {
        // Playwright launches a detached process group on POSIX. Verify its ownership before terminating the group.
        const group = await execFileAsync('ps', ['-o', 'pgid=', '-p', String(pid)])
        expect(Number(group.stdout.trim())).toBe(pid)
        process.kill(-pid!, 'SIGKILL')
      }
    })
    await test.step('Wait for test browser disconnection', () => disconnected)
    await test.step('Wait for test browser processes to exit', () => expect.poll(() => processes.processInfo.filter(p => {
      try { process.kill(p.id, 0); return true }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error }
    }).map(p => ({ pid: p.id, type: p.type })), { timeout: 15_000, message: 'The test browser processes must exit before reopening their profile' }).toEqual([]))
    context = undefined

    context = await launch()
    const reopened = context.pages()[0]
    await openStudio(reopened, '/')
    await expect.poll(() => retainedFitStage(reopened), { timeout: 15_000 }).toBe('needs-attention')
    expect(await reopened.evaluate(() => localStorage.getItem('crash-test:pagehide'))).toBeNull()
    await reopened.getByRole('button', { name: 'Export', exact: true }).click()
    const settings = reopened.getByRole('dialog')
    await expect(settings.getByRole('radio', { name: 'Unity', exact: true })).toBeChecked()
    await expect(settings.locator('.export-summary dd')).toHaveText(['Walk', 'None'])
    await settings.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(settings.getByRole('checkbox', { name: 'Walk', exact: true })).toBeChecked()
    await expect(settings.getByRole('checkbox', { name: 'Cross punch', exact: true })).not.toBeChecked()
    await expect(settings.getByRole('checkbox', { name: 'Include dressed character sheets', exact: true })).not.toBeChecked()
    expect(requests).toEqual([])
  } finally {
    try { await context?.close() }
    // Windows can briefly keep chrome_debug.log locked after browser process termination.
    finally { await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) }
  }
})
