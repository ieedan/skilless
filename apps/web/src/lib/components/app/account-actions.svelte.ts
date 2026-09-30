import { goto, invalidate } from '$app/navigation';
import { authClient } from '@skilless/platform/client';
import { toast } from 'svelte-sonner';
import { submitAction } from '$lib/submit';
import RiComputerLine from 'remixicon-svelte/icons/computer-line';
import RiMoonLine from 'remixicon-svelte/icons/moon-line';
import RiSunLine from 'remixicon-svelte/icons/sun-line';

export const THEMES = [
	{ value: 'system', label: 'System', icon: RiComputerLine },
	{ value: 'light', label: 'Light', icon: RiSunLine },
	{ value: 'dark', label: 'Dark', icon: RiMoonLine }
] as const;

export type Theme = (typeof THEMES)[number]['value'];

/** What the account menu does, shared by its dropdown and its drawer. */
export class AccountActions {
	/** The checkbox's state while a change is in flight, so it does not lag a round trip behind the click. */
	pendingHideEmail = $state<boolean>();

	async setHideEmail(value: boolean) {
		this.pendingHideEmail = value;
		try {
			// `keepFocus` so the menu stays open; the layout reloads on its own key
			// rather than everything, which would reopen the pages' live queries
			const result = await submitAction(
				'/settings?/setHideEmail',
				{ hideEmail: String(value) },
				{ keepFocus: true, invalidate: false }
			);
			if (result.type !== 'success') throw new Error();
			await invalidate('app:preferences');
		} catch {
			toast.error('Could not update your settings');
		} finally {
			this.pendingHideEmail = undefined;
		}
	}

	async signOut() {
		await authClient.signOut();
		await goto('/login', { invalidateAll: true });
	}
}
