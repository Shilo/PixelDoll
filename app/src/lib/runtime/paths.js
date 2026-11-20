/** @param {string} stem */
export function boundedFileStem(stem) {
	if (stem.length <= 100) return stem;
	let hash = 0xcbf29ce484222325n;
	for (const char of stem)
		hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0) ?? 0)) * 0x100000001b3n);
	return `~${hash.toString(16).padStart(16, '0')}`;
}

/** @param {...string} parts */
export function atlasName(...parts) {
	return boundedFileStem(parts.map((part) => `${part.length}-${part}`).join('_')) + '.json';
}
