import { toast } from 'svelte-sonner';
import { confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
import { copyText } from '$lib/hooks/use-clipboard.svelte';
import { submitAction } from '$lib/submit';

export type MenuSkill = {
	_id: string;
	name: string;
	soleFile?: string;
	global?: boolean;
	/** The skill's address, `/skills/<uuid>`. Absent only on rows from before addresses. */
	uuid?: string;
	public?: boolean;
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
export class Optimistic {
	#values = $state<Record<string, boolean>>({});
	/** Latest request per key, so an older one settling does not clear a newer value. */
	#requests: Record<string, number> = {};
	/** Keys whose latest request has settled, and now only wait on the push. */
	// only read inside `read` and `run`, never rendered: nothing to react to
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
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
 * The actions live on /my-skills, so they are posted there by absolute path.
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
	/** Keyed by skill id. */
	#publics = new Optimistic();

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
				'/my-skills?/setBinding',
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
				'/my-skills?/setGlobal',
				{ name: skill.name, global: String(global) },
				this.#options
			).catch(() => null);
			if (result?.type === 'success') return true;
			toast.error(`Could not update ${skill.name}`);
			return false;
		});
	}

	isPublic(skill: MenuSkill) {
		return this.#publics.read(skill._id, skill.public === true);
	}

	setPublic(skill: MenuSkill, value: boolean) {
		return this.#publics.run(skill._id, value, async () => {
			const result = await submitAction(
				'/my-skills?/setPublic',
				{ name: skill.name, public: String(value) },
				this.#options
			).catch(() => null);
			if (result?.type === 'success') {
				toast.success(value ? `Anyone can now see ${skill.name}` : `${skill.name} is private`);
				return true;
			}
			toast.error(`Could not update ${skill.name}`);
			return false;
		});
	}

	/** Its address, which works for anyone once it is public and only for you until then. */
	async copyLink(skill: MenuSkill) {
		if (!skill.uuid) return;
		const link = `${location.origin}/skills/${skill.uuid}`;
		if ((await copyText(link)) === 'success') {
			toast.success(this.isPublic(skill) ? 'Copied link' : 'Copied link, only you can open it');
		} else {
			toast.error('Could not copy to the clipboard');
		}
	}

	copyInstall(skill: MenuSkill) {
		return this.copyInstallAll([skill]);
	}

	/** One command for the lot: `skilless add` takes any number of names. */
	async copyInstallAll(skills: MenuSkill[]) {
		const names = skills.map((skill) => skill.name).join(' ');
		if ((await copyText(`skilless add ${names}`)) === 'success') {
			toast.success('Copied install command');
		} else {
			toast.error('Could not copy to the clipboard');
		}
	}

	/** One confirmation for the lot, then a delete each; reports what did not go. */
	removeMany(skills: MenuSkill[], onRemoved?: () => unknown) {
		if (skills.length === 1) return this.remove(skills[0], async () => onRemoved?.());

		confirmDelete({
			title: `Delete ${skills.length} skills?`,
			description: 'This removes them from every project. It cannot be undone from here.',
			confirm: { text: `Delete ${skills.length}` },
			onConfirm: async () => {
				const results = await Promise.all(
					skills.map((skill) =>
						submitAction('/my-skills?/remove', { name: skill.name }, this.#options).catch(
							() => null
						)
					)
				);
				const failed = results.filter((result) => result?.type !== 'success').length;
				if (failed > 0) toast.error(`Could not delete ${failed} of ${skills.length} skills`);
				await onRemoved?.();
			}
		});
	}

	remove(skill: MenuSkill, onRemoved?: () => Promise<unknown>) {
		confirmDelete({
			title: `Delete ${skill.name}?`,
			description: 'This removes it from every project. It cannot be undone from here.',
			onConfirm: async () => {
				const result = await submitAction(
					'/my-skills?/remove',
					{ name: skill.name },
					this.#options
				);
				if (result.type === 'success') await onRemoved?.();
			}
		});
	}
}
