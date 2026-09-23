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

export type MenuProject = { _id: string; key: string };

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
	#pending = $state<Record<string, boolean>>({});
	/** Keyed by skill id. */
	#pendingGlobal = $state<Record<string, boolean>>({});

	/** Every page using this is fed by live `convexLoad` queries, so there is nothing to invalidate. */
	#options = { keepFocus: true, invalidate: false };

	isBound(skill: MenuSkill, project: MenuProject) {
		return this.#pending[`${skill._id}:${project._id}`] ?? skill.projectIds.includes(project._id);
	}

	isGlobal(skill: MenuSkill) {
		return this.#pendingGlobal[skill._id] ?? skill.global === true;
	}

	async setBinding(skill: MenuSkill, project: MenuProject, bound: boolean) {
		const key = `${skill._id}:${project._id}`;
		this.#pending[key] = bound;

		try {
			const result = await submitAction(
				'/skills?/setBinding',
				{ skillId: skill._id, projectId: project._id, bound: String(bound) },
				this.#options
			);
			if (result.type !== 'success') toast.error(`Could not update ${project.key}`);
		} catch {
			toast.error(`Could not update ${project.key}`);
		} finally {
			delete this.#pending[key];
		}
	}

	async setGlobal(skill: MenuSkill, global: boolean) {
		this.#pendingGlobal[skill._id] = global;

		try {
			const result = await submitAction(
				'/skills?/setGlobal',
				{ name: skill.name, global: String(global) },
				this.#options
			);
			if (result.type !== 'success') toast.error(`Could not update ${skill.name}`);
		} catch {
			toast.error(`Could not update ${skill.name}`);
		} finally {
			delete this.#pendingGlobal[skill._id];
		}
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
