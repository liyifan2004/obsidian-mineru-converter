import type { ExtractedResult } from '../utils/zipExtractor';

/**
 * Stitch the per-part results of a split conversion back into one document.
 *
 * The goal is that the user cannot tell the file was split: we simply
 * concatenate the part bodies in page order, separated by a blank line, and
 * merge the image sets into a single `images/` folder.
 *
 * Image name collisions are handled by content:
 *   - MinerU names images after a hash of their bytes, so the same name in two
 *     parts almost always means the same image → keep one copy.
 *   - If the bytes genuinely differ (hash collision or a re-encoded image), we
 *     keep both by prefixing the later one with `part<n>-` and rewriting the
 *     references inside that part's Markdown only.
 */
export function mergeChunkResults(
	parts: readonly ExtractedResult[],
): ExtractedResult {
	if (parts.length === 0) return { mdContent: '', images: new Map() };
	const [only] = parts;
	if (only && parts.length === 1) return only;

	const images = new Map<string, ArrayBuffer>();
	const bodies: string[] = [];

	parts.forEach((part, i) => {
		let md = part.mdContent;

		for (const [key, buf] of part.images) {
			const taken = images.get(key);
			if (taken === undefined) {
				images.set(key, buf);
				continue;
			}
			if (sameBytes(taken, buf)) continue;

			const alias = `part${i + 1}-${key}`;
			images.set(alias, buf);
			md = renameImageRef(md, key, alias);
		}

		const trimmed = md.replace(/^\s+/, '').replace(/\s+$/, '');
		if (trimmed.length > 0) bodies.push(trimmed);
	});

	return {
		mdContent: `${bodies.join('\n\n')}\n`,
		images,
	};
}

/**
 * Rewrite `images/<from>` references to `images/<to>`.
 *
 * A plain substring replace would also hit `images/foo.jpg.bak` when renaming
 * `foo.jpg`, so the key must be followed by a delimiter that can legally end
 * an image reference (`)`, `"`, `'`, `>`, whitespace, `]`, or end of text).
 */
function renameImageRef(md: string, from: string, to: string): string {
	const pattern = new RegExp(
		`images/${escapeRegExp(from)}(?=[)"'\\s>\\]]|$)`,
		'g',
	);
	return md.replace(pattern, `images/${to}`);
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
	if (a.byteLength !== b.byteLength) return false;
	const ua = new Uint8Array(a);
	const ub = new Uint8Array(b);
	for (let i = 0; i < ua.length; i++) {
		if (ua[i] !== ub[i]) return false;
	}
	return true;
}
