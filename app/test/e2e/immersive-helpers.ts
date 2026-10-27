import { expect, type Locator, type Page } from '@playwright/test'

/** A disabled control looks the same hovered as at rest and shows the not-allowed cursor. */
export async function noDisabledHover(page: Page, locator: Locator) {
  const surface = () => locator.evaluate(element => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, border: style.borderColor, color: style.color, cursor: style.cursor }
  })
  await page.mouse.move(0, 0)
  const resting = await surface()
  await locator.hover()
  expect(await surface()).toEqual(resting)
  expect(resting.cursor).toBe('not-allowed')
}

/** Enter through Characters and open Head, which the former all-category sidebar always exposed. */
export async function enterStudio(page: Page) {
  // First load opens IndexedDB and fixtures; under a busy full suite this can exceed the default 5s.
  await expect(page.locator('.customize-action, .experience-stage')).toBeVisible({ timeout: 20_000 })
  const customize = page.locator('.customize-action')
  if (await customize.count()) await customize.click()
  await expect(page.locator('.experience-stage')).toBeVisible()
  await equipmentGroup(page, 'Head')
}

export async function openStudio(page: Page, url: string, options?: Parameters<Page['goto']>[1]) {
  const response = await page.goto(url, options)
  await enterStudio(page)
  return response
}

export async function reloadStudio(page: Page, options?: Parameters<Page['reload']>[0]) {
  const response = await page.reload(options)
  await enterStudio(page)
  return response
}

export async function equipmentMode(page: Page, name: 'Wardrobe' | 'Colors' | 'Outfits' | 'Moves') {
  const inspect = page.getByRole('dialog', { name: 'Inspect character', exact: true })
  if (await inspect.count()) await inspect.getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('.equipment-modes').getByRole('button', { name, exact: true }).click()
}

export async function equipmentGroup(page: Page, name: string) {
  await equipmentMode(page, 'Wardrobe')
  if (['Head', 'Hair', 'Body'].includes(name)) await page.getByRole('tab', { name: new RegExp(`^${name}\\b`) }).click()
  else {
    await page.locator('.slot-chips').getByRole('button', { name: 'More', exact: true }).click()
    await page.locator('#more-equipment').getByRole('button', { name: name === 'Hands' ? 'Held item' : name, exact: true }).click()
  }
}

export async function newItem(page: Page, group = 'Head') {
  await equipmentGroup(page, group)
  await page.getByRole('button', { name: `New ${group === 'Hands' ? 'held' : group.toLowerCase()} item`, exact: true }).click()
}

export async function selectedItemDetails(page: Page) {
  const existing = page.getByRole('dialog').filter({ has: page.locator('.insp-body') })
  if (await existing.count()) return existing
  await equipmentMode(page, 'Wardrobe')
  // Fixture-driven tests may select a real item in a different category. Reach
  // that selection through the same category controls available to a person;
  // every category shows its equipped item's row, so look for the selected tile first.
  for (const target of ['.equipment-scroll .tile.sel', '.equipment-scroll .sel-row']) {
    for (const group of ['Head', 'Hair', 'Body', 'Face', 'Legs', 'Feet', 'Back', 'Hands']) {
      if (await page.locator(target).count()) break
      await equipmentGroup(page, group)
    }
    if (await page.locator(target).count()) break
  }
  await page.locator('.equipment-scroll .sel-row').getByRole('button', { name: / details$/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.insp-body')).toBeVisible()
  return dialog
}

export async function pickItem(page: Page, name: string) {
  await equipmentMode(page, 'Wardrobe')
  const item = page.locator('.equipment-scroll .tile').getByText(name, { exact: true })
  for (const group of ['Head', 'Hair', 'Body', 'Face', 'Legs', 'Feet', 'Back', 'Hands']) {
    if (await item.count()) break
    await equipmentGroup(page, group)
  }
  // Tapping a worn tile takes the item off, so tap it again to leave it worn and selected
  const worn = await page.locator('.equipment-scroll .tile[aria-pressed="true"]').filter({ has: page.getByText(name, { exact: true }) }).count()
  await item.click()
  if (worn) await item.click()
}

export async function inspectStage(page: Page) {
  if (await page.getByRole('dialog', { name: 'Inspect character', exact: true }).count()) return
  await page.getByRole('button', { name: 'Inspect', exact: true }).click()
  await expect(page.locator('.inspection-stage .stage')).toBeVisible()
}

export async function openAccount(page: Page) {
  await page.getByRole('button', { name: 'More options', exact: true }).click()
  await page.locator('#experience-options').getByRole('button', { name: /^(Connect PixelLab|PixelLab account|Key not accepted)$/ }).click()
}
