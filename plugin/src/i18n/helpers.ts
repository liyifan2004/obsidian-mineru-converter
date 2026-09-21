import { moment } from 'obsidian';
import en from './locale/en';
import zhCn from './locale/zh-cn';

/**
 * Map of moment locale codes -> translation objects.
 * Add new locales by importing them here and adding to the map.
 *
 * The plugin auto-follows Obsidian's UI language: moment.locale() returns
 * the active Obsidian locale (e.g. 'en', 'zh-cn', 'ja', 'de').
 */
const localeMap: Record<string, Partial<typeof en>> = {
	en,
	'zh-cn': zhCn,
};

/** Fallback chain if the exact moment locale isn't in the map. */
const FALLBACK_CHAIN: ReadonlyArray<readonly [string, string]> = [
	['zh-cn', 'en'], // any zh variant → zh-cn
	['zh-tw', 'zh-cn'], // traditional → simplified (good enough for now)
	['en', 'en'], // final fallback
];

const baseLocale = moment.locale();

/** Resolved active locale used by `t()`. */
function resolveLocale(): typeof en {
	const primary = localeMap[baseLocale];
	if (primary) return { ...en, ...primary };

	// Try fallback chain
	for (const [from, to] of FALLBACK_CHAIN) {
		if (baseLocale.startsWith(from) && localeMap[to]) {
			return { ...en, ...localeMap[to] };
		}
	}
	return en;
}

const activeLocale = resolveLocale();

/**
 * Translate a key using the active locale. Falls back to English, then to
 * the key itself, so missing translations never crash the UI.
 */
export function t<K extends keyof typeof en>(key: K): typeof en[K] {
	const value = activeLocale[key];
	if (value !== undefined) return value;
	const fallback = en[key];
	if (fallback !== undefined) return fallback;
	// Final guard: return the key itself as a string.
	return key as unknown as typeof en[K];
}