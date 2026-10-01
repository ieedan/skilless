export function load({ locals }) {
	return { signedIn: Boolean(locals.token) };
}
