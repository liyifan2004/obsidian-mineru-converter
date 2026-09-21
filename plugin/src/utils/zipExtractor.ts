import JSZip from 'jszip';

type JSZipEntry = JSZip.JSZipObject;

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
 */
export async function extractFromZip(
	zipBuffer: ArrayBuffer,
): Promise<ExtractedResult | null> {
	const zip = await JSZip.loadAsync(zipBuffer);

	// 1. Locate `full.md` (any depth — some ZIPs nest it under a folder).
	const mdEntry = findEntry(zip, /(^|\/)full\.md$/);
	if (!mdEntry) return null;
	const mdContent = await mdEntry.async('string');

	// 2. Collect every file under `images/` (any depth, any extension).
	const images = new Map<string, ArrayBuffer>();
	for (const [path, entry] of Object.entries(zip.files)) {
		if (entry.dir) continue;
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
		images.set(key, await entry.async('arraybuffer'));
	}

	return { mdContent, images };
}

/**
 * Find the first ZIP entry whose name matches the given regex.
 * Returns the entry, or undefined if none match.
 */
function findEntry(zip: JSZip, pattern: RegExp): JSZipEntry | undefined {
	for (const name of Object.keys(zip.files)) {
		if (pattern.test(name)) {
			const entry = zip.file(name);
			if (entry) return entry;
		}
	}
	return undefined;
}