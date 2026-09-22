import os from 'node:os';
import path from 'pathe';

/** Overridable so tests (and a second account) can point at a different store. */
export const SKILLESS_DIR = process.env.SKILLESS_HOME
	? path.resolve(process.env.SKILLESS_HOME)
	: path.join(os.homedir(), '.skilless');

export const SKILLS_DIR = path.join(SKILLESS_DIR, 'skills');
export const AUTH_FILE = path.join(SKILLESS_DIR, 'auth.json');
export const STATE_FILE = path.join(SKILLESS_DIR, 'state.json');
export const CONFLICTS_DIR = path.join(SKILLESS_DIR, 'conflicts');

export function skillDir(name: string): string {
	return path.join(SKILLS_DIR, name);
}

/** Where a project's skills are materialized, and the bridge Claude Code reads. */
export const AGENTS_SKILLS = '.agents/skills';
export const CLAUDE_SKILLS = '.claude/skills';
