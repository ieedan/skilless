import { program } from 'commander';
import * as commands from '@/commands';
import { DESCRIPTION, NAME, VERSION } from '@/utils/version';

const cli = program
	.name(NAME)
	.description(DESCRIPTION)
	.version(VERSION)
	.addCommand(commands.init)
	.addCommand(commands.auth)
	.addCommand(commands.create)
	.addCommand(commands.add)
	.addCommand(commands.update)
	.addCommand(commands.remove)
	.addCommand(commands.deleteCommand)
	.addCommand(commands.install)
	.addCommand(commands.sync)
	.addCommand(commands.importCommand)
	.addCommand(commands.migrate)
	.addCommand(commands.list)
	.addCommand(commands.config);

export { cli };
