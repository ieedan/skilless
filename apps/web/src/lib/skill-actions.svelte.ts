import { toast } from 'svelte-sonner';
import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
import { copyText } from '$lib/hooks/use-clipboard.svelte';
import { submitAction } from '$lib/submit';

export type MenuSkill = {
	_id: string;
	name: string;
	soleFile?: string;
	global?: boolean;
	projectIds: string[];
};

export type MenuProject = {
	_id: string;
	key: string;
	/** A GitHub repo with no project yet. `_id` is the key; binding a skill creates the project. */
	unsaved?: boolean;
};

/**
 * How long a settled change waits for the live query to catch up before the
 * server's value is trusted again, in case the push never matches (another
 * tab changed it back in the meantime).
 */
const CATCH_UP_MS = 5000;

/**
 * An optimistic value for one toggle. It outlives its request: the action
 * returns before the live query pushes the change, and dropping it on return
 * would flash the old value until the push lands. It goes once the server
 * agrees, or after `CATCH_UP_MS`.
 */
class Optimistic {
	#values = $state<Record<string, boolean>>({});
	/** Latest request per key, so an older one settling does not clear a newer value. */
	#requests: Record<string, number> = {};
	/** Keys whose latest request has settled, and now only wait on the push. */
	#settled = new Set<string>();

	read(key: string, server: boolean) {
		const value = this.#values[key];
		if (value === undefined) return server;

		if (value === server && this.#settled.has(key)) {
			// caught up. Cleared after this read, since state cannot change mid-derive.
			queueMicrotask(() => this.#clear(key, this.#requests[key]));
		}
		return value;
	}

	async run(key: string, value: boolean, request: () => Promise<boolean>) {
		const id = (this.#requests[key] ?? 0) + 1;
		this.#requests[key] = id;
		this.#settled.delete(key);
		this.#values[key] = value;

		const ok = await request().catch(() => false);
		if (this.#requests[key] !== id) return;

		if (!ok) {
			this.#clear(key, id);
			return;
		}

		this.#settled.add(key);
		setTimeout(() => this.#clear(key, id), CATCH_UP_MS);
	}

	#clear(key: string, id: number | undefined) {
		if (this.#requests[key] !== id) return;
		delete this.#values[key];
		this.#settled.delete(key);
	}
}

/**
 * What the skill menu does, shared by the skills list and a skill's own page.
 * The actions live on /skills, so they are posted there by absolute path.
 *
 * Holds the optimistic state for binding and global toggles, so a checkbox
 * moves on click rather than a round trip later, and snaps back on failure.
 * One instance per page, so anything else on the page (a project count) can
 * read the same state through `isBound` / `isGlobal`.
 */
export class SkillActions {
	/** Keyed `skillId:projectId`. */
	#bindings = new Optimistic();
	/** Keyed by skill id. */
	#globals = new Optimistic();

	/** Every page using this is fed by live `convexLoad` queries, so there is nothing to invalidate. */
	#options = { keepFocus: true, invalidate: false };

	isBound(skill: MenuSkill, project: MenuProject) {
		return this.#bindings.read(
			`${skill._id}:${project._id}`,
			skill.projectIds.includes(project._id)
		);
	}

	isGlobal(skill: MenuSkill) {
		return this.#globals.read(skill._id, skill.global === true);
	}

	setBinding(skill: MenuSkill, project: MenuProject, bound: boolean) {
		return this.#bindings.run(`${skill._id}:${project._id}`, bound, async () => {
			const result = await submitAction(
				'/skills?/setBinding',
				{
					skillId: skill._id,
					...(project.unsaved ? { projectKey: project.key } : { projectId: project._id }),
					bound: String(bound)
				},
				this.#options
			).catch(() => null);
			if (result?.type === 'success') return true;
			toast.error(`Could not update ${project.key}`);
			return false;
		});
	}

	setGlobal(skill: MenuSkill, global: boolean) {
		return this.#globals.run(skill._id, global, async () => {
			const result = await submitAction(
				'/skills?/setGlobal',
				{ name: skill.name, global: String(global) },
				this.#options
			).catch(() => null);
			if (result?.type === 'success') return true;
			toast.error(`Could not update ${skill.name}`);
			return false;
		});
	}

	async copyInstall(skill: MenuSkill) {
		if ((await copyText(`skilless add ${skill.name}`)) === 'success') {
			toast.success('Copied install command');
		} else {
			toast.error('Could not copy to the clipboard');
		}
	}

	remove(skill: MenuSkill, onRemoved?: () => Promise<unknown>) {
		confirmDelete({
			title: `Delete ${skill.name}?`,
			description: 'This removes it from every project. It cannot be undone from here.',
			onConfirm: async () => {
				const result = await submitAction('/skills?/remove', { name: skill.name }, this.#options);
				if (result.type === 'success') await onRemoved?.();
			}
		});
	}
}
