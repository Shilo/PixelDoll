// The Import page of New item: reads a PixelDoll character ZIP (a backup, a Download ZIP or a friend's character) and offers
// its items as the wardrobe offers another saved character's: a free exact copy, re-fit or copy worn as drawn, or, for
// another body, making it new through the New item form. The ZIP is never stored: copies write the images they use.
import { LocalizedError, errorMessage, message, type Message } from '../lib/message.ts';
import { loadProject } from '../lib/store/project.ts';
import { listShared, type BundledSource, type SharedItem } from '../lib/equipment/shared.ts';
import { itemKey } from '../lib/equipment/copy.ts';
import type { Item } from '../lib/store/manifest.ts';
import { formatList } from './displayDirectionProblem.ts';
import { fileDrop } from './fileDrop.ts';
import { readZipFiles } from './zipImport.ts';
import { doc, flushSave, importItems, toast, ui } from './state.svelte.ts';

export class ItemImporter {
	busy = $state(false);
	dragging = $state(false);
	error = $state<string | Message>('');
	cause = $state<unknown>();
	review = $state.raw<{
		projectId: string;
		source: BundledSource;
		/** Free to import or to make new, best fit first. */
		entries: SharedItem[];
		/** The ZIP's items this character already has (same category and request). */
		present: Item[];
		/** Items whose images could not be read. */
		skipped: number;
		/** This character's items when read: names an import numbers past. */
		own: Item[];
	}>();
	/** Item ids (in the ZIP) to import. */
	chosen = $state<string[]>([]);
	readonly free = $derived(this.review?.entries.filter((entry) => entry.fit !== 'remake') ?? []);
	readonly ready = $derived(this.free.length > 0);
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
			const m = imported.project.manifest;
			await this.list(projectId, {
				id: `zip:${m.exportId ?? m.name}`,
				manifest: m,
				variants: m.presets[0]?.variants ?? {},
				images: imported.project.images
			});
		} catch (e) {
			if (!this.gone) this.fail(e);
		} finally {
			if (!this.gone) this.busy = false;
		}
	}
	/** Lists `source` against the character as saved now, choosing every free item. */
	private async list(projectId: string, source: BundledSource) {
		await flushSave();
		const { rec, project } = await loadProject(projectId);
		const m = source.manifest;
		const listed = await listShared(projectId, rec.manifest, project.images, [source], {
			saved: false
		});
		if (this.gone) return;
		const own = new Set(
			rec.manifest.items
				.filter((it) => it.status === 'accepted')
				.map((it) => itemKey(it, projectId))
		);
		const present = m.items.filter(
			(item) =>
				item.status === 'accepted' &&
				item.id !== m.rig.baseItem &&
				item.slot !== 'body' &&
				!item.variantOf &&
				own.has(itemKey(item, source.id))
		);
		this.review = {
			projectId,
			source,
			entries: listed.items,
			present,
			skipped: listed.skipped,
			own: rec.manifest.items.filter((it) => it.slot !== 'body' && !it.variantOf)
		};
		this.chosen = this.free.map((entry) => entry.item.id);
	}
	toggle(id: string, on: boolean) {
		this.chosen = on ? [...this.chosen, id] : this.chosen.filter((entry) => entry !== id);
	}
	async save() {
		const review = this.review;
		if (!review || !this.chosen.length || this.busy) return;
		this.busy = true;
		this.error = '';
		this.cause = undefined;
		try {
			const entries = this.free.filter((entry) => this.chosen.includes(entry.item.id));
			const { added, skipped, failed, notes } = await importItems(
				review.projectId,
				review.source,
				entries
			);
			const notices: Message[] = [];
			if (added.length)
				notices.push(
					message('moveImport.imported', { names: formatList(added.map((item) => item.name)) })
				);
			if (skipped.length)
				notices.push(
					message('itemImport.notFitted', {
						names: formatList(skipped.map((entry) => entry.item.name))
					})
				);
			notices.push(...notes);
			if (notices.length)
				toast(notices, {
					tone:
						skipped.length || failed.length || added.some((it) => it.unfitted || it.refit)
							? 'warning'
							: 'success'
				});
			if (!skipped.length && !failed.length) {
				ui.sheet = null;
				return;
			}
			// Some stayed behind: the page shows what is here now, and why the first failure failed.
			if (this.gone) return;
			await this.list(review.projectId, review.source);
			const [first] = failed;
			if (first && !this.gone) {
				this.error = message('state.couldNotAddNameReason', {
					name: first.entry.item.name,
					reason: errorMessage(first.error)
				});
				this.cause = first.error instanceof LocalizedError ? undefined : first.error;
			}
		} catch (e) {
			if (!this.gone) this.fail(e);
		} finally {
			if (!this.gone) this.busy = false;
		}
	}
}
