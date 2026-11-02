import { expect, type Page, type BrowserContext } from '@playwright/test'
import { openStudio } from './immersive-helpers.ts'

// Live screencasting reproduced native profile-lock failures in the forced-crash controls on Windows.
export const nativeCrashTrace = { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true } as const

export async function retainRunningFit(page: Page) {
  await page.evaluate(async () => {
    const request = indexedDB.open('pixeldoll', 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const transaction = database.transaction('projects', 'readwrite')
    transaction.objectStore('projects').put({ kind: 'equipment-fit-draft', id: 'equipment-fit:takeover', format: 'pixeldoll-fit/1', name: 'Leader takeover fit', targetId: 'rig-takeover', targetProjectId: 'rig-takeover', stage: 'rest-running', plan: {}, error: '', updatedAt: new Date().toISOString(), spentGens: 0, previewGens: 2, poseGens: 0, budget: { previewGens: 2, poseGens: 0 }, calls: [] }, 'equipment-fit:takeover')
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(transaction.error) })
    database.close()
  })
}

export async function retainedFitStage(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const request = indexedDB.open('pixeldoll', 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const read = database.transaction('projects').objectStore('projects').get('equipment-fit:takeover')
    const result = await new Promise<{ stage: string }>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) })
    database.close(); return result.stage
  })
}

export async function retainedFitFollower(page: Page, context: BrowserContext): Promise<Page> {
  await openStudio(page, '/')
  await expect(page.locator('.world-actors').first()).toBeVisible()
  await retainRunningFit(page)
  const follower = await context.newPage()
  // Measure takeover after its required pipeline has loaded, independently of cold preview-server downloads.
  const fitResponse = follower.waitForResponse(response => /\/assets\/fit-[^/]+\.js$/.test(new URL(response.url()).pathname))
  await openStudio(follower, '/')
  const fit = await fitResponse
  expect(fit.ok(), `Fit pipeline request failed: ${fit.status()} ${fit.url()}`).toBe(true)
  await follower.evaluate(url => import(url).then(() => undefined), fit.url())
  await follower.getByRole('button', {name:'More options',exact:true}).click()
  await expect(follower.locator('#experience-options')).toContainText('Other tab')
  await follower.keyboard.press('Escape')
  return follower
}

export async function queueOwner(page: Page): Promise<string | undefined> {
  return page.evaluate(async () => (await navigator.locks.query()).held?.find(lock => lock.name === 'pixeldoll-queue')?.clientId)
}
