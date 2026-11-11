import { expect, type Page, type BrowserContext } from '@playwright/test';
import { openStudio } from './immersive-helpers.ts';

// Live screencasting reproduced native profile-lock failures in the forced-crash controls on Windows.
export const nativeCrashTrace = {
	mode: 'retain-on-failure',
	screenshots: false,
	snapshots: true,
	sources: true
} as const;

/** Opens the Studio in `page` (the tab that runs the jobs) and in a second tab that waits behind it. */
export async function followerTab(page: Page, context: BrowserContext): Promise<Page> {
	await openStudio(page, '/');
	await expect(page.locator('.world-actors').first()).toBeVisible();
	const follower = await context.newPage();
	await openStudio(follower, '/');
	await follower.getByRole('button', { name: 'More options', exact: true }).click();
	await expect(follower.locator('#experience-options')).toContainText('Other tab');
	await follower.keyboard.press('Escape');
	return follower;
}

export async function queueOwner(page: Page): Promise<string | undefined> {
	return page.evaluate(
		async () =>
			(await navigator.locks.query()).held?.find((lock) => lock.name === 'pixeldoll-queue')
				?.clientId
	);
}
