export type ProjectHost = 'github' | 'gitlab' | 'other';

export type ProjectParts = {
	host: ProjectHost;
	/** The first path segment — a user, org or GitLab group. */
	owner: string;
	/** Everything after the hostname, e.g. `ieedan/skilless`. */
	path: string;
	/** The last path segment, e.g. `skilless`. What search ranks first. */
	name: string;
	/** The owner's avatar, where the host serves one without an API call. */
	avatar?: string;
};

/**
 * Splits a project key (`github.com/ieedan/skilless`, see the CLI's
 * `normalizeRemote`) into what the project picker shows.
 *
 * Only GitHub has an unauthenticated `<owner>.png`; every other host falls back
 * to its logo rather than a request we know will 404.
 */
export function projectParts(key: string): ProjectParts {
	const slash = key.indexOf('/');
	const hostname = slash === -1 ? key : key.slice(0, slash);
	const path = slash === -1 ? key : key.slice(slash + 1);
	const owner = path.split('/')[0] ?? path;

	const host: ProjectHost =
		hostname === 'github.com' ? 'github' : hostname === 'gitlab.com' ? 'gitlab' : 'other';

	return {
		host,
		owner,
		path,
		name: path.slice(path.lastIndexOf('/') + 1),
		avatar: host === 'github' ? `https://github.com/${owner}.png?size=80` : undefined
	};
}
