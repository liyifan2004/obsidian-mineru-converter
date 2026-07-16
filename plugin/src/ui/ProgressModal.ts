import { Modal, Notice, TFile } from 'obsidian';
import { MinerUClient, MinerUError, localizeApiError } from '../api/MinerUClient';
import { t } from '../i18n/helpers';
import type { MinerUConverterSettings } from '../settings';
import type { ProgressUpdate } from '../api/types';

type Mode = 'foreground' | 'background';

/**
 * Modal showing the live status of a single-file conversion. Uses simple DOM
 * nodes (no third-party UI library) and follows Obsidian's CSS variables so
 * it adapts to the user's theme.
 *
 * Lifecycle:
 *   1. User invokes "Convert to Markdown".
 *   2. runConversion() starts in the background of THIS modal.
 *   3a. If the modal is still open when the work finishes, it shows a
 *       "完成" screen with [打开 Markdown] [关闭] buttons.
 *   3b. If the user clicks [后台运行], the modal closes immediately and the
 *       conversion continues in the background; the user sees a Notice on
 *       completion (with [Open] [Dismiss] actions).
 *   3c. If the user clicks [取消] mid-flight, the work aborts and the modal
 *       closes immediately (no second confirmation screen).
 *   3d. If the user clicks [打开 Markdown], the new file opens and the modal
 *       closes automatically.
 *
 * onClose() only aborts the underlying work when:
 *   - We haven't reached a terminal state yet, AND
 *   - We are NOT in background mode (i.e. user dismissed the modal
 *     without explicitly handing off to background).
 */
export class ProgressModal extends Modal {
	private readonly file: TFile;
	private readonly settings: MinerUConverterSettings;
	private readonly vault = this.app.vault;

	private terminal = false;
	private mode: Mode = 'foreground';
	private abortController: AbortController | null = null;
	/** Promise that resolves when the conversion reaches a terminal state. */
	private workDone: Promise<void> = Promise.resolve();

	// UI references (assigned in onOpen)
	private statusEl!: HTMLDivElement;
	private detailEl!: HTMLDivElement;
	private actionsEl!: HTMLDivElement;
	private progressEl!: HTMLDivElement;
	private progressBarEl!: HTMLDivElement;
	private closeBtn!: HTMLButtonElement;
	private openBtn!: HTMLButtonElement;
	private cancelBtn!: HTMLButtonElement;
	private backgroundBtn!: HTMLButtonElement;
	private hintEl!: HTMLDivElement;

	constructor(
		app: ConstructorParameters<typeof Modal>[0],
		file: TFile,
		settings: MinerUConverterSettings,
	) {
		super(app);
		this.file = file;
		this.settings = settings;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(t('progressTitle'));

		// Status line — large, prominent
		this.statusEl = contentEl.createDiv({ cls: 'mineru-status' });
		this.statusEl.setText(t('progressSubmitting'));

		// Detail line — smaller, secondary
		this.detailEl = contentEl.createDiv({ cls: 'mineru-detail' });
		this.detailEl.setText(this.file.path);

		// Progress bar
		this.progressEl = contentEl.createDiv({ cls: 'mineru-progress' });
		this.progressBarEl = this.progressEl.createDiv({ cls: 'mineru-progress-bar' });
		this.progressBarEl.style.width = '0%';

		// Actions row
		this.actionsEl = contentEl.createDiv({ cls: 'mineru-actions' });

		// [Background] — left-aligned, secondary
		this.backgroundBtn = this.actionsEl.createEl('button', {
			text: t('progressBackground'),
		});
		this.backgroundBtn.addEventListener('click', () => this.handleBackground());

		// [Cancel] — primary negative action while in-flight
		this.cancelBtn = this.actionsEl.createEl('button', {
			text: t('progressCancel'),
			cls: 'mod-warning',
		});
		this.cancelBtn.addEventListener('click', () => this.handleCancel());

		// [Open Markdown] — hidden until done; primary CTA after success
		this.openBtn = this.actionsEl.createEl('button', {
			text: t('progressOpenResult'),
			cls: 'mod-cta',
		});
		this.openBtn.style.display = 'none';
		this.openBtn.addEventListener('click', () => this.handleOpenResult());

		// [Close] — hidden until terminal; appears for failed/cancelled
		this.closeBtn = this.actionsEl.createEl('button', {
			text: t('progressClose'),
		});
		this.closeBtn.style.display = 'none';
		this.closeBtn.addEventListener('click', () => this.close());

		// Hint
		this.hintEl = contentEl.createDiv({ cls: 'mineru-hint setting-item-description' });
		this.hintEl.setText(t('progressSingleHint'));

		// Kick off the work.
		this.workDone = this.runConversion();
	}

	onClose(): void {
		// Only abort if user dismissed the modal without handing off to
		// background AND we haven't already finished.
		if (this.mode !== 'background' && !this.terminal) {
			this.cancelled = false; // see handleCancel — flag is local there
			this.abortController?.abort();
		}
		this.contentEl.empty();
	}

	// ---------- logic ----------

	private cancelled = false;

	private async runConversion(): Promise<void> {
		this.abortController = new AbortController();

		const client = new MinerUClient(
			{
				token: this.settings.apiToken,
				modelVersion: this.settings.modelVersion,
				language: this.settings.language,
				enableFormula: this.settings.enableFormula,
				enableTable: this.settings.enableTable,
			},
			this.vault,
		);

		try {
			const { mdContent, images } = await client.convertSingleFile(this.file, {
				onProgress: (u) => this.renderProgress(u),
				signal: this.abortController.signal,
			});

			if (this.abortController.signal.aborted) {
				this.handleCancelled();
				return;
			}

			// Write the .md file (create or overwrite) and its images/ folder.
			const mdPath = this.computeSiblingMdPath(this.file);
			await this.writeResult(mdPath, mdContent, images);

			this.handleDone(mdPath);
		} catch (err) {
			if (this.cancelled || this.abortController.signal.aborted) {
				this.handleCancelled();
				return;
			}
			const msg =
				err instanceof MinerUError
					? localizeApiError(err)
					: err instanceof Error
						? err.message
						: String(err);
			this.handleFailed(msg);
		}
	}

	/**
	 * Write `foo.md` and `foo_images/` next to it. If `foo.md` already exists,
	 * overwrite it (the conflict modal upstream already asked the user).
	 * The `images/` folder is created if there are any images.
	 */
	private async writeResult(
		mdPath: string,
		mdContent: string,
		images: Map<string, ArrayBuffer>,
	): Promise<void> {
		const existing = this.vault.getAbstractFileByPath(mdPath);
		if (existing instanceof TFile) {
			await this.vault.modify(existing, mdContent);
		} else {
			await this.vault.create(mdPath, mdContent);
		}

		if (images.size === 0) return;

		const dirOfMd = mdPath.includes('/')
			? mdPath.slice(0, mdPath.lastIndexOf('/'))
			: '';
		const imagesDir = dirOfMd ? `${dirOfMd}/images` : 'images';

		// vault.adapter.mkdir is idempotent on Obsidian 1.5+
		const adapter = this.vault.adapter;
		if (!(await adapter.exists(imagesDir))) {
			await adapter.mkdir(imagesDir);
		}

		for (const [relPath, buf] of images) {
			const targetPath = `${imagesDir}/${relPath}`;
			// Ensure nested subdirs like `images/sub/foo.jpg` are created.
			const targetDir = targetPath.includes('/')
				? targetPath.slice(0, targetPath.lastIndexOf('/'))
				: '';
			if (targetDir && targetDir !== imagesDir && !(await adapter.exists(targetDir))) {
				await adapter.mkdir(targetDir);
			}
			await adapter.writeBinary(targetPath, buf);
		}
	}

	private renderProgress(u: ProgressUpdate): void {
		switch (u.phase) {
			case 'submitting':
				this.statusEl.setText(t('progressSubmitting'));
				this.detailEl.setText(this.file.path);
				this.setProgress(null);
				break;
			case 'uploading':
				this.statusEl.setText(t('progressUploading')(u.message ?? this.file.name));
				this.detailEl.setText(this.file.path);
				this.setProgress(null);
				break;
			case 'parsing': {
				const cur = u.current ?? 0;
				const tot = u.total ?? 1;
				const elapsed = formatElapsed(u.elapsedMs ?? 0);
				this.statusEl.setText(t('progressPolling')(cur, tot, elapsed));
				this.detailEl.setText(this.file.path);
				this.setProgress(cur / tot);
				break;
			}
			case 'downloading':
				this.statusEl.setText(t('progressDownloading'));
				this.setProgress(null);
				break;
			case 'extracting':
				this.statusEl.setText(t('progressExtracting'));
				this.setProgress(null);
				break;
			case 'saving':
				this.statusEl.setText(t('progressSaving'));
				this.setProgress(1);
				break;
			// done / failed / cancelled handled by their own methods
		}
	}

	// ---------- terminal-state handlers ----------

	private handleDone(mdPath: string): void {
		this.terminal = true;

		// Background mode: modal already closed. Notify instead of showing UI.
		if (this.mode === 'background') {
			this.notifyBackgroundComplete(mdPath, null);
			return;
		}

		this.statusEl.setText(t('progressDone')(mdPath));
		this.detailEl.setText(mdPath);
		this.setProgress(1);
		this.statusEl.addClass('is-success');
		this.cancelBtn.style.display = 'none';
		this.backgroundBtn.style.display = 'none';
		this.closeBtn.style.display = 'none'; // hidden — Open auto-closes
		this.openBtn.style.display = '';
		this.openBtn.dataset.mdPath = mdPath;
	}

	private handleFailed(errMsg: string): void {
		this.terminal = true;

		if (this.mode === 'background') {
			this.notifyBackgroundComplete(null, errMsg);
			return;
		}

		this.statusEl.setText(t('progressFailed')(errMsg));
		this.detailEl.setText('');
		this.setProgress(null);
		this.statusEl.addClass('is-error');
		this.cancelBtn.style.display = 'none';
		this.backgroundBtn.style.display = 'none';
		this.openBtn.style.display = 'none';
		this.closeBtn.style.display = '';
	}

	private handleCancelled(): void {
		this.terminal = true;

		if (this.mode === 'background') {
			// Nothing to notify — user already moved on.
			return;
		}

		this.statusEl.setText(t('progressCancelled'));
		this.detailEl.setText('');
		this.setProgress(null);
		this.statusEl.addClass('is-warning');
		this.cancelBtn.style.display = 'none';
		this.backgroundBtn.style.display = 'none';
		this.openBtn.style.display = 'none';
		this.closeBtn.style.display = '';
	}

	private async notifyBackgroundComplete(
		mdPath: string | null,
		errMsg: string | null,
	): Promise<void> {
		// Wait one tick so any in-flight Notices don't pile on top of each other.
		await Promise.resolve();

		if (errMsg) {
			const n = new Notice(t('bgFailedNotice')(errMsg), 0); // sticky
			// No interactive action — error details are in the modal (if it
			// were still open) or in the developer console.
			void n;
			return;
		}

		if (mdPath) {
			const file = this.vault.getAbstractFileByPath(mdPath);
			if (file instanceof TFile) {
				// No native "open on click" in Obsidian Notice; we open it
				// via the workspace immediately and just show a transient toast.
				const leaf = this.app.workspace.getLeaf();
				void leaf.openFile(file);
				new Notice(t('bgDoneOpenedNotice')(mdPath), 6000);
			} else {
				new Notice(t('bgDoneNotice')(mdPath), 6000);
			}
		}
	}

	// ---------- button handlers ----------

	private handleCancel(): void {
		this.cancelled = true;
		this.abortController?.abort();
		// Immediately close — no second confirmation page.
		this.close();
	}

	private handleBackground(): void {
		this.mode = 'background';
		this.statusEl.setText(t('progressBackgroundRunning'));
		this.detailEl.setText(t('progressBackgroundHint'));
		// Close the modal now; the work continues. onClose() will skip
		// aborting because this.mode === 'background'.
		this.close();
	}

	private handleOpenResult(): void {
		const mdPath = this.openBtn.dataset.mdPath;
		if (!mdPath) return;
		const file = this.vault.getAbstractFileByPath(mdPath);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf();
			void leaf.openFile(file);
		}
		// Auto-close so user lands directly on the new file.
		this.close();
	}

	/** Returns the sibling .md path for a given TFile (e.g. foo.pdf -> foo.md). */
	private computeSiblingMdPath(file: TFile): string {
		const noExt = file.path.replace(/\.[^./\\]+$/, '');
		return `${noExt}.md`;
	}

	private setProgress(ratio: number | null): void {
		if (ratio == null) {
			this.progressEl.addClass('is-indeterminate');
			this.progressBarEl.style.width = '100%';
			this.progressBarEl.classList.add('is-animating');
			return;
		}
		this.progressEl.removeClass('is-indeterminate');
		this.progressBarEl.classList.remove('is-animating');
		const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
		this.progressBarEl.style.width = `${pct}%`;
	}
}

function formatElapsed(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rs = s % 60;
	if (m < 60) return `${m}m${rs.toString().padStart(2, '0')}s`;
	const h = Math.floor(m / 60);
	const rm = m % 60;
	return `${h}h${rm.toString().padStart(2, '0')}m`;
}