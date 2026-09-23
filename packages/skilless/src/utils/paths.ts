import os from 'node:os';
import path from 'pathe';

/** Overridable so tests (and a second account) can point at a different store. */
export const SKILLESS_DIR = process.env.SKILLESS_HOME
	? path.resolve(process.env.SKILLESS_HOME)
	: path.join(os.homedir(), '.skilless');

export const SKILLS_DIR = path.join(SKILLESS_DIR, 'skills');
export const AUTH_FILE = path.join(SKILLESS_DIR, 'auth.json');
export const STATE_FILE = path.join(SKILLESS_DIR, 'state.json');
export const CACHE_FILE = path.join(SKILLESS_DIR, 'cache.json');
export const SOURCES_FILE = path.join(SKILLESS_DIR, 'sources.json');
export const PENDING_FILE = path.join(SKILLESS_DIR, 'pending.json');
export const CONFIG_FILE = path.join(SKILLESS_DIR, 'config.json');
export const CONFLICTS_DIR = path.join(SKILLESS_DIR, 'conflicts');

export function skillDir(name: string): string {
	return path.join(SKILLS_DIR, name);
}

/** Where a project's skills are materialized, and the bridge Claude Code reads. */
export const AGENTS_SKILLS = '.agents/skills';
export const CLAUDE_SKILLS = '.claude/skills';

/** Where Claude Code keeps user-level config, honouring its own override. */
export function claudeHome(): string {
	return process.env.CLAUDE_CONFIG_DIR
		? path.resolve(process.env.CLAUDE_CONFIG_DIR)
		: path.join(os.homedir(), '.claude');
}

/** The user-level skill directories — where global skills are materialized. */
export function userAgentsSkills(): string {
	return path.join(os.homedir(), AGENTS_SKILLS);
}

export function userClaudeSkills(): string {
	return path.join(claudeHome(), 'skills');
}
