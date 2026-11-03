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
		// test/ is the offline verification harness (Node too; it prints to
		// console on purpose and is not part of the shipped plugin).
		ignores: [
			'main.js',
			'node_modules/**',
			'scripts/**',
			'hooks/**',
			'test/**',
			'esbuild.config.mjs',
			'version-bump.mjs',
			// version-sync.mjs / version-sync.d.mts 是发版脚本的纯逻辑与
			// 它的类型声明：Node 侧工具，不进 Obsidian 运行时。
			// .d.mts 尤其要排除 —— 它的类型感知规则需要 program 信息，
			// 而本仓库的 tsconfig 只 include 了 src/**/*.ts。
			'version-sync.mjs',
			'version-sync.d.mts',
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
