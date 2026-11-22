/**
 * Press once to arm, again to act: the first activation only asks, so a stray click, tap or key cannot act alone.
 * One instance arms one target at a time, so arming another target disarms the first.
 */
export class TwoStepConfirm<Key = true> {
	armed = $state<Key>();
	#timer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private options: {
			/** Disarm on its own after this long. */
			expireMs?: number;
			/** Ignore the later clicks of a double click, so one quick double click never acts. */
			ignoreRepeatClicks?: boolean;
		} = {}
	) {}

	/** Returns true when this activation confirms `key`. */
	press(key: Key, event: MouseEvent): boolean {
		if (this.options.ignoreRepeatClicks && event.detail > 1) return false;
		if (this.armed === key) {
			this.disarm();
			return true;
		}
		// Safari does not focus a clicked button, and blur is what disarms it.
		(event.currentTarget as HTMLElement).focus({ preventScroll: true });
		this.armed = key;
		clearTimeout(this.#timer);
		if (this.options.expireMs) this.#timer = setTimeout(() => this.disarm(), this.options.expireMs);
		return false;
	}

	disarm() {
		clearTimeout(this.#timer);
		this.armed = undefined;
	}
}

/** A held Enter or Space repeats clicks; only a fresh press may confirm. */
export function ignoreKeyRepeat(event: KeyboardEvent) {
	if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
}
