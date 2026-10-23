#!/usr/bin/env node
/**
 * test/run.mjs — bundle and run the offline verification scripts.
 *
 *   node test/run.mjs                 # run every test/verify-*.ts
 *   node test/run.mjs verify-split    # run one of them
 *   node test/run.mjs verify-split -- <pdf-path>   # forward args to the test
 *
 * Why bundle first: the tests import TypeScript from src/ (and pdf-lib /
 * fflate from node_modules). esbuild produces one self-contained ESM file per
 * test in test/.build/, which plain `node` can then execute. No test
 * framework — the scripts print PASS/FAIL lines and set the exit code.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readdirSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(testDir, '.build');

const argv = process.argv.slice(2);
const sepIndex = argv.indexOf('--');
const forwardArgs = sepIndex >= 0 ? argv.slice(sepIndex + 1) : [];
const wanted = sepIndex >= 0 ? argv.slice(0, sepIndex) : argv;

const allTests = readdirSync(testDir)
	.filter((f) => /^verify-.*\.ts$/.test(f))
	.map((f) => f.replace(/\.ts$/, ''));
const tests = wanted.length > 0 ? wanted : allTests;

for (const name of tests) {
	if (!allTests.includes(name)) {
		console.error(`Unknown test "${name}". Available: ${allTests.join(', ')}`);
		process.exit(2);
	}
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let failed = 0;

for (const name of tests) {
	console.log(`\n=== ${name} ===`);
	await build({
		entryPoints: [join(testDir, `${name}.ts`)],
		outfile: join(outDir, `${name}.mjs`),
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node22',
		logLevel: 'warning',
	});

	const code = await new Promise((res) => {
		const child = spawn(process.execPath, [join(outDir, `${name}.mjs`), ...forwardArgs], {
			stdio: 'inherit',
		});
		child.on('exit', (c) => res(c ?? 1));
	});
	if (code !== 0) {
		failed++;
		console.error(`--- ${name} FAILED (exit ${code})`);
	}
}

console.log(
	failed === 0
		? `\nAll ${tests.length} test script(s) passed.`
		: `\n${failed}/${tests.length} test script(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
