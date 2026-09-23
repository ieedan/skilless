import { type FunctionReference, getFunctionName } from 'convex/server';
import { ConvexError as ConvexErrorType } from 'convex/values';
import * as errf from 'errf';

export const convexError = errf.create({
	Unauthorized: {
		code: 'UNAUTHORIZED',
		message: 'Unauthorized',
		userMessage: 'You are not authorized, please login to continue'
	},
	InvalidSecretError: {
		code: 'INVALID_SECRET_ERROR',
		message: 'Invalid secret'
	},
	SkillNotFound: {
		code: 'SKILL_NOT_FOUND',
		message: 'Skill not found',
		userMessage: 'That skill does not exist in your library'
	},
	SkillFileNotFound: {
		code: 'SKILL_FILE_NOT_FOUND',
		message: 'Skill file not found',
		userMessage: 'That file is no longer part of the skill'
	},
	SkillAlreadyExists: {
		code: 'SKILL_ALREADY_EXISTS',
		message: 'Skill already exists',
		userMessage: 'A skill with that name already exists in your library'
	},
	SkillNameTaken: {
		code: 'SKILL_NAME_TAKEN',
		message: 'Skill name taken',
		userMessage: 'Rename the existing skill before restoring this one'
	},
	SkillChanged: {
		code: 'SKILL_CHANGED',
		message: 'Skill changed during write',
		userMessage: 'That skill changed while saving, please try again'
	},
	SkillTooLarge: {
		code: 'SKILL_TOO_LARGE',
		message: 'Skill too large',
		userMessage: 'Skills are limited to 1MB'
	},
	SkillFileNotText: {
		code: 'SKILL_FILE_NOT_TEXT',
		message: 'Skill file not text',
		userMessage: 'Skill files must be text'
	},
	ProjectNotFound: {
		code: 'PROJECT_NOT_FOUND',
		message: 'Project not found',
		userMessage: 'No skills have been added to that project yet'
	},
	InvalidToken: {
		code: 'INVALID_TOKEN',
		message: 'Invalid token',
		userMessage: 'That CLI token is not valid. Run `skilless auth` to sign in again'
	},
	UnknownError: {
		code: 'CONVEX_API_ERROR',
		message: (opts: {
			reference: AnyFunctionReference;
			type: 'query' | 'mutation' | 'action';
			message?: string;
		}) => {
			const referenceName = getFunctionName(opts.reference);

			return `Convex ${opts.type} error: ${referenceName} ${opts.message ? `- ${opts.message}` : ''}`;
		}
	}
});

type AnyFunctionReference = Parameters<typeof getFunctionName>[0];

export type ConvexError<K extends keyof typeof convexError> = errf.InferError<
	typeof convexError,
	K
>;

export type AnyConvexError = errf.InferAnyError<typeof convexError>;

export type ConvexErrorCode = errf.InferErrorCodes<typeof convexError>;

export function createConvexError(error: AnyConvexError): ConvexErrorType<never> {
	return new ConvexErrorType(error as never);
}

export function intoConvexError<T extends 'action' | 'query' | 'mutation'>(
	reference: FunctionReference<T>,
	cause: unknown,
	type: T
): AnyConvexError {
	if (cause instanceof ConvexErrorType) {
		if (cause.data && 'code' in cause.data) {
			return cause.data as AnyConvexError;
		}
	}
	return convexError.UnknownError(
		{
			reference,
			type,
			message: cause instanceof Error ? cause.message : undefined
		},
		cause instanceof Error ? cause : undefined
	);
}
