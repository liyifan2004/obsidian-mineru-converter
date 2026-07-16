import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MinerUConverterSettingTab,
	type MinerUConverterSettings,
} from './settings';
import { registerConvertFileCommand } from './commands/convertFile';

const PLUGIN_VIEW_TYPE = 'obsidian-mineru-view'; // reserved for future use

export default class MinerUConverterPlugin extends Plugin {
	settings!: MinerUConverterSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Settings tab
		this.addSettingTab(new MinerUConverterSettingTab(this.app, this));

		// Right-click menu + command palette
		registerConvertFileCommand(this);

		// Reserved view type registration hook (no-op for v0.1).
		void PLUGIN_VIEW_TYPE;
	}

	onunload(): void {
		// Obsidian auto-cleans up registered events, intervals, and DOM
		// listeners — nothing else to do here.
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MinerUConverterSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}