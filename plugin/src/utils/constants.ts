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

/** Recommended batch size under the 50/min rate-limit. */
export const DEFAULT_BATCH_SIZE = 40;

/** Recommended delay between batches (seconds) to respect rate limit. */
export const DEFAULT_BATCH_DELAY_SEC = 70;

/** Recommended poll interval (seconds). */
export const DEFAULT_POLL_INTERVAL_SEC = 15;

/** Maximum total poll time per file (ms). 2 hours. */
export const MAX_POLL_TIME_MS = 2 * 60 * 60 * 1000;

/** Retry HTTP 429 with this delay (ms). */
export const HTTP_429_RETRY_MS = 65_000;

/** Plugin command IDs (kept stable, never rename after release). */
export const COMMAND_ID_CONVERT_FILE = 'mineru-convert-file';

/**
 * Plugin ID — must match manifest.json `id`.
 *
 * Historical note: this stayed as `obsidian-mineru` (not `mineru-converter`)
 * through the v0.2 rename because the ID is how Obsidian looks up the
 * installed plugin folder under `<vault>/.obsidian/plugins/<ID>/`. Changing
 * the ID would force every existing user to re-enable the plugin and re-enter
 * their API token. The repository + development folder are renamed to
 * `obsidian-mineru-converter`; the ID intentionally lags behind.
 */
export const PLUGIN_ID = 'obsidian-mineru';

/** `data_id` prefix used in single-file flow to identify our batch. */
export const SINGLE_FILE_DATA_ID = '0';