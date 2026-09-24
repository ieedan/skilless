import { program } from 'commander';
import * as commands from '@/commands';
import { DESCRIPTION, NAME, VERSION } from '@/utils/version';

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
	.helpCommand(true);

export { cli };
