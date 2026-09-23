import * as fsu from '@/utils/fs';
import { CONFIG_FILE } from '@/utils/paths';
import { type EditorId, isEditorId } from '@/utils/editor';

export type Config = {
	/** Opens a new skill's SKILL.md after `skilless create`. */
	editor?: EditorId;
};

export function readConfig(): Config {
	const config = fsu.readJson<Config>(CONFIG_FILE, {});

	// a hand edited or out of date value is treated as unset
	if (config.editor !== undefined && !isEditorId(config.editor)) delete config.editor;

	return config;
}

export function writeConfig(config: Config): void {
	fsu.writeJson(CONFIG_FILE, config);
}

export function updateConfig(patch: Partial<Config>): Config {
	const config = { ...readConfig(), ...patch };

	// an unset key is removed rather than written as null
	for (const key of Object.keys(config) as (keyof Config)[]) {
		if (config[key] === undefined) delete config[key];
	}

	writeConfig(config);
	return config;
}
