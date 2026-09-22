import { Avatar, Style } from '@dicebear/core';
import definition from '@dicebear/styles/glass.json' with { type: 'json' };

const style = new Style(definition);

/**
 * Avatars are derived from the username, never uploaded — there is no avatar to
 * configure, so there is nothing to moderate, store or migrate.
 *
 * Seeded on the stable handle rather than the display name: a rename would
 * otherwise silently hand someone a different face.
 */
export function avatarSvg(seed: string): string {
	return new Avatar(style, { seed }).toString();
}

/** A `data:` URI, for use as an `<img src>`. */
export function avatarDataUri(seed: string): string {
	return `data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg(seed))}`;
}
