import { TFile, Vault, requestUrl } from 'obsidian';
import {
	MINERU_BASE_URL,
	HTTP_429_RETRY_MS,
	HTTP_429_MAX_RETRIES,
	DEFAULT_POLL_INTERVAL_SEC,
	MAX_POLL_TIME_MS,
	SINGLE_FILE_DATA_ID,
} from '../utils/constants';
import { Logger } from '../utils/logger';
import { extractFromZip, type ExtractedResult } from '../utils/zipExtractor';
import { t } from '../i18n/helpers';
import {
	ApiResponse,
	BatchResultsResponse,
	ConvertOptions,
	ExtractResultItem,
	MinerUConfig,
	ProgressCallback,
	SubmitBatchResponse,
} from './types';

/**
 * Thrown by convertSingleFile / testConnection for any failure the user
 * should be told about. The friendly message comes from
 * `localizeApiError` (mapped to i18n in the UI layer).
 */
export class MinerUError extends Error {
	readonly code: string | number;
	readonly httpStatus?: number;

	constructor(message: string, code: string | number, httpStatus?: number) {
		super(message);
		this.name = 'MinerUError';
		this.code = code;
		this.httpStatus = httpStatus;
	}
}

const log = new Logger('MinerUClient');

/**
 * MinerU reports "this file is too long" as a per-file `state: "failed"` with
 * a free-text `err_msg`, not as a top-level error code. The wording has never
 * been an explicit contract, so we match it loosely and deliberately — the
 * only thing we do with a match is replace a raw English string with a
 * localized, actionable message.
 */
const PAGE_LIMIT_PATTERNS: readonly RegExp[] = [
	/number of pages exceeds limit/i,
	/exceeds? the .{0,12}page limit/i,
	/超过.{0,10}页/i,
	/页数超过限制/i,
];

/** True if an error from this client is MinerU's page-limit rejection. */
export function isPageLimitError(err: unknown): boolean {
	return err instanceof MinerUError && err.code === 'page-limit';
}

function looksLikePageLimit(errMsg: string | undefined): boolean {
	if (!errMsg) return false;
	return PAGE_LIMIT_PATTERNS.some((re) => re.test(errMsg));
}

/**
 * MinerU answers with two different envelope shapes (observed 2026-10-23):
 *   - business:     `{ code, msg, data, trace_id }`
 *   - gateway/auth: `{ success, msgCode, msg, data, traceId, total }`
 * Pick the code out of whichever shape came back, so error mapping below works
 * for both. Returns undefined when the body carries no code at all.
 */
function envelopeCode(
	envelope: ApiResponse<unknown> | undefined,
): number | string | undefined {
	return envelope?.code ?? envelope?.msgCode;
}

/** Parse the response body as an envelope; undefined when it isn't JSON. */
function safeEnvelope(res: { json: unknown }): ApiResponse<unknown> | undefined {
	try {
		const body = res.json as ApiResponse<unknown> | undefined;
		return typeof body === 'object' && body !== null ? body : undefined;
	} catch {
		return undefined;
	}
}

/** Translate common API error codes into i18n strings when possible. */
export function localizeApiError(err: unknown): string {
	if (!(err instanceof MinerUError)) {
		return err instanceof Error ? err.message : String(err);
	}
	switch (err.code) {
		case 'A0202':
			return t('apiErrA0202');
		case 'A0211':
			return t('apiErrA0211');
		case 'page-limit':
			return t('apiErr60006');
		case 'rate-limit':
			return t('apiErrRateLimit');
		case -60005:
		case '60005':
			return t('apiErr60005');
		case -60006:
		case '60006':
			return t('apiErr60006');
		case -60007:
		case '60007':
			return t('apiErr60007');
		case -60009:
		case '60009':
			return t('apiErr60009');
		case -60018:
		case '60018':
			return t('apiErr60018');
		default:
			return t('apiErrGeneric')(err.code, err.message);
	}
}

export class MinerUClient {
	constructor(
		private readonly config: MinerUConfig,
		private readonly vault: Vault,
	) {}

	// ---------- public API ----------

	/**
	 * Convert one TFile to Markdown, returning the resulting markdown text
	 * and the images referenced inside it. The caller writes both to disk.
	 *
	 * Honors AbortSignal. Throws MinerUError for known API failure modes
	 * and DOMException('AbortError') for cancellation.
	 *
	 * This is the whole-file path. Large PDFs are split by DocumentConverter,
	 * which calls {@link convertBytes} once per part.
	 */
	async convertSingleFile(
		file: TFile,
		opts: ConvertOptions = {},
	): Promise<ExtractedResult> {
		const bytes = await this.vault.readBinary(file);
		return this.convertBytes(file.name, bytes, opts);
	}

	/**
	 * Same pipeline as {@link convertSingleFile} but takes the bytes directly,
	 * so a caller that already holds them (split parts) skips a second read of
	 * the vault. `name` is sent to MinerU as the file name and must keep its
	 * extension — the API uses it to pick a parser.
	 */
	async convertBytes(
		name: string,
		bytes: ArrayBuffer,
		opts: ConvertOptions = {},
	): Promise<ExtractedResult> {
		const onProgress = opts.onProgress ?? (() => {});
		const signal = opts.signal;

		// 1. Submit
		onProgress({ phase: 'submitting' });
		const { batchId, fileUrl } = await this.submitSingle(name, signal);
		log.debug('Submitted batch', batchId, 'for', name);

		// 2. Upload
		onProgress({ phase: 'uploading', message: name });
		await this.uploadBytes(fileUrl, bytes, signal);

		// 3. Poll until done/failed (single-file batch — total=1)
		const finished = await this.pollBatch(batchId, 1, onProgress, signal);

		if (signal?.aborted) {
			onProgress({ phase: 'cancelled' });
			throw new DOMException('Aborted', 'AbortError');
		}

		const myResult = finished.find((r) => r.data_id === SINGLE_FILE_DATA_ID);
		if (!myResult) {
			throw new MinerUError('No result returned for this file', -1);
		}
		if (myResult.state !== 'done') {
			throw new MinerUError(
				myResult.err_msg || `Task ended with state: ${myResult.state}`,
				looksLikePageLimit(myResult.err_msg) ? 'page-limit' : 'extract-failed',
			);
		}
		if (!myResult.full_zip_url) {
			throw new MinerUError('Done but no ZIP URL returned', -1);
		}

		// 4. Download
		onProgress({ phase: 'downloading' });
		const zipBuffer = await this.downloadZip(myResult.full_zip_url, signal);

		// 5. Extract — both `full.md` and the `images/` folder
		onProgress({ phase: 'extracting' });
		const extracted = extractFromZip(zipBuffer);
		if (extracted == null) {
			throw new MinerUError('full.md not found in result archive', -1);
		}
		if (extracted.images.size > 0) {
			log.debug('Extracted', extracted.images.size, 'images');
		}

		// 6. Done — caller will write to disk.
		onProgress({ phase: 'saving' });
		return { mdContent: extracted.mdContent, images: extracted.images };
	}

	/**
	 * Token check: probe `GET /extract-results/batch/<zero-uuid>` — the
	 * cheapest "real" request we have without a dedicated ping endpoint. The
	 * batch id is intentionally nonexistent; we only care how the auth layer
	 * answers.
	 *
	 * Judgement is evidence-based (live probe with a deliberately invalid
	 * token, 2026-10-23): a rejected token comes back as HTTP 401 with
	 * `{ success: false, msgCode: "A0211", msg: "user token expired" }`.
	 * So:
	 *   - 200        → token accepted.
	 *   - 401 / 403  → token rejected (A0202 = invalid, A0211 = expired).
	 *   - other 4xx  → the request got past auth, so the token works; the
	 *                  probe id itself is what the API complained about.
	 */
	async testConnection(): Promise<{ ok: boolean; message: string }> {
		try {
			const probeId = '00000000-0000-0000-0000-000000000000';
			const res = await requestUrl({
				url: `${MINERU_BASE_URL}/api/v4/extract-results/batch/${probeId}`,
				method: 'GET',
				headers: this.authHeaders(),
				throw: false,
			});
			if (res.status === 200) return { ok: true, message: t('settingsTestOk') };

			if (res.status === 401 || res.status === 403) {
				const body = safeEnvelope(res);
				const code = envelopeCode(body);
				return {
					ok: false,
					message: code !== undefined
						? localizeApiError(
								new MinerUError(body?.msg || 'invalid', code, res.status),
							)
						: t('apiErrA0202'),
				};
			}

			if (res.status >= 400 && res.status < 500) {
				// Auth passed; the nonexistent probe id is the complaint.
				return { ok: true, message: t('settingsTestOk') };
			}
			return {
				ok: false,
				message: `HTTP ${res.status}: ${res.text.slice(0, 200)}`,
			};
		} catch (e) {
			return { ok: false, message: (e as Error).message };
		}
	}

	// ---------- internal helpers ----------

	private authHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${this.config.token}`,
		};
	}

	/** Submit a single file as a one-item batch. */
	private async submitSingle(
		name: string,
		signal?: AbortSignal,
	): Promise<{ batchId: string; fileUrl: string }> {
		const payload = {
			files: [{ name, data_id: SINGLE_FILE_DATA_ID }],
			model_version: this.config.modelVersion,
			enable_formula: this.config.enableFormula,
			enable_table: this.config.enableTable,
			language: this.config.language,
		};

		const res = await this.requestWithRetry<SubmitBatchResponse>(
			'POST',
			'/api/v4/file-urls/batch',
			payload,
			signal,
		);
		const batchId = res.batch_id;
		const fileUrl = res.file_urls[0];
		if (!fileUrl) throw new MinerUError('No upload URL returned', -1);
		return { batchId, fileUrl };
	}

	/** Upload the file to the pre-signed OSS URL. PUT, no Content-Type. */
	private async uploadBytes(
		uploadUrl: string,
		bytes: ArrayBuffer,
		signal?: AbortSignal,
	): Promise<void> {
		// requestUrl doesn't expose PUT body=ArrayBuffer directly? It does —
		// body can be string | ArrayBuffer. Use ArrayBuffer.
		const res = await requestUrl({
			url: uploadUrl,
			method: 'PUT',
			body: bytes,
			throw: false,
		});
		// requestUrl is not abort-aware via the same path; use the signal
		// for cancellation between steps.
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

		// 200 means success on Aliyun OSS.
		if (res.status < 200 || res.status >= 300) {
			throw new MinerUError(
				`Upload failed: HTTP ${res.status}`,
				'upload-failed',
				res.status,
			);
		}
	}

	/**
	 * Poll the batch until all `total` files have reached a terminal state
	 * or max poll time elapses. Calls onProgress with `parsing` updates.
	 */
	private async pollBatch(
		batchId: string,
		total: number,
		onProgress: ProgressCallback,
		signal?: AbortSignal,
	): Promise<ExtractResultItem[]> {
		const POLL_INTERVAL_MS = DEFAULT_POLL_INTERVAL_SEC * 1000;
		const MAX_POLL_MS = MAX_POLL_TIME_MS;
		const start = Date.now();
		const done = new Set<string>();

		while (done.size < total) {
			if (signal?.aborted) {
				throw new DOMException('Aborted', 'AbortError');
			}
			if (Date.now() - start > MAX_POLL_MS) {
				throw new MinerUError(
					`Timed out after ${Math.round(MAX_POLL_MS / 60000)} minutes`,
					'poll-timeout',
				);
			}

			await this.sleep(POLL_INTERVAL_MS, signal);

			const data = await this.requestWithRetry<BatchResultsResponse>(
				'GET',
				`/api/v4/extract-results/batch/${batchId}`,
				undefined,
				signal,
			);

			const results = data.extract_result ?? [];
			let pending = 0;
			for (const r of results) {
				const id = r.data_id ?? '';
				if (done.has(id)) continue;
				if (r.state === 'done' || r.state === 'failed') {
					done.add(id);
				} else {
					pending += 1;
				}
			}

			onProgress({
				phase: 'parsing',
				current: done.size,
				total,
				elapsedMs: Date.now() - start,
				message: `${done.size}/${total}`,
			});
			log.debug(`poll: ${done.size}/${total} done, ${pending} pending`);
		}

		// Final fetch to return all terminal results.
		const finalData = await this.requestWithRetry<BatchResultsResponse>(
			'GET',
			`/api/v4/extract-results/batch/${batchId}`,
			undefined,
			signal,
		);
		return finalData.extract_result ?? [];
	}

	private async downloadZip(
		zipUrl: string,
		signal?: AbortSignal,
	): Promise<ArrayBuffer> {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
		const res = await requestUrl({
			url: zipUrl,
			method: 'GET',
			throw: false,
		});
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
		if (res.status < 200 || res.status >= 300) {
			throw new MinerUError(
				`ZIP download failed: HTTP ${res.status}`,
				'download-failed',
				res.status,
			);
		}
		return res.arrayBuffer;
	}

	/**
	 * Wrapper that handles HTTP 429 with automatic 65s retry and JSON parsing
	 * errors. Treats any non-200 with a JSON envelope as a MinerUError using
	 * the API's `code` field.
	 */
	private async requestWithRetry<T>(
		method: 'GET' | 'POST' | 'PUT',
		path: string,
		body: unknown,
		signal?: AbortSignal,
	): Promise<T> {
		const url = path.startsWith('http') ? path : `${MINERU_BASE_URL}${path}`;
		const init: Parameters<typeof requestUrl>[0] = {
			url,
			method,
			headers: this.authHeaders(),
			throw: false,
		};
		if (body !== undefined) {
			init.body = JSON.stringify(body);
		}

		// Manual retry loop (we keep this synchronous-feeling for 429).
		let rateLimitRetries = 0;
		while (true) {
			if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
			const res = await requestUrl(init);

			if (res.status === 429) {
				rateLimitRetries += 1;
				if (rateLimitRetries > HTTP_429_MAX_RETRIES) {
					// Bounded on purpose: retrying forever keeps the task alive
					// with zero feedback. A clear "come back later" beats a hang.
					throw new MinerUError(
						`Rate limited (HTTP 429) ${HTTP_429_MAX_RETRIES} times`,
						'rate-limit',
						res.status,
					);
				}
				log.warn('HTTP 429 — sleeping', HTTP_429_RETRY_MS, 'ms');
				await this.sleep(HTTP_429_RETRY_MS, signal);
				continue;
			}

			// For 2xx: parse and return.
			if (res.status >= 200 && res.status < 300) {
				let envelope: ApiResponse<T>;
				try {
					envelope = res.json as ApiResponse<T>;
				} catch {
					throw new MinerUError(
						`Invalid JSON response (HTTP ${res.status})`,
						-500,
						res.status,
					);
				}
				if (typeof envelope !== 'object' || envelope === null) {
					throw new MinerUError('Non-object response', -500, res.status);
				}
				// Accept both envelope shapes; only an explicit non-zero code
				// is an error (see envelopeCode).
				const code = envelopeCode(envelope);
				if (code !== undefined && code !== 0) {
					throw new MinerUError(
						envelope.msg || 'Unknown API error',
						code,
						res.status,
					);
				}
				if (envelope.data === undefined) {
					throw new MinerUError('Missing data field', -500, res.status);
				}
				return envelope.data;
			}

			// Non-2xx, non-429: parse the envelope (if any) for the API code.
			const envelope = safeEnvelope(res);
			const code = envelopeCode(envelope) ?? res.status;
			const msg =
				envelope?.msg || `HTTP ${res.status}: ${res.text.slice(0, 200)}`;
			throw new MinerUError(msg, code, res.status);
		}
	}

	private sleep(ms: number, signal?: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(new DOMException('Aborted', 'AbortError'));
				return;
			}
			// The abort listener MUST be removed when the timer settles: a long
			// polling run calls this hundreds of times on the same AbortSignal,
			// and orphaned listeners would pile up for the whole conversion.
			const onAbort = (): void => {
				window.clearTimeout(timer);
				reject(new DOMException('Aborted', 'AbortError'));
			};
			const timer = window.setTimeout(() => {
				signal?.removeEventListener('abort', onAbort);
				resolve();
			}, ms);
			signal?.addEventListener('abort', onAbort, { once: true });
		});
	}
}