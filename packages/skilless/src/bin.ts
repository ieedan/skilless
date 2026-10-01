#!/usr/bin/env node

import updateNotifier from 'update-notifier';
import { cli } from '@/cli';
import { BACKGROUND_COMMAND } from '@/utils/background';
import { NAME, VERSION } from '@/utils/version';

// checks npm in its own detached process, and says so on a later run
if (process.argv[2] !== BACKGROUND_COMMAND) {
	updateNotifier({ pkg: { name: NAME, version: VERSION } }).notify();
}

cli.parse();
