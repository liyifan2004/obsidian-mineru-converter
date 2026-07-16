import { Modal, TFile } from 'obsidian';
import { MinerUClient, MinerUError, localizeApiError } from '../api/MinerUClient';
import { t } from '../i18n/helpers';
import type { MinerUConverterSettings } from '../settings';
import type { ProgressUpdate } from '../api/types';

/** User actions returned by the progress modal at the end. */
export type ProgressOutcome =
	| { kind: 'done'; mdPath: string }
	| { kind: 'failed'; errMsg: string }
	| { kind: 'cancelled' };

/**
 * Modal showing the live status of a single-file conversion. Uses simple DOM
 * nodes (no third-party UI library) and follows Obsidian's CSS variables so
 * it adapts to the user's theme.
 */
export class ProgressModal extends Modal {
	private readonly file: TFile;
	private readonly settings: MinerUConverterSettings;
	private readonly vault = this.app.vault;

	/** set to true once a terminal outcome is reached; the user can then close. */
	private terminal = false;
	private cancelled = false;
	private abortController: AbortController | null = null;

	// UI references (assigned in onOpen)
	private statusEl!: HTMLDivElement;
	private detailEl!: HTMLDivElement;
	private actionsEl!: HTMLDivElement;
	private progressEl!: HTMLDivElement;
	private progressBarEl!: HTMLDivElement;
	private closeBtn!: HTMLButtonElement;
	private openBtn!: HTMLButtonElement;
	private cancelBtn!: HTMLButtonElement;
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

		this.cancelBtn = this.actionsEl.createEl('button', {
			text: t('progressCancel'),
			cls: 'mod-warning',
		});
		this.cancelBtn.addEventListener('click', () => this.handleCancel());

		this.openBtn = this.actionsEl.createEl('button', {
			text: t('progressOpenResult'),
			cls: 'mod-cta',
		});
		this.openBtn.style.display = 'none';
		this.openBtn.addEventListener('click', () => this.handleOpenResult());

		this.closeBtn = this.actionsEl.createEl('button', {
			text: t('progressClose'),
		});
		this.closeBtn.style.display = 'none';
		this.closeBtn.addEventListener('click', () => this.close());

		// Hint
		this.hintEl = contentEl.createDiv({ cls: 'mineru-hint setting-item-description' });
		this.hintEl.setText(t('progressSingleHint'));

		// Kick off the work.
		void this.runConversion();
	}

	onClose(): void {
		// If user closes mid-flight via X, cancel the underlying work.
		if (!this.terminal) {
			this.cancelled = true;
			this.abortController?.abort();
		}
		this.contentEl.empty();
	}

	// ---------- logic ----------

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
			const { mdContent } = await client.convertSingleFile(this.file, {
				onProgress: (u) => this.renderProgress(u),
				signal: this.abortController.signal,
			});

			// Determine sibling .md path
			const mdPath = this.computeSiblingMdPath(this.file);

			// Detect conflict and prompt (but the modal is already open — we
			// can't open another modal on top easily. Instead we block the
			// progress modal until conflict is resolved). For simplicity in
			// v0.1 we just overwrite if exists; the caller (convertFile
			// command) handles the conflict prompt *before* opening this modal.
			await this.vault.create(mdPath, mdContent);

			this.handleDone(mdPath);
		} catch (err) {
			if (this.cancelled) {
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

	private handleDone(mdPath: string): void {
		this.terminal = true;
		this.statusEl.setText(t('progressDone')(mdPath));
		this.detailEl.setText(mdPath);
		this.setProgress(1);
		this.statusEl.addClass('is-success');
		this.cancelBtn.style.display = 'none';
		this.closeBtn.style.display = '';
		this.openBtn.style.display = '';
		this.openBtn.dataset.mdPath = mdPath;
	}

	private handleFailed(errMsg: string): void {
		this.terminal = true;
		this.statusEl.setText(t('progressFailed')(errMsg));
		this.detailEl.setText('');
		this.setProgress(null);
		this.statusEl.addClass('is-error');
		this.cancelBtn.style.display = 'none';
		this.closeBtn.style.display = '';
		this.openBtn.style.display = 'none';
	}

	private handleCancelled(): void {
		this.terminal = true;
		this.statusEl.setText(t('progressCancel') + '…');
		this.detailEl.setText('');
		this.cancelBtn.style.display = 'none';
		this.closeBtn.style.display = '';
		this.openBtn.style.display = 'none';
	}

	private handleCancel(): void {
		this.cancelled = true;
		this.abortController?.abort();
		this.cancelBtn.disabled = true;
	}

	private handleOpenResult(): void {
		const mdPath = this.openBtn.dataset.mdPath;
		if (!mdPath) return;
		const leaf = this.app.workspace.getLeaf();
		void leaf.openFile(this.vault.getAbstractFileByPath(mdPath) as never);
	}

	/** Returns the sibling .md path for a given TFile (e.g. foo.pdf -> foo.md). */
	private computeSiblingMdPath(file: TFile): string {
		const noExt = file.path.replace(/\.[^./\\]+$/, '');
		return `${noExt}.md`;
	}

	private setProgress(ratio: number | null): void {
		if (ratio == null) {
			// Indeterminate
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