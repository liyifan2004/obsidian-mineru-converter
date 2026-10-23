/**
 * Smoke test for the fflate-based zipExtractor.
 * Build a fake MinerU result ZIP with fflate's zipSync, then extract it.
 * Run: esbuild-bundle to ESM, then `node` it.
 */
import { zipSync, strToU8 } from 'fflate';
import { extractFromZip } from '../src/utils/zipExtractor';

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

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
