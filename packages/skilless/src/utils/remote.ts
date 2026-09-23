import { ApiClient } from '@/utils/api';
import { getApiUrl, getToken } from '@/utils/auth';
import { NotAuthenticatedError, OfflineError } from '@/utils/errors';
import { log } from '@/utils/prompts';

/**
 * The server, for commands that work without it.
 *
 * `try` runs a request and, if the server cannot be reached or will not let us
 * in, answers `undefined` instead of failing — after which every other `try`
 * skips straight to `undefined` too. The command finishes locally and calls
 * `report` to say what did not go through.
 *
 * `sync` and `install` exist to talk to the server, so they use `requireApi`
 * instead and fail outright.
 */
export class Remote {
	readonly api: ApiClient | null;
	#failure: OfflineError | NotAuthenticatedError | null = null;

	constructor() {
		const token = getToken();
		this.api = token ? new ApiClient(token, getApiUrl()) : null;
	}

	/** False when signed out, as well as when the server could not be reached. */
	get online(): boolean {
		return this.api !== null && this.#failure === null;
	}

	async try<T>(run: (api: ApiClient) => Promise<T>): Promise<T | undefined> {
		if (!this.api || this.#failure) return undefined;

		try {
			return await run(this.api);
		} catch (e) {
			if (e instanceof OfflineError || e instanceof NotAuthenticatedError) {
				this.#failure = e;
				return undefined;
			}

			throw e;
		}
	}

	/**
	 * Says so if anything could not reach the server. Call once, at the end.
	 * Signed out says nothing — using skilless without the cloud is a choice.
	 */
	report(): void {
		if (!this.#failure) return;

		log.blank();

		if (this.#failure instanceof OfflineError) {
			log.warn(
				`Couldn't reach ${this.#failure.url}. Run \`skilless sync\` to sync your skills with the cloud.`
			);
			return;
		}

		log.warn('Your sign-in was rejected, so this only changed this machine.');
		log.dim('Run `skilless auth` to sign in again, then `skilless sync` to sync your skills.');
	}
}
