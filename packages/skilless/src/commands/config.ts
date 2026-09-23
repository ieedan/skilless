import { Command, Option } from 'commander';
import pc from 'picocolors';
import { z } from 'zod';
import { readConfig, updateConfig } from '@/utils/config';
import { EDITOR_IDS, EDITORS, detectEditors, isEditorId } from '@/utils/editor';
import { SkillessError } from '@/utils/errors';
import { CONFIG_FILE } from '@/utils/paths';
import { isInteractive, log, select } from '@/utils/prompts';
import { VERSION } from '@/utils/version';
import { parseOptions, tryCommand } from './utils';

const NONE = 'none';

const editorSchema = z.object({
	unset: z.boolean()
});

const editor = new Command('editor')
	.description('Choose the editor `skilless create` opens a new skill in.')
	.argument('[editor]', `Set it directly: ${EDITOR_IDS.join(', ')}.`)
	.addOption(new Option('--unset', 'Stop opening new skills in an editor.').default(false))
	.action(async (value: string | undefined, raw) => {
		const options = parseOptions(editorSchema, raw);
		log.intro(VERSION);

		await tryCommand(async () => {
			const current = readConfig().editor;

			if (options.unset) {
				updateConfig({ editor: undefined });
				log.step('New skills will no longer open in an editor.');
				return;
			}

			if (value) {
				if (!isEditorId(value)) {
					throw new SkillessError(`${value} is not an editor skilless knows.`, {
						suggestion: `Pick one of: ${EDITOR_IDS.join(', ')}.`
					});
				}

				updateConfig({ editor: value });
				log.step(`New skills will open in ${EDITORS[value].label}.`);
				return;
			}

			if (!isInteractive) {
				log.info(current ? `Editor: ${EDITORS[current].label}` : 'No editor set.');
				return;
			}

			const installed = detectEditors();

			if (installed.length === 0) {
				throw new SkillessError('None of the editors skilless knows are installed.', {
					suggestion: `skilless looks for: ${EDITOR_IDS.map((id) => EDITORS[id].cli).join(', ')}.`
				});
			}

			const choice = await select(
				'Open new skills in',
				[
					...installed.map((id) => ({
						name: id,
						message: EDITORS[id].label,
						hint: id === current ? pc.gray('current') : undefined
					})),
					{ name: NONE, message: 'None', hint: current ? undefined : pc.gray('current') }
				],
				current ?? NONE
			);

			if (choice === NONE) {
				updateConfig({ editor: undefined });
				log.step('New skills will not open in an editor.');
				return;
			}

			if (!isEditorId(choice)) return;

			updateConfig({ editor: choice });
			log.step(`New skills will open in ${EDITORS[choice].label}.`);
		});
	});

export const config = new Command('config')
	.description('View or change your skilless settings.')
	.addCommand(editor)
	.action(async () => {
		log.intro(VERSION);

		await tryCommand(async () => {
			const current = readConfig();

			log.info(`editor  ${current.editor ? EDITORS[current.editor].label : pc.gray('not set')}`);
			log.blank();
			log.dim(`Stored in ${CONFIG_FILE}`);
		});
	});
