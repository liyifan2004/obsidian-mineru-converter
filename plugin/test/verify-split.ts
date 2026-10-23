/**
 * Standalone verification for the 200-page auto-split pipeline.
 *
 * Run: esbuild-bundle this file to ESM, then `node` it.
 * It is throwaway tooling, not part of the shipped plugin.
 *
 * What it proves:
 *   1. planPdf() cuts a 450-page PDF into parts of <=200 pages (200/200/50).
 *   2. Every page's DECODED content stream in a part is byte-identical to the
 *      same page in the original — i.e. splitting does not lose page content.
 *   3. Boundary cases: 200 pages -> 1 part (original bytes, untouched),
 *      201 pages -> 2 parts.
 *   4. mergeChunkResults() concatenates bodies in order, dedupes identical
 *      images, and rewrites links when two parts use the same image name for
 *      different bytes.
 *   5. Garbage input raises PdfSplitError('unreadable') instead of crashing.
 */
import { PDFDocument, PDFRawStream, PDFArray, PDFRef, StandardFonts, rgb, decodePDFRawStream } from 'pdf-lib';
import type PDFStream from 'pdf-lib/cjs/core/objects/PDFStream';
import { planPdf, PdfSplitError } from '../src/utils/pdfSplitter';
import { mergeChunkResults } from '../src/conversion/mergeResults';

// Node shim: pdfSplitter calls `window.setTimeout` (Obsidian popout-window
// guideline). Outside a DOM we alias `window` to globalThis so the yield-to-UI
// helper keeps working in this harness.
(globalThis as { window?: unknown }).window ??= globalThis;

let failures = 0;
function check(label: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS  ${label}`);
	} else {
		failures++;
		console.log(`  FAIL  ${label} ${extra}`);
	}
}

/** Build a PDF with `n` pages, each carrying the text "Page <i>". */
async function buildPdf(n: number): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let i = 1; i <= n; i++) {
		const page = doc.addPage([595, 842]);
		page.drawText(`Page ${i}`, { x: 60, y: 760, size: 24, font, color: rgb(0, 0, 0) });
	}
	const bytes = await doc.save();
	return bytes.slice().buffer as ArrayBuffer;
}

/** Decoded bytes of a page's content stream(s). */
function pageContent(doc: PDFDocument, index: number): Uint8Array {
	const contents = doc.getPage(index).node.Contents();
	const ctx = doc.context;
	const parts: Uint8Array[] = [];
	const collect = (obj: unknown): void => {
		// Contents() hands back the raw entry, which may be an indirect ref.
		const resolved = obj instanceof PDFRef ? ctx.lookup(obj) : obj;
		if (resolved instanceof PDFArray) {
			for (let i = 0; i < resolved.size(); i++) collect(resolved.get(i) as unknown);
			return;
		}
		if (resolved instanceof PDFRawStream) {
			parts.push(decodePDFRawStream(resolved).decode());
			return;
		}
		const stream = resolved as PDFStream & {
			getUnencodedContents?: () => Uint8Array;
			getContents?: () => Uint8Array;
		};
		if (typeof stream?.getContents === 'function') {
			parts.push(
				typeof stream.getUnencodedContents === 'function'
					? stream.getUnencodedContents()
					: stream.getContents(),
			);
		}
	};
	if (contents !== undefined) collect(contents as unknown);
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

function eqBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

async function main(): Promise<void> {
	console.log('\n[1] 450-page PDF -> 3 parts of 200/200/50');
	const original = await buildPdf(450);
	const originalDoc = await PDFDocument.load(original);
	const originalContent = Array.from({ length: 450 }, (_, i) => pageContent(originalDoc, i));

	const plan = await planPdf(original, { maxPages: 200 });
	check('pageCount detected', plan.pageCount === 450, `got ${plan.pageCount}`);
	check('split into 3 parts', plan.parts.length === 3, `got ${plan.parts.length}`);
	check(
		'page ranges 1-200 / 201-400 / 401-450',
		plan.parts[0]?.pageStart === 1 &&
			plan.parts[0]?.pageEnd === 200 &&
			plan.parts[1]?.pageStart === 201 &&
			plan.parts[1]?.pageEnd === 400 &&
			plan.parts[2]?.pageStart === 401 &&
			plan.parts[2]?.pageEnd === 450,
		JSON.stringify(plan.parts.map((p) => [p.pageStart, p.pageEnd])),
	);

	console.log('\n[2] per-page content bytes survive the split');
	let mismatches = 0;
	let missing = 0;
	for (const part of plan.parts) {
		const partDoc = await PDFDocument.load(part.bytes);
		const expectedCount = part.pageEnd - part.pageStart + 1;
		if (partDoc.getPageCount() !== expectedCount) {
			check(`part ${part.index} page count = ${expectedCount}`, false, `got ${partDoc.getPageCount()}`);
		}
		for (let i = 0; i < partDoc.getPageCount(); i++) {
			const globalIndex = part.pageStart - 1 + i;
			const want = originalContent[globalIndex];
			if (!want || want.length === 0) {
				missing++;
				continue;
			}
			const got = pageContent(partDoc, i);
			if (!eqBytes(want, got)) mismatches++;
		}
	}
	check('no page lost its content stream', missing === 0, `${missing} empty`);
	check('every page byte-identical to the original', mismatches === 0, `${mismatches} mismatched`);

	// Spot-check that the human-readable text is really in there. pdf-lib
	// writes standard-font glyph runs as hex strings, so decode them.
	const part1 = await PDFDocument.load(plan.parts[0]?.bytes as ArrayBuffer);
	const part3 = await PDFDocument.load(plan.parts[2]?.bytes as ArrayBuffer);
	const text = (u8: Uint8Array): string => {
		const latin = Buffer.from(u8).toString('latin1');
		let out = '';
		for (const m of latin.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
			out += Buffer.from((m[1] ?? '').replace(/\s+/g, ''), 'hex').toString('latin1');
		}
		for (const m of latin.matchAll(/\(([^()\\]*)\)/g)) out += m[1] ?? '';
		return out;
	};
	check('part 1 page 1 still says "Page 1"', text(pageContent(part1, 0)).includes('Page 1'), text(pageContent(part1, 0)));
	check('part 1 page 200 still says "Page 200"', text(pageContent(part1, 199)).includes('Page 200'), text(pageContent(part1, 199)));
	check('part 3 page 50 still says "Page 450"', text(pageContent(part3, 49)).includes('Page 450'), text(pageContent(part3, 49)));

	console.log('\n[3] boundary cases');
	const exactly200 = await buildPdf(200);
	const plan200 = await planPdf(exactly200, { maxPages: 200 });
	check('200 pages -> single part', plan200.parts.length === 1);
	check('single part reuses the ORIGINAL buffer (no re-encode)', plan200.parts[0]?.bytes === exactly200);

	const pages201 = await buildPdf(201);
	const plan201 = await planPdf(pages201, { maxPages: 200 });
	check('201 pages -> 2 parts', plan201.parts.length === 2, `got ${plan201.parts.length}`);
	check(
		'second part holds the single page 201',
		plan201.parts[1]?.pageStart === 201 && plan201.parts[1]?.pageEnd === 201,
	);

	console.log('\n[4] mergeChunkResults');
	const mdA = 'First part text.\n\n![a](images/same.jpg)\n\n![b](images/onlyA.png)\n';
	const mdB = 'Second part text.\n\n![a](images/same.jpg)\n';
	const imgSame = new Uint8Array([1, 2, 3]).buffer;
	const imgDifferent = new Uint8Array([9, 9, 9]).buffer;
	const merged = mergeChunkResults([
		{ mdContent: mdA, images: new Map([['same.jpg', imgSame], ['onlyA.png', imgSame]]) },
		{ mdContent: mdB, images: new Map([['same.jpg', imgDifferent]]) },
	]);
	check('bodies concatenated in order', merged.mdContent.indexOf('First part') < merged.mdContent.indexOf('Second part'));
	check('identical image deduped', merged.images.size === 3 && merged.images.has('same.jpg'));
	check('conflicting image kept under a part-prefixed name', merged.images.has('part2-same.jpg'));
	check(
		'only part 2\'s link was rewritten',
		merged.mdContent.includes('![a](images/part2-same.jpg)') &&
			merged.mdContent.trimStart().startsWith('First part text.') &&
			merged.mdContent.split('images/part2-same.jpg').length === 2,
	);

	const single = mergeChunkResults([{ mdContent: mdA, images: new Map() }]);
	check('single part passes through untouched', single.mdContent === mdA);

	console.log('\n[5] unreadable input');
	try {
		await planPdf(new Uint8Array([1, 2, 3, 4, 5]).buffer, { maxPages: 200 });
		check('garbage raises PdfSplitError', false, 'no throw');
	} catch (e) {
		check('garbage raises PdfSplitError', e instanceof PdfSplitError && e.kind === 'unreadable', String(e));
	}

	console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);

	// Optional: real-world PDFs passed on the command line.
	for (const p of process.argv.slice(2)) {
		await checkRealFile(p);
	}

	if (failures > 0) console.log(`\n${failures} CHECK(S) FAILED IN TOTAL\n`);
	process.exit(failures === 0 ? 0 : 1);
}

/** Run the splitter against a real PDF and report what it produced. */
async function checkRealFile(path: string): Promise<void> {
	const fs = await import('node:fs/promises');
	console.log(`\n[real] ${path}`);
	let bytes: ArrayBuffer;
	try {
		const buf = await fs.readFile(path);
		bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
	} catch (e) {
		check('readable', false, String(e));
		return;
	}
	console.log(`  size: ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`);
	const started = Date.now();
	try {
		const plan = await planPdf(bytes, { maxPages: 200 });
		console.log(
			`  pages: ${plan.pageCount}, parts: ${plan.parts.length}, planned in ${Date.now() - started} ms`,
		);
		let totalPages = 0;
		let emptyPages = 0;
		for (const part of plan.parts) {
			const doc = await PDFDocument.load(part.bytes);
			totalPages += doc.getPageCount();
			for (let i = 0; i < doc.getPageCount(); i++) {
				if (pageContent(doc, i).length === 0) emptyPages++;
			}
			console.log(
				`  part ${part.index}: pages ${part.pageStart}-${part.pageEnd}, ` +
					`${doc.getPageCount()} loaded, ${(part.bytes.byteLength / 1024 / 1024).toFixed(1)} MB`,
			);
		}
		check('parts cover every page exactly once', totalPages === plan.pageCount, `${totalPages} vs ${plan.pageCount}`);
		check('no page has an empty content stream', emptyPages === 0, `${emptyPages} empty`);
		check(
			'every part is within the page limit',
			plan.parts.every((p) => p.pageEnd - p.pageStart + 1 <= 200),
		);
	} catch (e) {
		console.log(`  SKIPPED: ${e instanceof PdfSplitError ? `${e.kind} — ${e.message}` : String(e)}`);
	}
}

void main();
