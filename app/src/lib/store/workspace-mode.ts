export const workspaceCopy =
	typeof location !== 'undefined' && new URLSearchParams(location.search).has('workspace-copy');

export const COPY_GENERATION_OFF = 'PixelLab is off in workspace copies.';

export function workspaceUrl(copy: boolean): string {
	const url = new URL(location.href);
	url.hash = '';
	if (copy) url.searchParams.set('workspace-copy', '');
	else url.searchParams.delete('workspace-copy');
	return url.href;
}

export const workspaceKeys = {
	theme: 'pixeldoll.theme',
	welcomed: 'pixeldoll.welcomed',
	last: 'pixeldoll.studio.project'
};
export const copyPreferences = new Map<string, string>();
import type { WorkspaceArchive } from './workspace.ts';

export let workspaceInfo: Omit<WorkspaceArchive, 'projects' | 'blobs'> | undefined;
export const copyMissingArtwork = new Set<string>();

export function setWorkspaceInfo(info: NonNullable<typeof workspaceInfo>) {
	workspaceInfo = info;
	for (const hash of info.missing) copyMissingArtwork.add(`sha256:${hash}`);
	copyPreferences.set(workspaceKeys.welcomed, '1');
	copyPreferences.set(workspaceKeys.theme, info.view.theme);
	copyPreferences.set(workspaceKeys.last, info.view.project);
}
