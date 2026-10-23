import { Modal } from 'obsidian';
import { t } from '../i18n/helpers';

export type ConflictChoice = 'overwrite' | 'skip' | 'cancel';

/**
 * Asks the user what to do when a sibling `.md` already exists. Returns a
 * Promise resolving to the user's choice.
 */
export class ConflictModal extends Modal {
	private resolver?: (choice: ConflictChoice) => void;
	private choice: ConflictChoice = 'cancel';

	constructor(
		app: ConstructorParameters<typeof Modal>[0],
		private readonly mdPath: string,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(t('conflictTitle'));

		contentEl.createEl('p', { text: t('conflictDesc')(this.mdPath) });

		// Show the path in a code-like block for easy copying.
		const codeBlock = contentEl.createEl('pre', { cls: 'mineru-conflict-path' });
		codeBlock.setText(this.mdPath);

		// Button row
		const row = contentEl.createDiv({ cls: 'mineru-actions' });

		const overwriteBtn = row.createEl('button', {
			text: t('conflictOverwrite'),
			cls: 'mod-warning',
		});
		overwriteBtn.addEventListener('click', () => this.resolve('overwrite'));

		const skipBtn = row.createEl('button', { text: t('conflictSkip') });
		skipBtn.addEventListener('click', () => this.resolve('skip'));

		const cancelBtn = row.createEl('button', { text: t('conflictCancel') });
		cancelBtn.addEventListener('click', () => this.resolve('cancel'));

		// Default focus on overwrite.
		overwriteBtn.focus();
	}

	onClose(): void {
		// Covers both the button path (resolve -> close) and dismissal via X.
		this.settle(this.choice);
		this.contentEl.empty();
	}

	private resolve(choice: ConflictChoice): void {
		this.choice = choice;
		this.settle(choice);
		this.close();
	}

	/** Resolve the pending promise exactly once. */
	private settle(choice: ConflictChoice): void {
		const r = this.resolver;
		this.resolver = undefined;
		r?.(choice);
	}

	/** Public API used by callers; resolves with the user's choice. */
	waitForChoice(): Promise<ConflictChoice> {
		return new Promise<ConflictChoice>((resolve) => {
			this.resolver = resolve;
		});
	}
}