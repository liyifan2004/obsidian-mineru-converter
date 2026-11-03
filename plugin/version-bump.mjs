import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { pickVersion, computeVersionSync } from './version-sync.mjs';

/**
 * 版本号同步脚本 —— 让 `npm version` 成为唯一的版本号入口。
 *
 * 用法（在 plugin/ 目录下）：
 *   npm version patch --no-git-tag-version   # 0.3.4 -> 0.3.5，同步下面几处
 *   npm run version                          # 不改版本号，只把已有版本号同步到几处
 *
 * 同步目标：
 *   - plugin/manifest.json 的 version（基准）
 *   - plugin/package.json  的 version
 *   - plugin/versions.json  新增 "<version>": "<minAppVersion>" 条目
 *   - 仓库根目录的 manifest.json / versions.json（提交机器读的是根目录那份）
 *
 * versions.json 是 Obsidian 的历史兼容表：每个发布过的版本对应它所需的
 * 最低 Obsidian 版本，用户从旧版本升级时 Obsidian 用它判断能否直升。
 *
 * 决策逻辑在 version-sync.mjs（纯函数，有单元测试覆盖）。
 */

/** 读写 JSON 时保留原文件的缩进风格与结尾换行，避免产生大片无关格式 diff。 */
function readJson(path) {
	const raw = readFileSync(path, 'utf8');
	return {
		data: JSON.parse(raw),
		indent: /^\t/m.test(raw) ? '\t' : /^\s+/m.test(raw) ? '  ' : '\t',
		trailingNewline: raw.endsWith('\n'),
	};
}

function writeJson(path, data, indent, trailingNewline) {
	let text = JSON.stringify(data, null, indent);
	if (trailingNewline) text += '\n';
	writeFileSync(path, text);
}

const manifestFile = readJson('manifest.json');
const pkgFile = readJson('package.json');
const versionsFile = readJson('versions.json');

/** npm 刚写入的版本号（`npm run version` 时为 package.json 的现值）。 */
const npmVersion = process.env.npm_package_version;

const targetVersion = pickVersion({
	manifestVersion: manifestFile.data.version,
	npmVersion,
});

if (!targetVersion) {
	console.error(
		'version-bump.mjs 无法确定目标版本号：manifest.json 与 package.json 都缺少合法的 version 字段。',
	);
	process.exit(1);
}

const next = computeVersionSync({
	manifest: manifestFile.data,
	packageJson: pkgFile.data,
	versions: versionsFile.data,
	targetVersion,
});

if (!next) {
	console.error('version-bump.mjs 读取到的 manifest.json / versions.json 结构不合法。');
	process.exit(1);
}

writeJson('manifest.json', next.manifest, manifestFile.indent, manifestFile.trailingNewline);
writeJson('versions.json', next.versions, versionsFile.indent, versionsFile.trailingNewline);
writeJson('package.json', next.packageJson, pkgFile.indent, pkgFile.trailingNewline);

// Keep the repo-root manifest.json / versions.json in sync.
// The Obsidian submission bot validates the manifest at the REPOSITORY ROOT,
// so these two files must always mirror plugin/manifest.json and plugin/versions.json.
copyFileSync('manifest.json', '../manifest.json');
copyFileSync('versions.json', '../versions.json');

if (next.skippedVersionsEntry) {
	console.warn(
		`version-bump: manifest.json 缺少 minAppVersion，versions.json 未登记 ${targetVersion}。`,
	);
}

console.log(
	`version-bump: ${targetVersion} (minAppVersion ${manifestFile.data.minAppVersion ?? '—'}) — ` +
		'manifest.json / versions.json / package.json 已同步（根目录副本已更新）',
);
