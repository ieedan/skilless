import { packFile } from '$lib/server/addresses';

/** The pack file. Public packs to anyone; private ones to their owner, by cookie or CLI token. */
export const GET = packFile;
