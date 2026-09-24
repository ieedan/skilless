import { getDoc } from '$lib/docs';

export const load = ({ params }) => getDoc(params.slug);
