/**
 * Smoke test for the fflate-based zipExtractor.
 * Build a fake MinerU result ZIP with fflate's zipSync, then extract it.
 * Run: esbuild-bundle to ESM, then `node` it.
 */
import { zipSync, strToU8 } from 'fflate';
import { extractFromZip, safeImageKey } from '../src/utils/zipExtractor';

let failures = 0;
function check(label: string, cond: boolean, extra = ''): void {
	if (cond) console.log(`  PASS  ${label}`);
	else {
		failures++;
		console.log(`  FAIL  ${label} ${extra}`);
	}
}

// Nested layout as produced for some MinerU results.
const zipBytes = zipSync({
	'result/layout.json': strToU8('{}'),
	'result/model.json': strToU8('{}'),
	'result/full.md': strToU8('# Hello\n\n![](images/abc.jpg)'),
	'result/images/abc.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
	'result/images/sub/deep.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
});

const out = extractFromZip(
	zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength),
);
check('extracts full.md', out !== null);
check('md text intact', out?.mdContent === '# Hello\n\n![](images/abc.jpg)');
check('2 images collected', out?.images.size === 2, `got ${out?.images.size}`);
check('key normalized to "abc.jpg"', out?.images.has('abc.jpg'));
check('nested key kept "sub/deep.png"', out?.images.has('sub/deep.png'));
const img = out?.images.get('abc.jpg');
check(
	'image bytes intact',
	img instanceof ArrayBuffer && new Uint8Array(img).join(',') === '255,216,255,224,1,2,3',
);

// ZIP without full.md -> null.
const noMd = zipSync({ 'a/images/x.jpg': new Uint8Array([1]) });
const out2 = extractFromZip(
	noMd.buffer.slice(noMd.byteOffset, noMd.byteOffset + noMd.byteLength),
);
check('returns null when full.md missing', out2 === null);

// --- Path traversal hardening (2026-11-03) ---
// The archive is downloaded from a remote server, so entry names are
// untrusted. fflate does not sanitize them, and Obsidian's normalizePath()
// does not resolve "..", so a traversal key could write outside images/.

const evil = zipSync({
	'result/full.md': strToU8('# x\n\n![](images/ok.jpg)'),
	'result/images/ok.jpg': new Uint8Array([1, 2, 3]),
	'result/images/../../../../evil.txt': strToU8('PWNED'),
	'result/images/../sibling.png': new Uint8Array([9]),
	'result/images/sub/../../escape.jpg': new Uint8Array([8]),
});
const evilOut = extractFromZip(
	evil.buffer.slice(evil.byteOffset, evil.byteOffset + evil.byteLength),
);
const evilKeys = evilOut ? [...evilOut.images.keys()] : [];
check('keeps the legitimate image', evilKeys.includes('ok.jpg'));
check(
	'drops ../ traversal entry',
	!evilKeys.some((k) => k.includes('..')),
	`got ${JSON.stringify(evilKeys)}`,
);
check(
	'no key escapes the images folder',
	evilKeys.every((k) => !k.startsWith('/') && !k.includes('../')),
	`got ${JSON.stringify(evilKeys)}`,
);

check('safeImageKey keeps a plain name', safeImageKey('abc.jpg') === 'abc.jpg');
check('safeImageKey keeps a nested name', safeImageKey('sub/deep.png') === 'sub/deep.png');
check('safeImageKey rejects ..', safeImageKey('../evil.txt') === null);
check(
	'safeImageKey rejects embedded ..',
	safeImageKey('sub/../../evil.txt') === null,
);
check('safeImageKey rejects absolute path', safeImageKey('/etc/passwd') === null);
check('safeImageKey rejects drive letter', safeImageKey('C:/evil.txt') === null);
check('safeImageKey rejects backslash', safeImageKey('..\\evil.txt') === null);
check('safeImageKey rejects empty', safeImageKey('') === null);
check('safeImageKey rejects dot-only', safeImageKey('.') === null);

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
