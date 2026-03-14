/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bot_envValidator from "../bot/envValidator.js";
import type * as bot_handlers_callbacks_quizAnswer from "../bot/handlers/callbacks/quizAnswer.js";
import type * as bot_handlers_commands_help from "../bot/handlers/commands/help.js";
import type * as bot_handlers_commands_start from "../bot/handlers/commands/start.js";
import type * as bot_handlers_messages_text from "../bot/handlers/messages/text.js";
import type * as bot_index from "../bot/index.js";
import type * as development from "../development.js";
import type * as http from "../http.js";
import type * as machines_singleChoiceQuestion from "../machines/singleChoiceQuestion.js";
import type * as queries from "../queries.js";
import type * as telegramBot from "../telegramBot.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "bot/envValidator": typeof bot_envValidator;
  "bot/handlers/callbacks/quizAnswer": typeof bot_handlers_callbacks_quizAnswer;
  "bot/handlers/commands/help": typeof bot_handlers_commands_help;
  "bot/handlers/commands/start": typeof bot_handlers_commands_start;
  "bot/handlers/messages/text": typeof bot_handlers_messages_text;
  "bot/index": typeof bot_index;
  development: typeof development;
  http: typeof http;
  "machines/singleChoiceQuestion": typeof machines_singleChoiceQuestion;
  queries: typeof queries;
  telegramBot: typeof telegramBot;
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

export declare const components: {};
