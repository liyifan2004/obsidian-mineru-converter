// English (en) — base language. All keys defined here; other locales only override values.

export default {
	// Plugin metadata
	pluginName: 'MinerU Converter',
	pluginDesc:
		'Right-click any PDF / Word / PPT / Excel / image in your vault and convert it to Markdown via the MinerU accurate-parse API.',

	// File menu / command palette
	menuConvertFile: 'Convert to Markdown via MinerU',
	cmdConvertFile: 'Convert to Markdown via MinerU',
	cmdConvertFileTooltip: 'Convert the selected file to Markdown using MinerU',

	// Errors / notices
	noApiToken:
		'MinerU: API Token is not set. Open Settings → Community plugins → MinerU Converter to add your token.',
	unsupportedFileType:
		'MinerU: this file type is not supported for conversion.',
	fileNotFound: 'MinerU: file not found — has it been deleted?',
	fileTooLarge: (sizeMB: string) =>
		`MinerU: file is ${sizeMB} MB, which exceeds the 200 MB limit.`,

	// Page-limit (MinerU's hard 200-page cap) messages
	pdfPageLimitUnsplittable:
		'This PDF exceeds MinerU\'s 200-page limit and the plugin could not split it locally (the file may be encrypted, permission-protected, or malformed). Please decrypt or split it manually, then try again.',
	pdfPageLimitAutoSplitOff:
		'This PDF exceeds MinerU\'s 200-page limit. Turn on "Auto-split oversized PDFs" under Settings → MinerU Converter, or split the file manually.',
	pdfPageLimitMismatch:
		'The plugin counted fewer than 200 pages, but MinerU still rejected the file as too long. Please split it manually and try again.',
	nonPdfPageLimit:
		'This file (Word / PPT / Excel) exceeds MinerU\'s 200-page limit once converted. The plugin can only split PDFs — please convert it to PDF first.',
	partFailed: (partIndex: number, partTotal: number, msg: string) =>
		`Part ${partIndex}/${partTotal} failed, so the conversion was aborted (no incomplete Markdown was written): ${msg}`,

	// Conflict modal
	conflictTitle: 'Markdown file already exists',
	conflictDesc: (mdPath: string) =>
		`A Markdown file already exists at:\n${mdPath}\n\nWhat do you want to do?`,
	conflictOverwrite: 'Overwrite',
	conflictSkip: 'Skip',
	conflictCancel: 'Cancel',

	// Progress modal
	progressTitle: 'Converting via MinerU',
	progressInspecting: 'Checking the PDF page count…',
	progressSplitting: (done: number, total: number) =>
		`Splitting the PDF — part ${done}/${total}…`,
	progressSplitDetail: (pages: number, parts: number) =>
		`${pages} pages in total — parsing ${parts} parts and merging them into one file`,
	progressSubmitting: 'Submitting task to MinerU…',
	progressUploading: (fileName: string) => `Uploading ${fileName}…`,
	progressPolling: (current: number, total: number, elapsed: string) =>
		`MinerU is parsing — ${current}/${total} done (${elapsed} elapsed)`,
	progressPollingChunk: (
		current: number,
		total: number,
		elapsed: string,
		chunkIndex: number,
		chunkTotal: number,
	) =>
		`MinerU is parsing — part ${chunkIndex}/${chunkTotal}, ${current}/${total} done (${elapsed} elapsed)`,
	progressDownloading: 'Downloading result…',
	progressExtracting: 'Extracting Markdown and images from archive…',
	progressMerging: 'Merging the parts…',
	progressPartOf: (index: number, total: number) => `Part ${index}/${total}`,
	progressPartDone: (index: number, total: number) =>
		`Part ${index}/${total} done, continuing…`,
	progressSaving: 'Saving Markdown to vault…',
	progressDone: (mdPath: string) => `Done! Saved as ${mdPath}`,
	progressDoneMerged: (mdPath: string, parts: number) =>
		`Done! Merged ${parts} parts and saved as ${mdPath}`,
	progressFailed: (errMsg: string) => `Failed: ${errMsg}`,
	progressCancelled: 'Cancelled',
	progressCancel: 'Cancel',
	progressClose: 'Close',
	progressOpenResult: 'Open Markdown',
	progressBackground: 'Run in background',
	progressBackgroundRunning: 'Running in background',
	progressBackgroundHint: 'A notification will appear when it finishes.',
	progressSingleHint:
		'Tip: for many files, use a Python script (see README) — the right-click flow is for one-off conversions.',

	// Background-mode Notices
	bgDoneNotice: (mdPath: string) => `✅ MinerU conversion done: ${mdPath}`,
	bgDoneOpenedNotice: (mdPath: string) => `✅ Opened: ${mdPath}`,
	bgFailedNotice: (errMsg: string) => `❌ MinerU conversion failed: ${errMsg}`,

	// Settings
	settingsTitle: 'MinerU Converter',
	settingsTokenName: 'API Token',
	settingsTokenDesc:
		'Get your token at https://mineru.net/apiManage/apiManage. Stored locally in this vault only.',
	settingsTokenPlaceholder: 'eyJ0eXAiOiJKV1Qi...',
	settingsModelName: 'Model version',
	settingsModelDesc:
		'vlm = recommended (highest accuracy). pipeline = legacy default. MinerU-HTML = required for HTML files.',
	settingsLanguageName: 'Document language',
	settingsLanguageDesc:
		'Language hint for OCR. ch = Chinese + English (most common).',
	settingsFormulaName: 'Recognize formulas',
	settingsFormulaDesc:
		'Enable math-formula recognition (LaTeX-style output). For vlm, this only affects inline formulas.',
	settingsTableName: 'Recognize tables',
	settingsTableDesc: 'Enable table structure recognition (Markdown tables).',
	settingsAutoSplitName: 'Auto-split oversized PDFs (over 200 pages)',
	settingsAutoSplitDesc:
		'When on: a PDF longer than 200 pages is split into 200-page parts, each part is parsed by MinerU, and the results are merged back into one Markdown file (all images share a single images/ folder). The merged file looks exactly like a non-split conversion. When off, an oversized PDF fails with an error.',
	settingsTestConnection: 'Test connection',
	settingsTestOk: 'Token looks valid.',
	settingsTestFail: (msg: string) => `Token check failed: ${msg}`,
	settingsHintTitle: 'How to use',
	settingsHintBody:
		'1. Paste your token above and click "Test connection".\n2. Right-click any supported file (PDF / Word / PPT / Excel / image) in the file explorer.\n3. Choose "Convert to Markdown via MinerU".\n4. The new .md file appears next to the original; you will be asked if you want to open it.',

	// Model options
	modelVlm: 'vlm (recommended)',
	modelPipeline: 'pipeline (default)',
	modelHtml: 'MinerU-HTML (HTML files only)',

	// Language options
	langCh: 'ch — Chinese + English',
	langEn: 'en — English',
	langChServer: 'ch_server — incl. Japanese',
	langJapan: 'japan — Japanese',
	langKorean: 'korean — Korean',
	langLatin: 'latin — European languages',
	langChineseCht: 'chinese_cht — Traditional Chinese',

	// API error code messages (best-effort mapping for common ones)
	apiErrA0202: 'Token is invalid. Please re-check your API token.',
	apiErrA0211: 'Token expired. Please generate a new one at mineru.net.',
	apiErr60005: 'File exceeds the 200 MB size limit.',
	apiErr60006:
		'File exceeds MinerU\'s 200-page limit. For a PDF, turn on "Auto-split oversized PDFs" or split the file manually.',
	apiErr60007: 'MinerU model service is temporarily unavailable. Please retry.',
	apiErr60009: 'MinerU task queue is full. Please wait a moment and retry.',
	apiErr60018: 'Daily quota exceeded (1000 pages). Try again tomorrow.',
	apiErrRateLimit:
		'Rate limited (HTTP 429). The plugin will automatically retry.',
	apiErrGeneric: (code: string | number, msg: string) =>
		`MinerU API error [${code}]: ${msg}`,
};