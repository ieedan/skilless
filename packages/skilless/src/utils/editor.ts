import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'pathe';
import { exists } from '@/utils/fs';

type EditorDef = {
	label: string;
	/** The command we look for on PATH. */
	cli: string;
	/** Where the CLI lives when it is not on PATH — the user never installed the shell command. */
	fallbacks?: Partial<Record<'darwin' | 'win32' | 'linux', string[]>>;
	/** Runs in this terminal and blocks until it exits, rather than opening a window. */
	terminal?: boolean;
};

const home = os.homedir();
/** Per-user installs on Windows (Cursor, VS Code's user installer, Windsurf, Zed) land here. */
const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
const programFiles = process.env.ProgramFiles ?? 'C:/Program Files';

/** The editors we know how to find and open. Order is the order they are offered. */
export const EDITORS = {
	cursor: {
		label: 'Cursor',
		cli: 'cursor',
		fallbacks: {
			darwin: [
				'/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
				`${home}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`
			],
			win32: [path.join(localAppData, 'Programs/cursor/resources/app/bin/cursor.cmd')],
			linux: ['/usr/share/cursor/bin/cursor', '/opt/Cursor/resources/app/bin/cursor']
		}
	},
	vscode: {
		label: 'VS Code',
		cli: 'code',
		fallbacks: {
			darwin: [
				'/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
				`${home}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`
			],
			win32: [
				path.join(localAppData, 'Programs/Microsoft VS Code/bin/code.cmd'),
				path.join(programFiles, 'Microsoft VS Code/bin/code.cmd')
			],
			linux: ['/usr/share/code/bin/code', '/snap/bin/code']
		}
	},
	windsurf: {
		label: 'Windsurf',
		cli: 'windsurf',
		fallbacks: {
			darwin: [
				'/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf',
				`${home}/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`
			],
			win32: [path.join(localAppData, 'Programs/Windsurf/bin/windsurf.cmd')],
			linux: ['/usr/share/windsurf/bin/windsurf']
		}
	},
	zed: {
		label: 'Zed',
		cli: 'zed',
		fallbacks: {
			darwin: [
				'/Applications/Zed.app/Contents/MacOS/cli',
				`${home}/Applications/Zed.app/Contents/MacOS/cli`
			],
			win32: [path.join(localAppData, 'Programs/Zed/bin/zed.exe')],
			linux: [`${home}/.local/bin/zed`]
		}
	},
	sublime: {
		label: 'Sublime Text',
		cli: 'subl',
		fallbacks: {
			darwin: ['/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl'],
			win32: [path.join(programFiles, 'Sublime Text/subl.exe')],
			linux: ['/opt/sublime_text/sublime_text']
		}
	},
	neovim: { label: 'Neovim', cli: 'nvim', terminal: true },
	vim: { label: 'Vim', cli: 'vim', terminal: true }
} as const satisfies Record<string, EditorDef>;

export type EditorId = keyof typeof EDITORS;

export const EDITOR_IDS = Object.keys(EDITORS) as EditorId[];

export function isEditorId(value: string): value is EditorId {
	return Object.hasOwn(EDITORS, value);
}

function which(cmd: string): string | null {
	const finder = process.platform === 'win32' ? 'where' : 'which';
	const result = spawnSync(finder, [cmd], { encoding: 'utf8', windowsHide: true });
	if (result.status !== 0 || !result.stdout) return null;

	const lines = result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	// on Windows `where code` lists the extensionless shim first, which cannot be spawned
	if (process.platform === 'win32') {
		return lines.find((line) => /\.(exe|cmd|bat)$/i.test(line)) ?? lines[0] ?? null;
	}

	return lines[0] ?? null;
}

/** Where the editor's CLI is, or null when it is not installed. */
export function resolveEditor(id: EditorId): string | null {
	const def: EditorDef = EDITORS[id];

	const onPath = which(def.cli);
	if (onPath) return onPath;

	const platform = process.platform as keyof NonNullable<EditorDef['fallbacks']>;
	return def.fallbacks?.[platform]?.find((candidate) => exists(candidate)) ?? null;
}

/** Every known editor that is installed on this machine. */
export function detectEditors(): EditorId[] {
	return EDITOR_IDS.filter((id) => resolveEditor(id) !== null);
}

export function isTerminalEditor(id: EditorId): boolean {
	const def: EditorDef = EDITORS[id];
	return def.terminal === true;
}

/**
 * Opens `file` in the editor. A terminal editor takes over this terminal and
 * resolves once it exits; anything else opens its own window and resolves
 * straight away.
 */
export function openInEditor(id: EditorId, file: string): Promise<void> {
	const bin = resolveEditor(id);
	if (!bin) {
		return Promise.reject(
			new Error(`${EDITORS[id].label} was not found. Is \`${EDITORS[id].cli}\` on your PATH?`)
		);
	}

	const terminal = isTerminalEditor(id);

	return new Promise((resolve, reject) => {
		const child = spawn(bin, [file], {
			cwd: path.dirname(file),
			stdio: terminal ? 'inherit' : 'ignore',
			detached: !terminal,
			windowsHide: true,
			// .cmd shims (code, cursor, ...) cannot be spawned directly on Windows
			shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
		});

		child.on('error', reject);

		if (terminal) {
			child.on('exit', () => resolve());
		} else {
			child.unref();
			setImmediate(resolve);
		}
	});
}
