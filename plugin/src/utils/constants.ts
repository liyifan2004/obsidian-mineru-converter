import type { ModelVersion } from '../api/types';

/**
 * Supported file extensions for MinerU conversion.
 * Compared case-insensitively (use ext.toLowerCase()).
 */
export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
	'pdf',
	'doc',
	'docx',
	'ppt',
	'pptx',
	'xls',
	'xlsx',
	'png',
	'jpg',
	'jpeg',
	'jp2',
	'webp',
	'gif',
	'bmp',
	'html',
	'htm',
]);

/** Extensions that require the MinerU-HTML model. */
export const HTML_EXTENSIONS: ReadonlySet<string> = new Set(['html', 'htm']);

/**
 * The model actually used for a given file.
 *
 * MinerU accepts HTML input ONLY on the `MinerU-HTML` model
 * (docs/01-API文档理解.md — "HTML 文件必须使用 MinerU-HTML 模型"), so an HTML
 * file converted with the user's configured `vlm` / `pipeline` model would be
 * rejected server-side with an unrelated-looking error. We switch per file and
 * tell the user, instead of failing.
 */
export function resolveModelVersion(
	configured: ModelVersion,
	fileName: string,
): ModelVersion {
	const dot = fileName.lastIndexOf('.');
	const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
	return HTML_EXTENSIONS.has(ext) ? 'MinerU-HTML' : configured;
}

/** MinerU API base URL. */
export const MINERU_BASE_URL = 'https://mineru.net';

/** Maximum allowed file size in bytes (MinerU hard limit). */
export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

/**
 * Maximum pages per PDF (MinerU hard limit, enforced during extraction).
 *
 * DocumentConverter splits anything longer into parts of at most this many
 * pages and merges the results, so a PDF above this limit is no longer a
 * dead end for the user.
 */
export const MAX_PAGES_PER_PDF = 200;

/** Recommended poll interval (seconds). */
export const DEFAULT_POLL_INTERVAL_SEC = 15;

/** Maximum total poll time per file (ms). 2 hours. */
export const MAX_POLL_TIME_MS = 2 * 60 * 60 * 1000;

/** Retry HTTP 429 with this delay (ms). */
export const HTTP_429_RETRY_MS = 65_000;

/**
 * Give up after this many 429 retries (~5 × 65 s). Retrying forever would keep
 * the task alive with no user feedback; failing with a clear message is better.
 */
export const HTTP_429_MAX_RETRIES = 5;

/** Plugin command IDs (kept stable, never rename after release). */
export const COMMAND_ID_CONVERT_FILE = 'mineru-convert-file';

/** `data_id` prefix used in single-file flow to identify our batch. */
export const SINGLE_FILE_DATA_ID = '0';