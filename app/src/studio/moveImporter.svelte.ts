// The Import page of New move and New State: reads a PixelDoll character ZIP (a move's Download ZIP, a backup, or a friend's
// character) and brings its moves and States into the open character. Same body: free, frames and matching items as they
// are. Another body: a move's motion can redraw this character, paid like Add a move (lib/rig/moveImport.ts). The sheet
// holds it, so its review survives paging back to the form and returning.
import { LocalizedError, errorMessage, message, type Message } from '../lib/message.ts';
import { lazy } from '../lib/lazy.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import type { Img } from '../lib/image/png.ts';
import type { MoveImportPlan, MoveImportRow } from '../lib/rig/moveImport.ts';
import type { RigAnimation } from '../lib/store/manifest.ts';
import { clipNameId } from './clipName.ts';
import { moveLabel } from './model.ts';
import { displayMove } from './displayMove.ts';
import { stateAttempts } from './stateRecovery.ts';
import { formatList } from './displayDirectionProblem.ts';
import { fileDrop } from './fileDrop.ts';
import { readZipFiles } from './zipImport.ts';
import {
	doc,
	flushSave,
	importMoves,
	moveImportBlocked,
	pendingMoves,
	store,
	toast,
	ui
} from './state.svelte.ts';

export const importableMove = (row: MoveImportRow) => row.action === 'add' || row.action === 'copy';

export class MoveImporter {
	busy = $state(false);
	dragging = $state(false);
	error = $state<string | Message>('');
	cause = $state<unknown>();
	review = $state.raw<{
		projectId: string;
		rec: StoredProject;
		plan: MoveImportPlan;
		clips: readonly RigAnimation[];
		frames: Map<string, Img>;
	}>();
	chosen = $state<string[]>([]);
	readonly blocked = $derived(this.review ? moveImportBlocked(this.review.projectId) : '');
	readonly rows = $derived(this.review?.plan.rows ?? []);
	readonly ready = $derived(!!this.review && this.rows.some(importableMove));
	/** The sheet closed: late results are dropped. */
	gone = false;
	readonly drop = fileDrop(
		() => this.busy,
		(active) => (this.dragging = active),
		(files) => void this.read(files)
	);

	private fail(e: unknown) {
		this.error = errorMessage(e);
		this.cause = e instanceof LocalizedError ? undefined : e;
	}
	async read(files: readonly File[]) {
		if (this.busy) return;
		this.error = '';
		this.cause = undefined;
		this.busy = true;
		try {
			const projectId = doc.id;
			const imported = await readZipFiles(files);
			const { planMoveImport } = await lazy(() => import('../lib/rig/moveImport.ts'));
			await flushSave();
			const { rec, project } = await loadProject(projectId);
			const plan = await planMoveImport({ record: rec, images: project.images }, imported, {
				label: moveLabel,
				idOf: clipNameId,
				taken: [
					...Object.keys(rec.moveReviews ?? {}),
					...stateAttempts(rec).map((attempt) => attempt.id),
					...pendingMoves(projectId).map((spec) => spec.id)
				]
			});
			if (this.gone) return;
			const m = imported.project.manifest,
				base = m.items.find((item) => item.id === m.rig.baseItem),
				dir = m.rig.directions.find((d) => !d.mirrorOf)?.id;
			const frames = new Map<string, Img>();
			for (const row of plan.rows) {
				const hash = dir && base?.layers[0]?.cells?.[row.id]?.[dir]?.find(Boolean);
				const image = hash && imported.project.images.get(hash);
				if (image) frames.set(row.id, image);
			}
			this.review = { projectId, rec, plan, clips: m.rig.animations, frames };
			this.chosen = plan.rows.filter(importableMove).map((row) => row.id);
		} catch (e) {
			if (!this.gone) this.fail(e);
		} finally {
			if (!this.gone) this.busy = false;
		}
	}
	toggle(id: string, on: boolean) {
		this.chosen = on ? [...this.chosen, id] : this.chosen.filter((entry) => entry !== id);
	}
	async save() {
		const review = this.review;
		if (!review || !this.chosen.length || this.busy || this.blocked) return;
		this.busy = true;
		this.error = '';
		try {
			const added = await importMoves(review.projectId, review.plan, this.chosen, review.rec);
			const clips = store.project?.manifest.rig.animations ?? [];
			toast(
				message('moveImport.imported', {
					names: formatList(added.map((entry) => displayMove(entry.id, clips)))
				}),
				{ tone: 'success' }
			);
			if (added[0]) ui.anim = added[0].id;
			ui.sheet = null;
		} catch (e) {
			if (!this.gone) this.fail(e);
		} finally {
			if (!this.gone) this.busy = false;
		}
	}
}
