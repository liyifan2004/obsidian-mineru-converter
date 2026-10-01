import { unzipSync } from 'fflate';

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

		// Deduplicate: if two archive entries map to the same key (rare),
		// keep the first — the second would just clobber it.
		if (images.has(key)) continue;
		images.set(key, toArrayBuffer(data));
	}

	return { mdContent, images };
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
