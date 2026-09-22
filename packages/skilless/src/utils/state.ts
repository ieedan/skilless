import * as fsu from '@/utils/fs';
import { STATE_FILE } from '@/utils/paths';

export type SkillState = {
	contentHash: string;
	editedAt: number;
	syncedAt: number;
};

export type State = {
	version: 1;
	skills: Record<string, SkillState>;
};

const EMPTY: State = { version: 1, skills: {} };

/**
 * The record of what was true at the last successful sync.
 *
 * This is the third data point that makes deletion safe to propagate: a skill
 * present locally, absent remotely and *listed here* was deleted elsewhere,
 * whereas one that was never listed here is simply new. A fresh machine has an
 * empty file, so nothing is ever deleted on a first sync.
 */
export function readState(): State {
	const state = fsu.readJson<State>(STATE_FILE, EMPTY);
	return { version: 1, skills: state.skills ?? {} };
}

export function writeState(state: State): void {
	fsu.writeJson(STATE_FILE, state);
}
