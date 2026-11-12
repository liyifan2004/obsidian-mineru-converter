/**
 * verify-settings-headings.ts —— 设置页分组标题的验证脚本。
 *
 * 背景：Obsidian 官方规则 `settings-tab/no-problematic-settings-headings`
 * 禁止设置分组标题里出现插件名、`settings`、`options`、`general`。
 * 这条规则是 **error 级**，而且同 fleet 的 obsidian-media-speed-enhancer
 * 1.0.42 就是因为「设置标题重复插件名」被商店审查打回、插件从目录列表下架。
 *
 * 为什么官方 eslint 规则不够：它只检查 `setName("字面量")` 这种**直接字面量**
 * 参数，而本插件所有文案都走 `t()` 间接引用 —— 规则全程沉默。
 *
 * 2026-11-12 实测发现：设置页第一个分组标题用的是 `t('settingsTitle')`，
 * 值是 "MinerU Converter" —— **正是插件名**。lint 全绿，审查会打回。
 *
 * Run: esbuild-bundle to ESM, then `node` it.
 */
import en from '../src/i18n/locale/en';
import zhCn from '../src/i18n/locale/zh-cn';

let failures = 0;
function check(label: string, cond: boolean, extra = ''): void {
	if (cond) console.log(`  PASS  ${label}`);
	else {
		failures++;
		console.log(`  FAIL  ${label} ${extra}`);
	}
}

/** 插件名（取自 manifest.json）—— 标题里不能出现它。 */
const PLUGIN_NAME = 'MinerU Converter';

/** 被官方规则禁止的泛化词。 */
const BANNED_WORDS = [/\bsettings\b/i, /\boptions\b/i, /\bgeneral\b/i];

/**
 * 设置页的分组标题。
 *
 * 两条渲染路径用的是同一个 key，所以这里断言这一个值就够了 ——
 * `src/settings.ts` 的声明式 `heading:` 与命令式 `setName(...)` 都取它。
 */
const SECTION_KEY = 'settingsSection' as const;

type LocaleDict = Record<string, unknown>;

for (const [name, dict] of [
	['en', en as LocaleDict],
	['zh-cn', zhCn as LocaleDict],
] as const) {
	const heading = dict[SECTION_KEY];
	check(`${name}: 设置分组标题键存在`, typeof heading === 'string');
	if (typeof heading !== 'string') continue;

	check(
		`${name}: 分组标题不含插件名`,
		!heading.toLowerCase().includes(PLUGIN_NAME.toLowerCase()),
		`got "${heading}"`,
	);

	for (const banned of BANNED_WORDS) {
		check(
			`${name}: 分组标题不含 ${banned.source}`,
			!banned.test(heading),
			`got "${heading}"`,
		);
	}

	check(`${name}: 分组标题非空`, heading.trim().length > 0);
}

// --- 旧键不该再存在 ---

// settingsTitle 曾是分组标题用的键，值就是插件名。
// 它已经改名为 settingsSection；留着旧键会让人再次误用。
for (const [name, dict] of [
	['en', en as LocaleDict],
	['zh-cn', zhCn as LocaleDict],
] as const) {
	check(`${name}: 旧的 settingsTitle 键已移除`, !('settingsTitle' in dict));
}

if (failures > 0) {
	console.error(`\n${failures} check(s) failed.`);
	process.exit(1);
}
console.log('\nALL CHECKS PASSED');
