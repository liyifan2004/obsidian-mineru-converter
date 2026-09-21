import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type MinerUConverterPlugin from './main';
import { t } from './i18n/helpers';
import { MinerUClient } from './api/MinerUClient';
import type { LanguageCode, ModelVersion } from './api/types';

export interface MinerUConverterSettings {
	apiToken: string;
	modelVersion: ModelVersion;
	language: LanguageCode;
	enableFormula: boolean;
	enableTable: boolean;
	/**
	 * Split PDFs longer than {@link MAX_PAGES_PER_PDF} into parts, convert each
	 * part, and merge the Markdown back into one file.
	 */
	autoSplitLargePdf: boolean;
}

export const DEFAULT_SETTINGS: MinerUConverterSettings = {
	apiToken: '',
	modelVersion: 'vlm',
	language: 'ch',
	enableFormula: true,
	enableTable: true,
	autoSplitLargePdf: true,
};

export class MinerUConverterSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: MinerUConverterPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Heading
		new Setting(containerEl)
			.setName(t('settingsTitle'))
			.setHeading();

		// How-to hint
		new Setting(containerEl)
			.setName(t('settingsHintTitle'))
			.setDesc(t('settingsHintBody'));

		// API Token
		new Setting(containerEl)
			.setName(t('settingsTokenName'))
			.setDesc(t('settingsTokenDesc'))
			.addText((text) => {
				text
					.setPlaceholder(t('settingsTokenPlaceholder'))
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value.trim();
						await this.plugin.saveSettings();
					});
				// Mask by default; show toggle via input type.
				text.inputEl.type = 'password';
				text.inputEl.autocomplete = 'off';
				text.inputEl.spellcheck = false;
			})
			.addButton((button) =>
				button
					.setButtonText(t('settingsTestConnection'))
					.onClick(async () => {
						if (!this.plugin.settings.apiToken) {
							new Notice(t('noApiToken'));
							return;
						}
						button.setDisabled(true);
						button.setButtonText('…');
						const client = new MinerUClient(
							{
								token: this.plugin.settings.apiToken,
								modelVersion: this.plugin.settings.modelVersion,
								language: this.plugin.settings.language,
								enableFormula: this.plugin.settings.enableFormula,
								enableTable: this.plugin.settings.enableTable,
							},
							this.app.vault,
						);
						const { ok, message } = await client.testConnection();
						button.setDisabled(false);
						button.setButtonText(t('settingsTestConnection'));
						new Notice(message, ok ? 4000 : 8000);
					}),
			);

		// Model version
		new Setting(containerEl)
			.setName(t('settingsModelName'))
			.setDesc(t('settingsModelDesc'))
			.addDropdown((dd) =>
				dd
					.addOption('vlm', t('modelVlm'))
					.addOption('pipeline', t('modelPipeline'))
					.addOption('MinerU-HTML', t('modelHtml'))
					.setValue(this.plugin.settings.modelVersion)
					.onChange(async (value) => {
						this.plugin.settings.modelVersion = value as ModelVersion;
						await this.plugin.saveSettings();
					}),
			);

		// Language
		new Setting(containerEl)
			.setName(t('settingsLanguageName'))
			.setDesc(t('settingsLanguageDesc'))
			.addDropdown((dd) => {
				dd.addOption('ch', t('langCh'))
					.addOption('en', t('langEn'))
					.addOption('ch_server', t('langChServer'))
					.addOption('japan', t('langJapan'))
					.addOption('korean', t('langKorean'))
					.addOption('latin', t('langLatin'))
					.addOption('chinese_cht', t('langChineseCht'))
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value;
						await this.plugin.saveSettings();
					});
			});

		// Formula
		new Setting(containerEl)
			.setName(t('settingsFormulaName'))
			.setDesc(t('settingsFormulaDesc'))
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.enableFormula)
					.onChange(async (value) => {
						this.plugin.settings.enableFormula = value;
						await this.plugin.saveSettings();
					}),
			);

		// Table
		new Setting(containerEl)
			.setName(t('settingsTableName'))
			.setDesc(t('settingsTableDesc'))
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.enableTable)
					.onChange(async (value) => {
						this.plugin.settings.enableTable = value;
						await this.plugin.saveSettings();
					}),
			);

		// Auto-split oversized PDFs
		new Setting(containerEl)
			.setName(t('settingsAutoSplitName'))
			.setDesc(t('settingsAutoSplitDesc'))
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.autoSplitLargePdf)
					.onChange(async (value) => {
						this.plugin.settings.autoSplitLargePdf = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}