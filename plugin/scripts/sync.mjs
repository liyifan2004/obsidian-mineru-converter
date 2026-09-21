#!/usr/bin/env node
/**
 * sync.mjs — copy plugin build artifacts to the live Obsidian vault.
 *
 * Behavior:
 *   1. Resolve target directory in this priority order:
 *      a. CLI flag:           node sync.mjs --to "D:\path\to\vault\plugins\obsidian-mineru"
 *      b. Env var:            OBSIDIAN_PLUGINS_DIR=...
 *      c. Saved config:       plugin/scripts/sync-config.json  ({ "pluginsDir": "..." })
 *      d. Default (Windows):  D:\MyNotes\学-习\.obsidian\plugins\obsidian-mineru
 *
 *   2. Copy plugin/main.js, plugin/manifest.json, plugin/styles.css to target.
 *   3. Print a summary: which files were copied, sizes, and the final target path.
 *
 * Non-destructive: it overwrites the 3 files only; it does NOT delete anything in target.
 *
 * Usage:
 *   node scripts/sync.mjs                         # use default / saved target
 *   node scripts/sync.mjs --to "D:\other\vault\...\.obsidian\plugins\obsidian-mineru"
 *
 * First-time setup with a custom path:
 *   node scripts/sync.mjs --to "D:\other\path"    # this saves it to sync-config.json
 *   node scripts/sync.mjs                         # future runs use the saved path
 */

import { copyFile, mkdir, stat, access, constants } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const FILES = ['main.js', 'manifest.json', 'styles.css'];

const DEFAULT_TARGET = process.platform === 'win32'
	? 'D:\\MyNotes\\学-习\\.obsidian\\plugins\\obsidian-mineru'
	: null;
const CONFIG_FILE = join(__dirname, 'sync-config.json');

function log(level, msg) {
	const tag = { info: '·', ok: '✓', warn: '⚠', err: '✗' }[level] ?? '·';
	console.log(`${tag} ${msg}`);
}

function parseArgs(argv) {
	const out = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--to' && argv[i + 1]) { out.to = argv[++i]; }
		else if (a.startsWith('--to=')) { out.to = a.slice('--to='.length); }
		else if (a === '--help' || a === '-h') { out.help = true; }
	}
	return out;
}

async function loadSavedTarget() {
	try {
		const cfg = await import('node:fs/promises').then(m => m.readFile(CONFIG_FILE, 'utf8'));
		const j = JSON.parse(cfg);
		return j?.pluginsDir || null;
	} catch {
		return null;
	}
}

async function saveTarget(to) {
	const cfg = { pluginsDir: to, savedAt: new Date().toISOString() };
	const { writeFile } = await import('node:fs/promises');
	await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function resolveTarget(cliTo) {
	if (cliTo) return cliTo;
	if (process.env.OBSIDIAN_PLUGINS_DIR) return process.env.OBSIDIAN_PLUGINS_DIR;
	return null; // caller will fallback to saved / default synchronously
}

async function ensureSource(file) {
	const src = join(PLUGIN_ROOT, file);
	try {
		await access(src, constants.R_OK);
		return src;
	} catch {
		throw new Error(
			`Source file missing: ${src}\n` +
			`Run \`npm run build\` first to produce main.js, then re-run sync.`
		);
	}
}

async function copyOne(src, dst) {
	await mkdir(dirname(dst), { recursive: true });
	await copyFile(src, dst);
	const [srcStat, dstStat] = await Promise.all([stat(src), stat(dst)]);
	return { src, dst, size: dstStat.size };
}

function fmtBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
	const args = parseArgs(process.argv);
	if (args.help) {
		console.log('Usage: node scripts/sync.mjs [--to "<vault>/.obsidian/plugins/obsidian-mineru"]');
		process.exit(0);
	}

	// 1. Resolve target
	let target = resolveTarget(args.to);
	if (!target) {
		const saved = await loadSavedTarget();
		target = saved ?? DEFAULT_TARGET;
	}
	if (!target) {
		log(
			'err',
			'No target vault configured. Pass --to "<vault>/.obsidian/plugins/obsidian-mineru" ' +
				'or set OBSIDIAN_PLUGINS_DIR.',
		);
		process.exit(1);
	}

	// 2. If a --to was passed, persist it for future runs
	if (args.to && (await loadSavedTarget()) !== args.to) {
		await saveTarget(args.to);
		log('info', `Saved target → ${CONFIG_FILE}`);
	}

	log('info', `Plugin root : ${PLUGIN_ROOT}`);
	log('info', `Target      : ${target}`);
	log('info', `Files       : ${FILES.join(', ')}`);

	// 3. Sanity-check destination parent dir looks like an Obsidian plugin folder
	const parent = dirname(target);
	if (!existsSync(parent)) {
		log('warn', `Parent does not exist yet — will create: ${parent}`);
	}
	if (!existsSync(target)) {
		log('info', `Creating plugin dir: ${target}`);
		await mkdir(target, { recursive: true });
	}

	// 4. Copy each file
	let okCount = 0;
	for (const f of FILES) {
		try {
			const src = await ensureSource(f);
			const dst = join(target, f);
			const r = await copyOne(src, dst);
			log('ok', `${f.padEnd(14)} ${fmtBytes(r.size).padStart(8)}  →  ${dst}`);
			okCount++;
		} catch (e) {
			log('err', `${f}: ${e.message}`);
		}
	}

	// 5. Summary
	console.log('');
	if (okCount === FILES.length) {
		log('ok', `Sync complete (${okCount}/${FILES.length} files). Open / reload Obsidian to see changes.`);
		process.exit(0);
	} else {
		log('err', `Sync partial: ${okCount}/${FILES.length} files copied.`);
		process.exit(1);
	}
}

main().catch((e) => {
	log('err', e.stack || e.message || String(e));
	process.exit(1);
});