// ESLint flat config (ESLint 9).
//
// The heavy lifting is done by eslint-plugin-obsidianmd's `recommended` preset:
// it brings its own parser, browser + Obsidian globals, and the type-checked
// typescript-eslint ruleset. We only have to point it at a tsconfig so the
// type-aware rules actually have program information.
//
// Run with: npm run lint

import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
	{
		// `main.js` is the esbuild bundle (generated). scripts/, hooks/ and the
		// two *.mjs files are Node build tooling — they run on the developer's
		// machine, never inside Obsidian, so the mobile-safety rules don't apply.
		ignores: [
			'main.js',
			'node_modules/**',
			'scripts/**',
			'hooks/**',
			'esbuild.config.mjs',
			'version-bump.mjs',
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				// Type-aware rules need the program; projectService lets the
				// parser pick the right tsconfig per file automatically.
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// `console.*` is how this plugin's Logger works — it deliberately
			// routes everything through one place so users can mute it.
			'no-console': 'off',
		},
	},
	{
		// The Logger is the single sanctioned console entry point. Obsidian's
		// "avoid unnecessary logging" guideline targets scattered console calls;
		// this project has exactly one, and it exists to be muzzled centrally.
		files: ['src/utils/logger.ts'],
		rules: {
			'obsidianmd/rule-custom-message': 'off',
		},
	},
	{
		// pdfSplitter must stay runnable in plain Node — `.workbuddy/scratch/`
		// bundles it to verify the split byte-for-byte, where `window` does not
		// exist. Popout-window timer compatibility is irrelevant for a module
		// that never touches the DOM.
		files: ['src/utils/pdfSplitter.ts'],
		rules: {
			'obsidianmd/prefer-window-timers': 'off',
		},
	},
]);
