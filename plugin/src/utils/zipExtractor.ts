import JSZip from 'jszip';

/**
 * Extract the `full.md` content from a MinerU result ZIP buffer.
 * Returns null if no full.md is present.
 *
 * MinerU ZIP layout (non-HTML):
 *   layout.json
 *   **_model.json
 *   **_content_list.json
 *   full.md          ← we want this
 *
 * MinerU ZIP layout (HTML input):
 *   full.md
 *   main.html
 */
export async function extractMarkdownFromZip(
	zipBuffer: ArrayBuffer,
): Promise<string | null> {
	const zip = await JSZip.loadAsync(zipBuffer);

	// Prefer an exact "full.md" entry; otherwise fall back to any "*full.md"
	const candidates = Object.keys(zip.files).filter(
		(name) => name.endsWith('/full.md') || name === 'full.md',
	);
	const target = candidates[0];
	if (!target) return null;

	const file = zip.file(target);
	if (!file) return null;

	const text = await file.async('string');
	return text;
}