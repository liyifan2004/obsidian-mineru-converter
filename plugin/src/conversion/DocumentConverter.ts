import { TFile, Vault } from 'obsidian';
import {
	MinerUClient,
	MinerUError,
	isPageLimitError,
	localizeApiError,
} from '../api/MinerUClient';
import type { ConvertOptions, ProgressCallback } from '../api/types';
import type { ExtractedResult } from '../utils/zipExtractor';
import { MAX_PAGES_PER_PDF } from '../utils/constants';
import { PdfSplitError, planPdf, type PdfPlan } from '../utils/pdfSplitter';
import { mergeChunkResults } from './mergeResults';
import { Logger } from '../utils/logger';
import { t } from '../i18n/helpers';

const log = new Logger('DocumentConverter');

export interface DocumentConverterOptions {
	/**
	 * When true, a PDF longer than {@link maxPagesPerPart} is split, parsed in
	 * parts, and stitched back into a single Markdown file.
	 */
	autoSplit: boolean;
	/** Largest legal pages per part. Defaults to MinerU's own limit (200). */
	maxPagesPerPart?: number;
}

/**
 * Why a conversion fell back to a single whole-file upload. Used to pick the
 * right advice when MinerU then rejects the file for being too long.
 */
type WholeFileReason =
	/** Not a PDF — we have no splitter for it. */
	| 'non-pdf'
	/** PDF, but auto-split is switched off in settings. */
	| 'auto-split-off'
	/** PDF fits in one part as-is. */
	| 'fits'
	/** PDF too long, but we could not read/split it locally. */
	| 'split-unavailable';

/**
 * Orchestrates "file in → one Markdown file out".
 *
 * The interesting case is a PDF with more than 200 pages: MinerU rejects those
 * outright, so we split the page tree into ≤200-page parts, submit each part as
 * its own one-file batch (strictly in sequence, to stay inside the 50 files/min
 * limit), then merge the resulting Markdown and images back together. The user
 * only ever sees one progress bar and one output file.
 *
 * Everything else — Word, PPT, Excel, images, short PDFs — keeps the original
 * single-request path untouched, including the fidelity guarantee that the
 * original file bytes are uploaded unchanged.
 */
export class DocumentConverter {
	private readonly maxPagesPerPart: number;

	constructor(
		private readonly client: MinerUClient,
		private readonly vault: Vault,
		private readonly options: DocumentConverterOptions,
	) {
		this.maxPagesPerPart = options.maxPagesPerPart ?? MAX_PAGES_PER_PDF;
	}

	async convert(
		file: TFile,
		opts: ConvertOptions = {},
	): Promise<ExtractedResult> {
		const onProgress = opts.onProgress ?? ((): void => {});
		const signal = opts.signal;

		if (!this.shouldSplit(file)) {
			return this.convertWholeFile(
				file,
				{ onProgress, signal },
				this.isPdf(file) ? 'auto-split-off' : 'non-pdf',
			);
		}

		// Read once. Both the "fits" and the "split" branches feed these same
		// bytes back to the client, so we never read the file twice.
		let bytes: ArrayBuffer;
		let plan: PdfPlan;
		try {
			onProgress({ phase: 'inspecting' });
			bytes = await this.vault.readBinary(file);
			plan = await planPdf(bytes, {
				maxPages: this.maxPagesPerPart,
				signal,
				onPart: (done, total, pageCount) =>
					onProgress({
						phase: 'splitting',
						current: done,
						total,
						pages: pageCount,
					}),
			});
		} catch (err) {
			if (isAbort(err)) throw err;
			if (err instanceof PdfSplitError) {
				// Encrypted or malformed: we cannot even count the pages. Try the
				// file anyway — MinerU may still accept it, and if it does not,
				// `limitHint` explains the situation in the user's language.
				log.warn(
					`Cannot inspect PDF locally (${err.kind}): ${err.message} — falling back to whole-file upload`,
				);
				return this.convertWholeFile(
					file,
					{ onProgress, signal },
					'split-unavailable',
				);
			}
			throw err;
		}

		if (plan.parts.length === 1) {
			return this.convertWholeFile(file, { onProgress, signal }, 'fits', bytes);
		}

		// ---------- split path ----------
		const totalParts = plan.parts.length;
		log.info(
			`PDF has ${plan.pageCount} pages — split into ${totalParts} parts of <=${this.maxPagesPerPart}`,
		);

		const results: ExtractedResult[] = [];
		for (const part of plan.parts) {
			if (signal?.aborted) throw abortError();
			const chunk = { index: part.index, total: totalParts };
			try {
				results.push(
					await this.client.convertBytes(file.name, part.bytes, {
						signal,
						onProgress: (u) => onProgress({ ...u, chunk }),
					}),
				);
			} catch (err) {
				if (isAbort(err)) throw err;
				// One failed part fails the whole document. Emitting a partial
				// Markdown would look fine but silently drop pages, which is
				// worse than an explicit error.
				if (isPageLimitError(err)) {
					throw new Error(t('pdfPageLimitUnsplittable'));
				}
				if (err instanceof MinerUError) {
					throw new Error(
						t('partFailed')(part.index, totalParts, localizeApiError(err)),
					);
				}
				throw err;
			}
		}

		onProgress({
			phase: 'merging',
			chunk: { index: totalParts, total: totalParts },
		});
		const merged = mergeChunkResults(results);
		log.info(
			`Merged ${results.length} parts -> ${merged.mdContent.length} chars, ${merged.images.size} images`,
		);
		return merged;
	}

	// ---------- internals ----------

	private isPdf(file: TFile): boolean {
		return file.extension.toLowerCase() === 'pdf';
	}

	private shouldSplit(file: TFile): boolean {
		return this.options.autoSplit && this.isPdf(file);
	}

	/**
	 * The original single-request flow, plus one improvement: if MinerU turns
	 * the file down for being too long, replace its opaque English message with
	 * something that tells the user what to actually do about it.
	 *
	 * `bytes` is optional — pass it when the caller already read the file.
	 */
	private async convertWholeFile(
		file: TFile,
		o: { onProgress: ProgressCallback; signal?: AbortSignal },
		reason: WholeFileReason,
		bytes?: ArrayBuffer,
	): Promise<ExtractedResult> {
		try {
			return bytes
				? await this.client.convertBytes(file.name, bytes, o)
				: await this.client.convertSingleFile(file, o);
		} catch (err) {
			if (isAbort(err)) throw err;
			if (isPageLimitError(err)) throw new Error(this.limitHint(reason));
			throw err;
		}
	}

	/** Localized advice for "MinerU says this file is too long". */
	private limitHint(reason: WholeFileReason): string {
		switch (reason) {
			case 'split-unavailable':
				return t('pdfPageLimitUnsplittable');
			case 'non-pdf':
				return t('nonPdfPageLimit');
			case 'auto-split-off':
				return t('pdfPageLimitAutoSplitOff');
			case 'fits':
				// We counted the pages ourselves and MinerU still refused —
				// the two disagree, so hand the decision back to the user.
				return t('pdfPageLimitMismatch');
		}
	}
}

function isAbort(err: unknown): boolean {
	return err instanceof DOMException && err.name === 'AbortError';
}

function abortError(): DOMException {
	return new DOMException('Aborted', 'AbortError');
}
