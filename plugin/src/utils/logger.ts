/**
 * Lightweight console-only logger.
 *
 * Obsidian's "avoid unnecessary logging to console" guideline (and its review
 * scanner) only tolerates `console.warn` / `console.error` / `console.debug`;
 * `console.log` / `console.info` are flagged. Everything routed through this
 * class therefore uses exactly those three methods — no direct console calls
 * anywhere else in the codebase.
 */
export class Logger {
	private readonly prefix: string;

	constructor(prefix: string) {
		this.prefix = `[${prefix}]`;
	}

	debug(...args: unknown[]): void {
		console.debug(this.prefix, ...args);
	}

	warn(...args: unknown[]): void {
		console.warn(this.prefix, ...args);
	}

	error(...args: unknown[]): void {
		console.error(this.prefix, ...args);
	}
}