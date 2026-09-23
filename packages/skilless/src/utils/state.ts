import { createHash } from 'node:crypto';
import { getApiUrl, getToken } from '@/utils/auth';
import * as fsu from '@/utils/fs';
import { STATE_FILE } from '@/utils/paths';

export type SkillState = {
	contentHash: string;
	editedAt: number;
	syncedAt: number;
};

export type State = {
	version: 1;
	/** Which server and sign-in the skills below were synced with. */
	remote?: string;
	skills: Record<string, SkillState>;
};

/**
 * Identifies the library this machine syncs with: the server, plus a digest of
 * the token so the token itself is never written here. Signing in again or
 * pointing at another server gives a different library.
 */
function currentRemote(): string {
	const token = getToken() ?? '';
	const digest = createHash('sha256').update(token).digest('hex').slice(0, 16);
	return `${getApiUrl()}#${digest}`;
}

/**
 * The record of what was true at the last successful sync.
 *
 * This is the third data point that makes deletion safe to propagate: a skill
 * present locally, absent remotely and *listed here* was deleted elsewhere,
 * whereas one that was never listed here is simply new. A fresh machine has an
 * empty file, so nothing is ever deleted on a first sync.
 *
 * It only holds for the library it was recorded against. Synced with another
 * server or sign-in — or written before that was recorded — every skill in it
 * would read as deleted, so it counts as empty instead.
 */
export function readState(): State {
	const state = fsu.readJson<Partial<State>>(STATE_FILE, {});
	const remote = currentRemote();

	if (state.remote !== remote) return { version: 1, remote, skills: {} };

	return { version: 1, remote, skills: state.skills ?? {} };
}

export function writeState(state: State): void {
	fsu.writeJson(STATE_FILE, { ...state, remote: currentRemote() });
}
