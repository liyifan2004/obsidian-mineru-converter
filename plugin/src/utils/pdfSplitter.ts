import { EncryptedPDFError, PDFDocument } from 'pdf-lib';
import { MAX_PAGES_PER_PDF } from './constants';

/**
 * Page-count inspection + page-range splitting for PDFs, used to work around
 * MinerU's hard limit of 200 pages per submitted file.
 *
 * Why pdf-lib: an Obsidian plugin runs inside Electron's renderer process with
 * no access to Node's `fs` / `child_process`, so the PyPDF2 route described in
 * `docs/02-实操经验总结.md` §3.4 is not available here. pdf-lib is pure
 * JavaScript, has no native dependencies, and rebuilds the page tree in memory.
 *
 * Fidelity contract — please keep it:
 *   - When the PDF fits in one part, `PdfPart.bytes` IS the original buffer.
 *     We never re-serialize a document we don't have to touch.
 *   - When we do split, pages are deep-copied via `copyPages`, which carries
 *     content streams, fonts, XObjects and inherited page attributes over
 *     verbatim. Document-level extras (bookmarks, page labels, form fields,
 *     tagged-PDF structure) are dropped — irrelevant for OCR/parse.
 */

export type PdfSplitErrorKind =
	/** The PDF has an /Encrypt entry; pdf-lib cannot decrypt it. */
	| 'encrypted'
	/** The file is not a PDF pdf-lib can parse at all. */
	| 'unreadable'
	/** Parsed fine but has zero pages. */
	| 'empty';

/**
 * Raised when we cannot inspect/split a PDF. Callers should treat this as
 * "auto-split unavailable" and fall back to uploading the file as-is rather
 * than failing the conversion outright.
 */
export class PdfSplitError extends Error {
	constructor(
		readonly kind: PdfSplitErrorKind,
		message: string,
		readonly cause?: unknown,
	) {
		super(message);
		this.name = 'PdfSplitError';
	}
}

export interface PdfPart {
	/** 1-based part number, used for progress reporting. */
	index: number;
	/** 1-based, inclusive. */
	pageStart: number;
	/** 1-based, inclusive. */
	pageEnd: number;
	/** The bytes to upload. For a single part this is the ORIGINAL buffer. */
	bytes: ArrayBuffer;
}

export interface PdfPlan {
	/** Total pages in the source document. */
	pageCount: number;
	/** Always at least one entry; length > 1 means the PDF was split. */
	parts: PdfPart[];
}

export interface PlanPdfOptions {
	/** Largest legal number of pages per part. Defaults to MinerU's limit. */
	maxPages?: number;
	/** Checked between parts so a long split stays cancellable. */
	signal?: AbortSignal;
	/** Called after each part is written, for progress UI. */
	onPart?: (done: number, total: number, pageCount: number) => void;
}

/**
 * Parse a PDF once and decide how to feed it to MinerU.
 *
 * Returns a plan whose `parts` are ready to upload, in order. A single part
 * means "send the original file unchanged" — no re-encoding happened.
 *
 * Throws {@link PdfSplitError} when the PDF cannot be inspected (encrypted or
 * malformed); the caller decides whether to fall back.
 */
export async function planPdf(
	bytes: ArrayBuffer,
	options: PlanPdfOptions = {},
): Promise<PdfPlan> {
	const maxPages = options.maxPages ?? MAX_PAGES_PER_PDF;
	if (maxPages < 1) throw new RangeError('maxPages must be >= 1');

	const src = await loadPdf(bytes);

	let pageCount: number;
	try {
		pageCount = src.getPageCount();
	} catch (e) {
		throw new PdfSplitError('unreadable', describe(e), e);
	}
	if (pageCount === 0) {
		throw new PdfSplitError('empty', 'PDF has no pages');
	}

	// Fast path — the whole document is a legal single submission.
	if (pageCount <= maxPages) {
		return {
			pageCount,
			parts: [
				{ index: 1, pageStart: 1, pageEnd: pageCount, bytes },
			],
		};
	}

	const partCount = Math.ceil(pageCount / maxPages);
	const parts: PdfPart[] = [];

	for (let i = 0; i < partCount; i++) {
		throwIfAborted(options.signal);

		const start = i * maxPages; // 0-based, inclusive
		const end = Math.min(start + maxPages, pageCount); // 0-based, exclusive
		const indices: number[] = [];
		for (let p = start; p < end; p++) indices.push(p);

		// A fresh writer per part keeps peak memory at one part extra rather
		// than all parts at once.
		const dst = await PDFDocument.create({ updateMetadata: false });
		const copied = await dst.copyPages(src, indices);
		for (const page of copied) dst.addPage(page);
		const out = await dst.save();

		parts.push({
			index: i + 1,
			pageStart: start + 1,
			pageEnd: end,
			bytes: toArrayBuffer(out),
		});

		options.onPart?.(i + 1, partCount, pageCount);

		// Yield to the event loop so the progress modal can repaint.
		await yieldToUi();
	}

	return { pageCount, parts };
}

// ---------- internals ----------

async function loadPdf(bytes: ArrayBuffer): Promise<PDFDocument> {
	try {
		// updateMetadata: false — never touch the producer/mod dates of a
		// document we only inspect. Encryption is deliberately NOT ignored:
		// with `ignoreEncryption` pdf-lib parses an encrypted file but leaves
		// its streams encrypted, so a "successful" split would produce a
		// corrupt PDF that MinerU chokes on later.
		return await PDFDocument.load(bytes, { updateMetadata: false });
	} catch (e) {
		if (e instanceof EncryptedPDFError) {
			throw new PdfSplitError('encrypted', 'PDF is password-protected', e);
		}
		throw new PdfSplitError('unreadable', describe(e), e);
	}
}

function describe(e: unknown): string {
	if (e instanceof Error) return `${e.name}: ${e.message}`;
	return String(e);
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
	// `save()` may hand back a view onto a larger buffer; copy when it does so
	// callers get an exactly-sized ArrayBuffer they can upload directly.
	if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
		return u8.buffer as ArrayBuffer;
	}
	// `slice()` always returns a fresh, exactly-sized buffer.
	return u8.slice().buffer;
}

function yieldToUi(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
