/**
 * A streamed load value as reactive state: `current` is `fallback` until the
 * promise settles, then its result. A rejection keeps the fallback.
 *
 * For values that feed script logic (a search, a sort) rather than only the
 * markup, where `{#await}` would do.
 */
export class Resolved<T> {
	current = $state() as T;
	settled = $state(false);

	constructor(promise: Promise<T>, fallback: T) {
		this.current = fallback;
		promise.then(
			(value) => {
				this.current = value;
				this.settled = true;
			},
			() => (this.settled = true)
		);
	}
}
