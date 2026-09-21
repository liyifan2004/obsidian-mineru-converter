/**
 * Lightweight console-only logger. Obsidian plugins should not use console
 * directly so users can mute plugin logs in DevTools if desired. v0.1 keeps
 * this minimal — we can add a "verbose" setting later.
 */
export class Logger {
	private readonly prefix: string;

	constructor(prefix: string) {
		this.prefix = `[${prefix}]`;
	}

	debug(...args: unknown[]): void {
		console.debug(this.prefix, ...args);
	}

	info(...args: unknown[]): void {
		console.info(this.prefix, ...args);
	}

	warn(...args: unknown[]): void {
		console.warn(this.prefix, ...args);
	}

	error(...args: unknown[]): void {
		console.error(this.prefix, ...args);
	}
}