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
			suggestion: 'Run `skilless init` to sign in, or set SKILLESS_TOKEN.'
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
