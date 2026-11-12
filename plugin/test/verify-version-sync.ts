/**
 * verify-version-sync.ts —— 版本号同步决策逻辑的验证脚本。
 *
 * 背景：版本号决策是发版链路上最容易出错、代价最高的一环 —— 版本号一旦
 * 错配，用户以后就再也收不到真正的修复版本（版本号已被占用）。这段逻辑
 * 曾经内联在 version-bump.mjs 里，既没法单独测，出错时也是直接写坏文件。
 * 现在抽到 version-sync.mjs，这里把它的行为钉住。
 *
 * Run: esbuild-bundle to ESM, then `node` it.
 */
import { readFileSync } from 'node:fs';
import {
	compareSemver,
	computeVersionSync,
	parseSemver,
	pickVersion,
} from '../version-sync.mjs';

let failures = 0;
function check(label: string, cond: boolean, extra = ''): void {
	if (cond) console.log(`  PASS  ${label}`);
	else {
		failures++;
		console.log(`  FAIL  ${label} ${extra}`);
	}
}

// --- parseSemver ---

check('parses a valid version', parseSemver('1.2.3')?.join(',') === '1,2,3');
check('parses 10.20.30', parseSemver('10.20.30')?.join(',') === '10,20,30');
check('rejects "1.2"', parseSemver('1.2') === null);
check('rejects "v1.2.3"', parseSemver('v1.2.3') === null);
check('rejects "1.2.3-rc1"', parseSemver('1.2.3-rc1') === null);
check('rejects empty string', parseSemver('') === null);

// --- compareSemver ---

check('1.0.0 < 1.0.1', compareSemver('1.0.0', '1.0.1') === -1);
check('1.0.1 > 1.0.0', compareSemver('1.0.1', '1.0.0') === 1);
check('1.0.0 == 1.0.0', compareSemver('1.0.0', '1.0.0') === 0);
check('1.2.0 < 1.10.0', compareSemver('1.2.0', '1.10.0') === -1);
check('invalid side -> null', compareSemver('1.2', '1.2.3') === null);

// --- pickVersion ---

check(
	'uses npm version when it is newer',
	pickVersion({ manifestVersion: '0.3.4', npmVersion: '0.3.5' }) === '0.3.5',
);
check(
	'uses npm version when equal',
	pickVersion({ manifestVersion: '0.3.4', npmVersion: '0.3.4' }) === '0.3.4',
);
// 回归用例：package.json 漂移落后时不能把正确的 manifest 版本号降级。
check(
	'never downgrades a lagging package.json',
	pickVersion({ manifestVersion: '0.3.4', npmVersion: '0.3.3' }) === '0.3.4',
);
check(
	'falls back to manifest when npm gives nothing',
	pickVersion({ manifestVersion: '0.3.4', npmVersion: undefined }) === '0.3.4',
);
check(
	'returns null when nothing usable',
	pickVersion({ manifestVersion: undefined, npmVersion: undefined }) === null,
);

// --- computeVersionSync ---

const manifest = {
	id: 'mineru-converter',
	name: 'MinerU Converter',
	version: '0.3.4',
	minAppVersion: '1.5.0',
};

const next = computeVersionSync({
	manifest,
	packageJson: { name: 'mineru-converter', version: '0.3.4' },
	versions: { '0.3.4': '1.5.0' },
	targetVersion: '0.3.5',
});

check('manifest version updated', next?.manifest.version === '0.3.5');
check('package.json version updated', next?.packageJson.version === '0.3.5');
check('versions.json got the new entry', next?.versions['0.3.5'] === '1.5.0');
check('no skipped entry when minAppVersion present', next?.skippedVersionsEntry === false);

// 历史版本的 minAppVersion 是历史事实，不能因为今天改了 minAppVersion 就改写。
const keepHistory = computeVersionSync({
	manifest: { ...manifest, minAppVersion: '1.6.0' },
	packageJson: { version: '0.3.4' },
	versions: { '0.3.4': '1.5.0' },
	targetVersion: '0.3.4',
});
check('keeps historical minAppVersion', keepHistory?.versions['0.3.4'] === '1.5.0');

// 缺 minAppVersion 时不能往 versions.json 写 undefined —— Obsidian 读这张
// 兼容表判断能否直升升级时会拿到一个无效值，用户反而升不到这个版本。
const { minAppVersion: _omitted, ...manifestWithoutMin } = manifest;
const noMin = computeVersionSync({
	manifest: manifestWithoutMin,
	packageJson: { version: '0.3.4' },
	versions: { '0.3.4': '1.5.0' },
	targetVersion: '0.3.5',
});
check('no undefined entry in versions.json', !('0.3.5' in (noMin?.versions ?? {})));
check('reports the skipped entry', noMin?.skippedVersionsEntry === true);

// 回归用例：旧脚本在没有 npm 环境变量时会把 manifest.version 写成
// undefined，JSON.stringify 会直接丢掉这个字段 —— Obsidian 读到一份没有
// version 的 manifest，插件将无法安装。
check('never produces an undefined version', next?.manifest.version === '0.3.5');
check(
	'version key always present',
	Object.prototype.hasOwnProperty.call(next?.manifest ?? {}, 'version'),
);

check(
	'returns null without a target version',
	computeVersionSync({
		manifest,
		packageJson: {},
		versions: {},
		targetVersion: null,
	}) === null,
);

// 不修改入参。
const originalManifest = { ...manifest };
const originalPackage = { version: '0.3.4' };
const originalVersions = { '0.3.4': '1.5.0' };
computeVersionSync({
	manifest: originalManifest,
	packageJson: originalPackage,
	versions: originalVersions,
	targetVersion: '0.3.5',
});
check('inputs not mutated (manifest)', originalManifest.version === '0.3.4');
check('inputs not mutated (package)', originalPackage.version === '0.3.4');
check('inputs not mutated (versions)', Object.keys(originalVersions).join(',') === '0.3.4');

// --- 磁盘上的版本号一致性 ---

/**
 * 为什么要有这一层
 *
 * `computeVersionSync` 只管三个对象：manifest / package.json / versions.json。
 * 但 `npm version` 还会改 **package-lock.json** —— 它的版本号不在
 * 上面三个里，于是**漏掉了**。
 *
 * 实测（2026-11-13）：MSE / JEV / folio 三个仓库的发版提交都漏掉了
 * package-lock.json，仓库里 lockfile 停在**上一个版本号**。
 * lockfile 不进发布产物（商店只下载 main.js / manifest.json / styles.css），
 * 所以不影响用户，但「版本号已同步」这句话不成立。
 *
 * 这一层直接查磁盘 —— 不信任任何脚本的自述。
 */
const readJson = (path: string): Record<string, unknown> =>
	JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

const diskManifest = readJson('manifest.json');
const diskTarget = diskManifest.version as string;

check(
	'package.json version matches manifest.json',
	readJson('package.json').version === diskTarget,
);
check(
	'package-lock.json version matches manifest.json',
	readJson('package-lock.json').version === diskTarget,
);
check(
	'package-lock.json packages[""] version matches manifest.json',
	(
		readJson('package-lock.json').packages as Record<
			string,
			Record<string, unknown>
		>
	)['']?.version === diskTarget,
);
check(
	'versions.json registers the current version',
	(readJson('versions.json') as Record<string, unknown>)[diskTarget] ===
		diskManifest.minAppVersion,
);

if (failures > 0) {
	console.log(`\n${failures} check(s) failed.`);
	process.exit(1);
}
console.log('\nAll version-sync checks passed.');
