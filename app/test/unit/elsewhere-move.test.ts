import { describe, expect, it } from 'vitest';
import { mirroredMove } from '../../src/studio/elsewhereMove.ts';
import { REQUEST_TEXT } from '../../src/lib/store/db.ts';

describe('mirroredMove', () => {
	const spec = { id: 'spin', frames: 4, items: [], seed: 1 };
	const queued = { projectId: 'fixture:s2', spec: { id: 'idle', frames: 4, items: [], seed: 2 } };

	it('mirrors the move another tab is running and the moves queued behind it', () => {
		expect(
			mirroredMove({
				projectId: 'fixture:s2',
				spec,
				status: 'running',
				requestText: REQUEST_TEXT,
				queued: [queued]
			})
		).toEqual({ projectId: 'fixture:s2', spec, progress: null, queued: [queued] });
	});

	it('has nothing to show once the record finishes, stops or cannot be read', () => {
		expect(mirroredMove(undefined)).toBeNull();
		expect(
			mirroredMove({ projectId: 'fixture:s2', spec, status: 'failed', requestText: REQUEST_TEXT })
		).toBeNull();
		expect(
			mirroredMove({ projectId: 'fixture:s2', spec, status: 'review', requestText: REQUEST_TEXT })
		).toBeNull();
		expect(
			mirroredMove({ projectId: 'fixture:s2', spec, status: 'running', requestText: 1 })
		).toBeNull();
		expect(mirroredMove({ spec, status: 'running', requestText: REQUEST_TEXT })).toBeNull();
		expect(
			mirroredMove({ projectId: 'fixture:s2', status: 'running', requestText: REQUEST_TEXT })
		).toBeNull();
		expect(
			mirroredMove({
				projectId: 'fixture:s2',
				spec: { id: 'spin', frames: 4, seed: 1 },
				status: 'running',
				requestText: REQUEST_TEXT
			})
		).toBeNull();
	});

	it('drops queue entries that cannot name a move', () => {
		expect(
			mirroredMove({
				projectId: 'fixture:s2',
				spec,
				status: 'running',
				requestText: REQUEST_TEXT,
				queued: [
					queued,
					null,
					{},
					{ projectId: '', spec },
					{ projectId: 'fixture:s2' },
					{ projectId: 'fixture:s2', spec: { id: 'jump' } }
				]
			})
		).toEqual({ projectId: 'fixture:s2', spec, progress: null, queued: [queued] });
	});
});
