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
 *
 * `keepFocus` skips `applyAction` on success. It resets focus the way a
 * navigation would, which closes any open menu — wrong for a checkbox you
 * expect to toggle a few of in a row.
 *
 * `invalidate: false` skips the reload for pages fed by live `convexLoad`
 * queries: the subscription already delivers the change, and re-running the
 * load would open another subscription that is never torn down.
 */
export async function submitAction(
	action: string,
	fields: Record<string, string>,
	{ keepFocus = false, invalidate = true }: { keepFocus?: boolean; invalidate?: boolean } = {}
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

	if (!(keepFocus && result.type === 'success')) await applyAction(result);
	if (invalidate && result.type === 'success') await invalidateAll();

	return result;
}
