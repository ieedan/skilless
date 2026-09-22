import { applyAction, deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import type { ActionResult } from '@sveltejs/kit';

/**
 * Posts a form action and settles once the page has caught up.
 *
 * `confirmDelete` wants an `onConfirm` that returns a promise and keeps its
 * spinner running until it resolves, which `use:enhance` cannot give us — it
 * owns the submission. So we submit by hand, the way SvelteKit documents for
 * custom handling, and await the resulting invalidation.
 */
export async function submitAction(
	action: string,
	fields: Record<string, string>
): Promise<ActionResult> {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.append(name, value);

	const response = await fetch(action, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});

	const result = deserialize(await response.text()) as ActionResult;

	// a redirect from the action (e.g. the folder we were in is now gone)
	if (result.type === 'redirect') {
		await goto(result.location, { invalidateAll: true });
		return result;
	}

	await applyAction(result);
	if (result.type === 'success') await invalidateAll();

	return result;
}
