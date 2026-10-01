import { goto } from '$app/navigation';
import { api } from '@skilless/platform';
import type { useConvexClient } from '@skilless/platform/client';
import type { FunctionReturnType } from 'convex/server';
import { toast } from 'svelte-sonner';

type Client = ReturnType<typeof useConvexClient>;
type Result = FunctionReturnType<typeof api.imports.fromGithub>;
export type Conflict = Result['conflicts'][number];

/** One pick on its way into the library: a skill, or (`dir: null`) a whole repo. */
export type Pending = {
	id: string;
	key: string;
	dir: string | null;
	/** The skill's name, when it is one skill; a whole repo shows as the repo. */
	name?: string;
	description?: string;
};

const plural = (n: number) => `${n} ${n === 1 ? 'skill' : 'skills'}`;

/**
 * Copies from GitHub run here, not in the picker, so the picker closes at once
 * and the copy carries on wherever you go. The skills list shows what is on its
 * way; a toast says when it lands.
 */
class Imports {
	pending = $state<Pending[]>([]);
	/** Skills by the same name, with other files, waiting on you to say whether to replace them. */
	conflicts = $state<Conflict[]>([]);
	/** Whether the conflicts are up for review; a toast's button opens them. */
	reviewing = $state(false);

	/** Starts copying. Returns at once; the list and a toast follow it. */
	start(client: Client, picks: Omit<Pending, 'id'>[], replace?: string[]) {
		const batch = picks.map((pick) => ({ ...pick, id: crypto.randomUUID() }));
		const ids = new Set<string>(batch.map((pick) => pick.id));
		this.pending = [...this.pending, ...batch];

		client
			.action(api.imports.fromGithub, {
				picks: batch.map(({ key, dir }) => ({ key, dir })),
				replace
			})
			.then((result) => this.#report(result))
			.catch(() => toast.error('Could not add those skills'))
			.finally(() => {
				this.pending = this.pending.filter((pick) => !ids.has(pick.id));
			});
	}

	/** Replaces the conflicts you ticked; the rest are let go. */
	replace(client: Client, names: string[]) {
		const chosen = this.conflicts.filter((conflict) => names.includes(conflict.name));
		this.dismiss();
		if (chosen.length === 0) return;
		this.start(
			client,
			chosen.map(({ key, dir, name }) => ({ key, dir, name })),
			chosen.map((conflict) => conflict.name)
		);
	}

	dismiss() {
		this.conflicts = [];
		this.reviewing = false;
	}

	#report(result: Result) {
		const added = result.added.length;
		if (added > 0) {
			const [first] = result.added;
			toast.success(added === 1 ? `Added ${first}` : `Added ${plural(added)} to your library`, {
				action: {
					label: 'View',
					// one skill opens on its page; several, on the list they landed in
					onClick: () =>
						goto(added === 1 ? `/my-skills/${encodeURIComponent(first!)}` : '/my-skills')
				}
			});
		} else if (result.unchanged.length > 0 && result.conflicts.length === 0) {
			toast.info(
				result.unchanged.length === 1
					? `${result.unchanged[0]} is already in your library`
					: `Those ${plural(result.unchanged.length)} are already in your library`
			);
		}

		for (const failed of result.failed) {
			toast.error(`Couldn't add ${failed.name ?? (failed.dir || failed.key)}: ${failed.reason}`);
		}

		if (result.conflicts.length > 0) {
			const names = new Set(result.conflicts.map((conflict) => conflict.name));
			this.conflicts = [
				...this.conflicts.filter((conflict) => !names.has(conflict.name)),
				...result.conflicts
			];
			const n = result.conflicts.length;
			toast.warning(
				n === 1
					? `You already have a different ${result.conflicts[0]!.name}`
					: `You already have different skills by ${n} of those names`,
				{
					duration: 10_000,
					action: {
						label: 'Review',
						onClick: () => {
							this.reviewing = true;
							goto('/my-skills');
						}
					}
				}
			);
		}
	}
}

export const imports = new Imports();
