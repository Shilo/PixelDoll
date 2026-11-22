import { promptSuggestionDefaults, type SuggestionListKey } from './promptSuggestionDefaults.ts';

export interface PromptSuggestion {
	id: string;
	title: string;
	prompt: string;
	action?: string;
}

type Fields = Pick<PromptSuggestion, 'title' | 'prompt'>;
type Added = Omit<PromptSuggestion, 'action'>;
export interface StoredList {
	order?: string[];
	edits?: Record<string, Partial<Fields>>;
	added?: Added[];
	removed?: string[];
}

export type StoredSuggestions = Partial<Record<SuggestionListKey, StoredList>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === 'string');

function isStoredList(value: unknown): value is StoredList {
	return (
		isRecord(value) &&
		(value.order === undefined || isStringArray(value.order)) &&
		(value.removed === undefined || isStringArray(value.removed)) &&
		(value.edits === undefined ||
			(isRecord(value.edits) &&
				Object.values(value.edits).every(
					(edit) =>
						isRecord(edit) &&
						(edit.title === undefined || typeof edit.title === 'string') &&
						(edit.prompt === undefined || typeof edit.prompt === 'string')
				))) &&
		(value.added === undefined ||
			(Array.isArray(value.added) &&
				value.added.every(
					(entry) =>
						isRecord(entry) &&
						typeof entry.id === 'string' &&
						entry.id.startsWith('u_') &&
						typeof entry.title === 'string' &&
						typeof entry.prompt === 'string' &&
						!!entry.prompt.trim()
				) &&
				new Set(value.added.map((entry: Added) => entry.id)).size === value.added.length))
	);
}

export function parseSuggestionStorage(raw: string | null): StoredSuggestions | null {
	if (raw === null) return {};
	try {
		const value: unknown = JSON.parse(raw);
		if (
			isRecord(value) &&
			Object.entries(value).every(
				([key, list]) => !Object.hasOwn(promptSuggestionDefaults, key) || isStoredList(list)
			)
		)
			return value;
	} catch {
		return null;
	}
	return null;
}

export function effectiveSuggestions(
	defaults: readonly PromptSuggestion[],
	list?: StoredList
): PromptSuggestion[] {
	const builtIn = defaults
		.filter(({ id }) => !list?.removed?.includes(id))
		.map((entry) => {
			const edit = list?.edits?.[entry.id];
			// Empty means the default, even when storage holds an empty field it never writes itself.
			return {
				...entry,
				title: edit?.title?.trim() || entry.title,
				prompt: edit?.prompt?.trim() || entry.prompt
			};
		});
	const added = (list?.added ?? []).map(({ id, title, prompt }) => ({
		id,
		prompt,
		title: title || prompt.split(/\s+/).slice(0, 4).join(' ')
	}));
	if (!list?.order) return [...builtIn, ...added];

	const byId = new Map([...builtIn, ...added].map((entry) => [entry.id, entry]));
	const ordered = [...new Set(list.order)].flatMap((id) => byId.get(id) ?? []);
	let predecessor: PromptSuggestion | undefined;
	for (const entry of builtIn) {
		if (!ordered.includes(entry))
			ordered.splice(predecessor ? ordered.indexOf(predecessor) + 1 : 0, 0, entry);
		predecessor = entry;
	}
	return [...ordered, ...added.filter((entry) => !ordered.includes(entry))];
}

export function editSuggestion(
	list: StoredList,
	defaults: readonly PromptSuggestion[],
	id: string,
	field: keyof Fields,
	value: string
): StoredList {
	const trimmed = value.trim();
	const builtIn = defaults.find((entry) => entry.id === id);
	if (!builtIn) {
		if ((!trimmed && field === 'prompt') || !list.added?.some((entry) => entry.id === id))
			return list;
		return {
			...list,
			added: list.added.map((entry) => (entry.id === id ? { ...entry, [field]: trimmed } : entry))
		};
	}
	const edits = { ...list.edits };
	const edit = { ...edits[id] };
	if (!trimmed || trimmed === builtIn[field]) delete edit[field];
	else edit[field] = trimmed;
	if (Object.keys(edit).length) edits[id] = edit;
	else delete edits[id];
	return { ...list, edits };
}

export function addSuggestion(list: StoredList, entry: Added): StoredList {
	const prompt = entry.prompt.trim();
	return prompt
		? { ...list, added: [...(list.added ?? []), { ...entry, title: entry.title.trim(), prompt }] }
		: list;
}

export function deleteSuggestion(
	list: StoredList,
	defaults: readonly PromptSuggestion[],
	id: string
): StoredList {
	const edits = { ...list.edits };
	delete edits[id];
	return {
		...list,
		edits,
		order: list.order?.filter((entry) => entry !== id),
		added: list.added?.filter((entry) => entry.id !== id),
		removed: defaults.some((entry) => entry.id === id)
			? [...new Set([...(list.removed ?? []), id])]
			: list.removed
	};
}

export function saveSuggestionList(
	stored: StoredSuggestions,
	key: SuggestionListKey,
	list: StoredList
): StoredSuggestions {
	const next = { ...stored };
	const sparse: StoredList = {};
	if (list.order?.length) sparse.order = list.order;
	if (list.edits && Object.keys(list.edits).length) sparse.edits = list.edits;
	if (list.added?.length) sparse.added = list.added;
	if (list.removed?.length) sparse.removed = list.removed;
	if (Object.keys(sparse).length) next[key] = sparse;
	else delete next[key];
	return next;
}
