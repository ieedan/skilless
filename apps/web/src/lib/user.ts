export type AppUser = {
	/** Display name. */
	name: string;
	/** Secondary line under the name — the email we have, shown verbatim. */
	subtitle: string;
	/** What the generated avatar is derived from. */
	seed: string;
};

type AuthUser = { name?: string | null; email?: string | null; _id?: string; id?: string } | null;

/**
 * better-auth's GitHub provider gives us a display name and an email, but not
 * the GitHub login — so the sidebar shows the email rather than inventing an
 * `@handle` that would not match the real one.
 */
export function toAppUser(user: AuthUser): AppUser {
	const name = user?.name?.trim() || user?.email?.split('@')[0] || 'Your account';
	const subtitle = user?.email ?? '';

	return { name, subtitle, seed: name };
}
