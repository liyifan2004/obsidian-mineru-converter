import { Menu, Notice, TAbstractFile, TFile } from 'obsidian';
import type MinerUConverterPlugin from '../main';
import { COMMAND_ID_CONVERT_FILE, SUPPORTED_EXTENSIONS } from '../utils/constants';
import { t } from '../i18n/helpers';
import { ProgressModal } from '../ui/ProgressModal';
import { ConflictModal } from '../ui/ConflictModal';
import { Logger } from '../utils/logger';

const log = new Logger('convertFile');

/**
 * True if this file's extension is in the MinerU supported set. Case-insensitive.
 */
export function isSupportedFile(file: TAbstractFile): file is TFile {
	if (!(file instanceof TFile)) return false;
	const ext = file.extension.toLowerCase();
	return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Returns the sibling .md path for a given TFile, e.g. "notes/foo.pdf" -> "notes/foo.md".
 */
export function siblingMdPath(file: TFile): string {
	return file.path.replace(/\.[^./\\]+$/, '') + '.md';
}

/**
 * Register the right-click menu item on supported files + the same action as
 * a command palette entry.
 */
export function registerConvertFileCommand(plugin: MinerUConverterPlugin): void {
	// 1. File menu (right-click in file explorer / tabs)
	plugin.registerEvent(
		plugin.app.workspace.on(
			'file-menu',
			(menu: Menu, file: TAbstractFile) => {
				if (!isSupportedFile(file)) return;
				menu.addItem((item) => {
					item
						.setTitle(t('menuConvertFile'))
						.setIcon('file-text')
						.onClick(async () => {
							await runConvert(plugin, file);
						});
				});
			},
		),
	);

	// 2. Command palette — same action, but the user must have a file open
	//    (we resolve the active file from any leaf).
	plugin.addCommand({
		id: COMMAND_ID_CONVERT_FILE,
		name: t('cmdConvertFile'),
		checkCallback: (checking: boolean) => {
			// Find any TFile in any leaf that we can convert.
			const file = findActiveSupportedFile(plugin);
			if (!file) return false;
			if (!checking) {
				void runConvert(plugin, file);
			}
			return true;
		},
	});
}

/**
 * Try to find the currently focused file. Walks all workspace leaves and
 * returns the first supported TFile. Returns null if nothing usable.
 */
function findActiveSupportedFile(
	plugin: MinerUConverterPlugin,
): TFile | null {
	// Most likely: active file in markdown view.
	const activeFile = plugin.app.workspace.getActiveFile();
	if (activeFile && isSupportedFile(activeFile)) return activeFile;

	// Fallback: most recently used leaf.
	const lastMruLeaf = plugin.app.workspace.getMostRecentLeaf();
	if (lastMruLeaf) {
		const view = lastMruLeaf.view;
		// MarkdownView and others expose `file` getter.
		const f = (view as unknown as { file?: TFile }).file;
		if (f && isSupportedFile(f)) return f;
	}
	return null;
}

/**
 * The actual conversion flow: token check -> optional conflict prompt ->
 * progress modal.
 */
async function runConvert(
	plugin: MinerUConverterPlugin,
	file: TFile,
): Promise<void> {
	if (!plugin.settings.apiToken) {
		new Notice(t('noApiToken'), 8000);
		return;
	}

	// Check sibling .md existence
	const mdPath = siblingMdPath(file);
	const adapter = plugin.app.vault.adapter;
	const exists = await adapter.exists(mdPath);

	if (exists) {
		const conflict = new ConflictModal(plugin.app, mdPath);
		conflict.open();
		const choice = await conflict.waitForChoice();
		if (choice === 'cancel') {
			log.info('User cancelled due to conflict on', mdPath);
			return;
		}
		if (choice === 'skip') {
			new Notice(`MinerU: skipped (${mdPath} already exists)`, 4000);
			return;
		}
		// choice === 'overwrite' → continue
	}

	// Open progress modal; it handles the actual work + file writing.
	new ProgressModal(plugin.app, file, plugin.settings).open();
}