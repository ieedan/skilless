import { program } from 'commander';
import * as commands from '@/commands';
import { BACKGROUND_COMMAND, showNotices, startBackground } from '@/utils/background';
import { DESCRIPTION, NAME, VERSION } from '@/utils/version';

/**
 * Talk to the server themselves, so a background run after them would only
 * repeat the work — or, for the background command, start itself again.
 */
const QUIET = new Set([BACKGROUND_COMMAND, 'sync', 'install', 'auth']);

const cli = program
	.name(NAME)
	.description(DESCRIPTION)
	.version(VERSION)
	.commandsGroup('Commands:')
	.addCommand(commands.init)
	.addCommand(commands.create)
	.addCommand(commands.add)
	.addCommand(commands.update)
	.addCommand(commands.remove)
	.addCommand(commands.deleteCommand)
	.addCommand(commands.install)
	.addCommand(commands.vendor)
	.addCommand(commands.importCommand)
	.addCommand(commands.migrate)
	.addCommand(commands.list)
	.addCommand(commands.config)
	.commandsGroup('Cloud Commands (skilless.dev):')
	.addCommand(commands.auth)
	.addCommand(commands.sync)
	// Put the built-in help command back with the regular commands.
	.commandsGroup('Commands:')
	.helpCommand(true)
	.addCommand(commands.background, { hidden: true })
	.hook('postAction', (_, action) => {
		if (QUIET.has(action.name())) return;

		showNotices();
		startBackground(action.opts().cwd ?? process.cwd());
	});

export { cli };
