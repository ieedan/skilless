/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as discover from "../discover.js";
import type * as errors from "../errors.js";
import type * as files from "../files.js";
import type * as github from "../github.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as links from "../links.js";
import type * as model from "../model.js";
import type * as oauth from "../oauth.js";
import type * as packs from "../packs.js";
import type * as preferences from "../preferences.js";
import type * as profiles from "../profiles.js";
import type * as projects from "../projects.js";
import type * as r2 from "../r2.js";
import type * as scans from "../scans.js";
import type * as skills from "../skills.js";
import type * as tokens from "../tokens.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  discover: typeof discover;
  errors: typeof errors;
  files: typeof files;
  github: typeof github;
  http: typeof http;
  imports: typeof imports;
  links: typeof links;
  model: typeof model;
  oauth: typeof oauth;
  packs: typeof packs;
  preferences: typeof preferences;
  profiles: typeof profiles;
  projects: typeof projects;
  r2: typeof r2;
  scans: typeof scans;
  skills: typeof skills;
  tokens: typeof tokens;
  users: typeof users;
  utils: typeof utils;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
