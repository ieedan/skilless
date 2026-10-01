import { Avatar, Style } from '@dicebear/core';
import definition from '@dicebear/styles/glass.json' with { type: 'json' };

const style = new Style(definition);

/**
 * The fallback for an account with no picture of its own. Most have one — the
 * GitHub avatar better-auth copies at sign in — so this is rarely seen. It is
 * derived rather than uploaded, so there is nothing to moderate, store or migrate.
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
