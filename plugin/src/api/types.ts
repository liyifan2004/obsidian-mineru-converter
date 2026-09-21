/**
 * MinerU API type definitions, based on
 * https://mineru.net/apiManage/docs (v4 API).
 */

export type ModelVersion = 'pipeline' | 'vlm' | 'MinerU-HTML';

export type LanguageCode =
	| 'ch'
	| 'ch_server'
	| 'en'
	| 'japan'
	| 'korean'
	| 'chinese_cht'
	| 'latin'
	| (string & {});

export interface MinerUConfig {
	token: string;
	modelVersion: ModelVersion;
	language: LanguageCode;
	enableFormula: boolean;
	enableTable: boolean;
}

/** Response shape from POST /file-urls/batch */
export interface SubmitBatchResponse {
	batch_id: string;
	file_urls: string[];
}

/** Single file's status from GET /extract-results/batch/{batch_id} */
export interface ExtractResultItem {
	file_name: string;
	state: 'pending' | 'running' | 'converting' | 'done' | 'failed' | (string & {});
	err_msg?: string;
	full_zip_url?: string;
	data_id?: string;
	extract_progress?: {
		extracted_pages: number;
		total_pages: number;
		start_time: string;
	};
}

export interface BatchResultsResponse {
	batch_id: string;
	extract_result: ExtractResultItem[];
}

/** Generic API envelope. */
export interface ApiResponse<T> {
	/** MinerU returns both string codes ("A0202") and numeric codes (-60005). */
	code: number | string;
	data?: T;
	msg?: string;
	trace_id?: string;
}

/** Progress phase emitted by MinerUClient / DocumentConverter. */
export type ProgressPhase =
	/** Local: counting pages and deciding whether the PDF must be split. */
	| 'inspecting'
	/** Local: writing the split PDF parts. */
	| 'splitting'
	| 'submitting'
	| 'uploading'
	| 'parsing'
	| 'downloading'
	| 'extracting'
	/** Local: stitching the parts' Markdown back together. */
	| 'merging'
	| 'saving'
	| 'done'
	| 'failed'
	| 'cancelled';

/**
 * Which part of a split conversion is being processed. Only present when the
 * source file had to be split (PDF > 200 pages). 1-based.
 */
export interface ChunkProgress {
	index: number;
	total: number;
}

export interface ProgressUpdate {
	phase: ProgressPhase;
	/** Optional human-readable detail; UI may overwrite with i18n. */
	message?: string;
	/** Number of files done so far (parsing only). */
	current?: number;
	/** Total files in batch (parsing only). */
	total?: number;
	/** Elapsed time in ms (parsing only). */
	elapsedMs?: number;
	/** Set when the conversion was split into multiple parts. */
	chunk?: ChunkProgress;
	/** Total page count of the source PDF (inspecting/splitting only). */
	pages?: number;
	/** Set when phase === 'failed'. */
	errMsg?: string;
	/** Set when phase === 'done'. */
	mdPath?: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export interface ConvertOptions {
	onProgress?: ProgressCallback;
	signal?: AbortSignal;
}