import { unzipSync } from 'fflate';
import { Logger } from './logger';

const log = new Logger('zipExtractor');

/**
 * The output of unpacking a MinerU result ZIP.
 *
 *   mdContent — the markdown text, ready to write as `foo.md`.
 *   images    — Map<relative-path, ArrayBuffer>. Keys are paths exactly as
 *               they appear inside the ZIP's `images/` folder (e.g.
 *               "uuid123.jpg"). The caller is responsible for writing them
 *               somewhere relative to the .md file so that the
 *               `![](images/...)` links inside the markdown resolve.
 *
 * Why we return images as buffers: Obsidian's vault API doesn't let us write
 * a "file" without knowing its final path, and we want to write every image
 * exactly once at its target location. Returning the buffers keeps the API
 * pure — no FS side effects inside the extractor.
 */
export interface ExtractedResult {
	mdContent: string;
	images: Map<string, ArrayBuffer>;
}

/**
 * MinerU result ZIP layout (model_version = "vlm" or "pipeline"):
 *
 *   layout.json
 *   <basename>_model.json
 *   <basename>_content_list.json
 *   full.md               ← what we write to `foo.md`
 *   images/
 *     <sha256>.jpg
 *     <sha256>.png
 *     ...
 *
 * MinerU ZIP layout (HTML input):
 *
 *   full.md
 *   main.html
 *   images/
 *     ...
 *
 * The `images/` folder always lives next to `full.md`, so any relative
 * `![](images/xxx)` link inside `full.md` will resolve as long as we write
 * the images next to the .md file using the SAME relative paths.
 *
 * Implementation note: `fflate` is used instead of `jszip` on purpose. jszip
 * pulls in `setimmediate`, whose browser fallback creates `<script>` elements
 * and wraps callbacks with `new Function()` — exactly the "dynamic code
 * execution" / "runtime script injection" patterns the Obsidian plugin review
 * scanner rejects. fflate is pure computation with no DOM or eval surface.
 *
 * Security note (2026-11-03): the archive is downloaded from a remote server,
 * so its entry names are untrusted input. `fflate` does NOT sanitize them —
 * it happily returns `result/images/../../../../evil.txt` as a key. Obsidian's
 * `normalizePath()` collapses slashes but does NOT resolve `..` segments, and
 * `adapter.writeBinary()` writes whatever path it is handed. Left unchecked,
 * a malicious or compromised result archive could write files outside the
 * `images/` folder. {@link safeImageKey} rejects such entries before they ever
 * reach the vault.
 */
export function extractFromZip(zipBuffer: ArrayBuffer): ExtractedResult | null {
	// Only inflate what we need: `full.md` and anything under `images/`.
	// layout.json / model.json / content_list.json are skipped untouched.
	const files = unzipSync(new Uint8Array(zipBuffer), {
		filter: (file) =>
			/(^|\/)full\.md$/.test(file.name) || /(^|\/)images\//.test(file.name),
	});

	// 1. Locate `full.md` (any depth — some ZIPs nest it under a folder).
	const mdPath = Object.keys(files).find((path) => /(^|\/)full\.md$/.test(path));
	if (!mdPath) return null;
	const mdContent = new TextDecoder().decode(files[mdPath]);

	// 2. Collect every file under `images/` (any depth, any extension).
	const images = new Map<string, ArrayBuffer>();
	for (const [path, data] of Object.entries(files)) {
		if (!/(^|\/)images\//.test(path)) continue;

		// Normalize the key: keep the part AFTER the first "images/"
		// so that writing all keys under `<mdDir>/images/<key>` works.
		// Examples:
		//   "images/abc.jpg"          → "abc.jpg"
		//   "result/images/abc.jpg"   → "abc.jpg"
		//   "images/sub/abc.jpg"      → "sub/abc.jpg"  (rare; pass-through)
		const idx = path.indexOf('images/');
		const key = path.slice(idx + 'images/'.length);
		if (!key) continue;

		// Reject path-traversal / absolute-path entries. The archive comes
		// from the network, so `key` is attacker-controlled.
		const safeKey = safeImageKey(key);
		if (safeKey === null) {
			log.warn('Dropped unsafe image path from archive:', key);
			continue;
		}

		// Deduplicate: if two archive entries map to the same key (rare),
		// keep the first — the second would just clobber it.
		if (images.has(safeKey)) continue;
		images.set(safeKey, toArrayBuffer(data));
	}

	return { mdContent, images };
}

/**
 * Validate an archive-relative image path so it can only ever land inside the
 * intended `images/` folder.
 *
 * Returns the cleaned key, or `null` when the entry must be dropped.
 *
 * Rejected:
 *   - any segment equal to `..`  (path traversal)
 *   - absolute paths (`/foo`, `C:\foo`) and Windows drive letters
 *   - backslash separators, which some unarchivers treat as path separators
 *   - empty or `.`-only segments that would collapse to a bare directory
 *
 * Kept: plain relative names and nested sub-directories (`sub/deep.png`),
 * since MinerU does emit nested `images/` folders for some documents.
 */
export function safeImageKey(key: string): string | null {
	// Backslashes are path separators on Windows; a key containing them could
	// escape via `..\..`. Normalize to `/` first so the segment check below
	// sees them — but reject the original if the two forms disagree in a way
	// that changes meaning. Simplest and safest: refuse backslashes outright.
	if (key.includes('\\')) return null;
	if (key.startsWith('/')) return null;
	// Windows drive letter (`C:/foo`) or UNC-ish prefix.
	if (/^[a-zA-Z]:/.test(key)) return null;
	if (key.includes('\0')) return null;

	const segments = key.split('/');
	const clean: string[] = [];
	for (const seg of segments) {
		if (seg === '' || seg === '.') continue; // collapse no-ops
		if (seg === '..') return null; // traversal — drop the whole entry
		clean.push(seg);
	}
	if (clean.length === 0) return null;
	return clean.join('/');
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
	// `unzipSync` may hand back a view onto a larger buffer; copy when it does
	// so callers get an exactly-sized ArrayBuffer they can write directly.
	if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
		return u8.buffer as ArrayBuffer;
	}
	// `slice()` always returns a fresh, exactly-sized buffer.
	return u8.slice().buffer;
}
