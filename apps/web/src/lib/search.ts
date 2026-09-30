/** A slice of text, flagged when it is part of a search match. */
export type Segment = { text: string; match: boolean };

export type Searchable = {
	name: string;
	/**
	 * The part of the name people search by, ranked ahead of the rest — a
	 * repo's name without its owner, so `skilless` finds `ieedan/skilless`
	 * before everything else `ieedan` owns.
	 */
	shortName?: string;
	description?: string | null;
};

/** Whitespace-separated, lowercased, de-duplicated. Every term must match somewhere. */
export function terms(query: string): string[] {
	return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
}

/**
 * The items where every term appears in the name or description, best first:
 * exact name, then names starting with the query, then names containing it,
 * then names matching some terms, then description-only matches. At each step
 * a `shortName` match beats a match elsewhere in the name. Ties keep the input
 * order, which is the library's own sort.
 */
export function search<T extends Searchable>(items: T[], query: string): T[] {
	const q = query.trim().toLowerCase();
	const ts = terms(q);
	if (ts.length === 0) return items;

	const ranked: { item: T; rank: number; index: number }[] = [];

	items.forEach((item, index) => {
		const name = item.name.toLowerCase();
		const short = item.shortName?.toLowerCase();
		const description = (item.description ?? '').toLowerCase();

		if (!ts.every((t) => name.includes(t) || description.includes(t))) return;

		const rank =
			name === q || short === q
				? 0
				: short?.startsWith(q)
					? 1
					: name.startsWith(q)
						? 2
						: short?.includes(q)
							? 3
							: name.includes(q)
								? 4
								: ts.some((t) => name.includes(t))
									? 5
									: 6;

		ranked.push({ item, rank, index });
	});

	return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((r) => r.item);
}

/** Splits `text` so every occurrence of any term is its own `match` segment. */
export function highlight(text: string, ts: string[]): Segment[] {
	if (ts.length === 0 || !text) return [{ text, match: false }];

	const lower = text.toLowerCase();
	// mark matched characters, so overlapping terms merge into one highlight
	const hit = new Array<boolean>(text.length).fill(false);

	for (const t of ts) {
		for (let i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + 1)) {
			hit.fill(true, i, i + t.length);
		}
	}

	const segments: Segment[] = [];
	for (let i = 0; i < text.length;) {
		let j = i;
		while (j < text.length && hit[j] === hit[i]) j++;
		segments.push({ text: text.slice(i, j), match: hit[i] });
		i = j;
	}
	return segments;
}

/**
 * Trims the front of `text` so the first match lands near the start. The row
 * clamps descriptions to two lines, and a match past that would be invisible.
 */
export function around(text: string, ts: string[], lead = 40): string {
	const lower = text.toLowerCase();
	const first = Math.min(...ts.map((t) => lower.indexOf(t)).filter((i) => i !== -1));
	if (!Number.isFinite(first) || first <= lead * 2) return text;

	// back up to a word boundary so the snippet does not open mid-word
	const start = text.lastIndexOf(' ', first - lead) + 1;
	return start === 0 ? text : '…' + text.slice(start);
}
