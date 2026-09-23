import type { ConvexHttpClient } from 'convex/browser';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

type WithoutSecret<T> = Omit<T, 'secret'>;

/**
 * Calls the Convex functions defined with `secretQuery` / `secretMutation` /
 * `secretAction`, injecting the shared function secret.
 *
 * The Hono API authenticates CLI users itself, by bearer token, so it has no
 * Convex session to present — this is how it reaches the database as a trusted
 * server rather than as a user.
 */
export class SecretClient {
	readonly #client: ConvexHttpClient;
	readonly #secret: string;

	constructor(client: ConvexHttpClient, secret: string) {
		this.#client = client;
		this.#secret = secret;
	}

	query<Q extends FunctionReference<'query'>>(
		reference: Q,
		args: WithoutSecret<FunctionArgs<Q>>
	): Promise<FunctionReturnType<Q>> {
		return this.#client.query(reference, {
			...args,
			secret: this.#secret
		} as FunctionArgs<Q>);
	}

	action<A extends FunctionReference<'action'>>(
		reference: A,
		args: WithoutSecret<FunctionArgs<A>>
	): Promise<FunctionReturnType<A>> {
		return this.#client.action(reference, {
			...args,
			secret: this.#secret
		} as FunctionArgs<A>);
	}

	mutation<M extends FunctionReference<'mutation'>>(
		reference: M,
		args: WithoutSecret<FunctionArgs<M>>
	): Promise<FunctionReturnType<M>> {
		return this.#client.mutation(reference, {
			...args,
			secret: this.#secret
		} as FunctionArgs<M>);
	}
}
