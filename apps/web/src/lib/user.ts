export type AppUser = {
	/** Display name. */
	name: string;
	/** Secondary line under the name — the email we have, shown verbatim. Empty when hidden. */
	subtitle: string;
	/** What the generated avatar is derived from. */
	seed: string;
};

type AuthUser = { name?: string | null; email?: string | null; _id?: string; id?: string } | null;

/**
 * better-auth's GitHub provider gives us a display name and an email, but not
 * the GitHub login — so the account menu shows the email rather than inventing an
 * `@handle` that would not match the real one.
 */
export function toAppUser(user: AuthUser, { hideEmail = false } = {}): AppUser {
	const seed = user?.name?.trim() || user?.email?.split('@')[0] || 'Your account';
	// Hiding the email also stops it leaking in as the fallback name. The seed
	// keeps it, so toggling the setting does not change the picture.
	const name = user?.name?.trim() || (!hideEmail && user?.email?.split('@')[0]) || 'Your account';
	const subtitle = hideEmail ? '' : (user?.email ?? '');

	return { name, subtitle, seed };
}
