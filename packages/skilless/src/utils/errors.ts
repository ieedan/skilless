export class SkillessError extends Error {
	readonly suggestion: string | undefined;

	constructor(message: string, opts?: { suggestion?: string; cause?: unknown }) {
		super(message, { cause: opts?.cause });
		this.name = 'SkillessError';
		this.suggestion = opts?.suggestion;
	}

	toString(): string {
		return this.suggestion ? `${this.message}\n${this.suggestion}` : this.message;
	}
}

export class NotAuthenticatedError extends SkillessError {
	constructor() {
		super('You are not signed in.', {
			suggestion: 'Run `skilless auth` to sign in, or set SKILLESS_TOKEN.'
		});
	}
}

export class NotAProjectError extends SkillessError {
	constructor() {
		super('This directory has no git remote, so it has no project key.', {
			suggestion:
				'skilless identifies a project by its git remote. Add one, or pass --project <key>.'
		});
	}
}

/**
 * The server could not be reached at all, as opposed to answering with an
 * error. Commands that only need the server to share a change catch this and
 * finish locally; `sync` and `install` cannot, so they let it through.
 */
export class OfflineError extends SkillessError {
	readonly url: string;

	constructor(url: string, cause?: unknown) {
		super(`Couldn't reach ${url}.`, {
			suggestion: 'Check your connection, or set SKILLESS_API_URL to point elsewhere.',
			cause
		});
		this.url = url;
	}
}
