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
		// Type-aware rules need the program; projectService lets the parser
		// pick the right tsconfig per file automatically.
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
]);
