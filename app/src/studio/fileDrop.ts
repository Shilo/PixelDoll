const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

export function preventFileNavigation(event: DragEvent) {
	if (!hasFiles(event)) return;
	event.preventDefault();
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
}

export function fileDrop(
	blocked: () => boolean,
	state: (dragging: boolean) => void,
	receive: (files: File[]) => void
) {
	let depth = 0;
	const reset = () => {
		depth = 0;
		state(false);
	};
	const handle = (event: DragEvent) => {
		if (!hasFiles(event)) return false;
		event.preventDefault();
		event.stopPropagation();
		return true;
	};
	return {
		reset,
		enter(event: DragEvent) {
			if (!handle(event)) return;
			depth++;
			state(!blocked());
		},
		leave(event: DragEvent) {
			if (!hasFiles(event)) return;
			depth = Math.max(0, depth - 1);
			state(depth > 0 && !blocked());
		},
		over(event: DragEvent) {
			if (handle(event) && event.dataTransfer)
				event.dataTransfer.dropEffect = blocked() ? 'none' : 'copy';
		},
		drop(event: DragEvent) {
			if (!handle(event)) return;
			reset();
			if (!blocked()) receive(Array.from(event.dataTransfer?.files ?? []));
		}
	};
}
