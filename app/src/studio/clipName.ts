import { LocalizedError } from '../lib/message.ts';

export function clipNameId(name: string) {
	return name
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function sameClipName(left: string, right: string) {
	return clipNameId(left) === clipNameId(right);
}

export function withClipWriteLock<Result>(
	projectId: string,
	id: string,
	work: () => Promise<Result>
) {
	const locks = globalThis.navigator?.locks;
	if (!locks) return work();
	const name = `pixeldoll-clip:${projectId}:${clipNameId(id)}`;
	return locks.request(name, { ifAvailable: true }, (lock) => {
		if (!lock)
			throw new LocalizedError(
				'Wait for the current generation to finish.',
				'directionsSheet.waitForGeneration'
			);
		return work();
	});
}
