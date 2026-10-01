/**
 * What a CLI says it can handle, in the `X-Skilless-Features` header. Older ones
 * send nothing: they would write a binary file's base64 out as text, then see
 * the hash differ and push that text back, so they are told to update instead.
 */
export function supportsBinary(headers: Headers): boolean {
	const features = headers.get('x-skilless-features') ?? '';
	return features.split(',').some((feature) => feature.trim() === 'binary');
}

/** The skills among these with a binary file, by name. */
export function withBinary(skills: { name: string; files: { binary?: boolean }[] }[]): string[] {
	return skills
		.filter((skill) => skill.files.some((file) => file.binary))
		.map((skill) => skill.name);
}

/** Why an older CLI gets nothing, in words it shows as they are. */
export function updateMessage(names: string[]): string {
	const which = names.length === 1 ? `${names[0]} has` : `${names.join(', ')} have`;
	return `${which} binary files, which this version of skilless cannot sync. Update it: npm i -g skilless@latest`;
}
