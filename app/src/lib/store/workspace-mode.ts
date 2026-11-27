export const workspaceCopy =
	typeof location !== 'undefined' && new URLSearchParams(location.search).has('workspace-copy');

export function workspaceUrl(copy: boolean): string {
	const url = new URL(location.href);
	url.hash = '';
	url.searchParams.delete('workspace-copy');
	if (copy) url.search += `${url.search ? '&' : '?'}workspace-copy`;
	return url.href;
}

export const workspaceKeys = {
	theme: 'pixeldoll.theme',
	last: 'pixeldoll.studio.project'
};
export const copyPreferences = new Map<string, string>();
import type { CopyArchive } from './workspace.ts';

export let workspaceInfo: Omit<CopyArchive, 'projects' | 'blobs'> | undefined;
export const copyMissingArtwork = new Set<string>();

/** `project`: the character the copy opens on, the backup's first. */
export function setWorkspaceInfo(info: NonNullable<typeof workspaceInfo>, project: string) {
	workspaceInfo = info;
	for (const hash of info.missing) copyMissingArtwork.add(`sha256:${hash}`);
	copyPreferences.set(workspaceKeys.last, project);
}
