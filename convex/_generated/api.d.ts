/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as answerLog from "../answerLog.js";
import type * as bkt_bktPure from "../bkt/bktPure.js";
import type * as bot_context from "../bot/context.js";
import type * as bot_envValidator from "../bot/envValidator.js";
import type * as bot_handlers_callbacks_callbackParser from "../bot/handlers/callbacks/callbackParser.js";
import type * as bot_handlers_callbacks_callbackRouter from "../bot/handlers/callbacks/callbackRouter.js";
import type * as bot_handlers_callbacks_reactionHandler from "../bot/handlers/callbacks/reactionHandler.js";
import type * as bot_handlers_commands_help from "../bot/handlers/commands/help.js";
import type * as bot_handlers_commands_start from "../bot/handlers/commands/start.js";
import type * as bot_handlers_commands_stop from "../bot/handlers/commands/stop.js";
import type * as bot_handlers_commands_test from "../bot/handlers/commands/test.js";
import type * as bot_handlers_messages_text from "../bot/handlers/messages/text.js";
import type * as bot_index from "../bot/index.js";
import type * as bot_keyboard from "../bot/keyboard.js";
import type * as bot_rateLimit from "../bot/rateLimit.js";
import type * as bot_rateLimitPure from "../bot/rateLimitPure.js";
import type * as development from "../development.js";
import type * as focusSlots_focusSlots from "../focusSlots/focusSlots.js";
import type * as focusSlots_focusSlotsPure from "../focusSlots/focusSlotsPure.js";
import type * as http from "../http.js";
import type * as kcCatalog from "../kcCatalog.js";
import type * as machines_drillMachine from "../machines/drillMachine.js";
import type * as machines_scqMachine from "../machines/scqMachine.js";
import type * as machines_types from "../machines/types.js";
import type * as queries from "../queries.js";
import type * as questions_answerFlow from "../questions/answerFlow.js";
import type * as questions_answerFlowAdapter from "../questions/answerFlowAdapter.js";
import type * as questions_answerFlowTypes from "../questions/answerFlowTypes.js";
import type * as questions_queries from "../questions/queries.js";
import type * as questions_questionPure from "../questions/questionPure.js";
import type * as rateLimits from "../rateLimits.js";
import type * as seed from "../seed.js";
import type * as telegramBot from "../telegramBot.js";
import type * as userMastery from "../userMastery.js";
import type * as userMessages from "../userMessages.js";
import type * as userReactions from "../userReactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  answerLog: typeof answerLog;
  "bkt/bktPure": typeof bkt_bktPure;
  "bot/context": typeof bot_context;
  "bot/envValidator": typeof bot_envValidator;
  "bot/handlers/callbacks/callbackParser": typeof bot_handlers_callbacks_callbackParser;
  "bot/handlers/callbacks/callbackRouter": typeof bot_handlers_callbacks_callbackRouter;
  "bot/handlers/callbacks/reactionHandler": typeof bot_handlers_callbacks_reactionHandler;
  "bot/handlers/commands/help": typeof bot_handlers_commands_help;
  "bot/handlers/commands/start": typeof bot_handlers_commands_start;
  "bot/handlers/commands/stop": typeof bot_handlers_commands_stop;
  "bot/handlers/commands/test": typeof bot_handlers_commands_test;
  "bot/handlers/messages/text": typeof bot_handlers_messages_text;
  "bot/index": typeof bot_index;
  "bot/keyboard": typeof bot_keyboard;
  "bot/rateLimit": typeof bot_rateLimit;
  "bot/rateLimitPure": typeof bot_rateLimitPure;
  development: typeof development;
  "focusSlots/focusSlots": typeof focusSlots_focusSlots;
  "focusSlots/focusSlotsPure": typeof focusSlots_focusSlotsPure;
  http: typeof http;
  kcCatalog: typeof kcCatalog;
  "machines/drillMachine": typeof machines_drillMachine;
  "machines/scqMachine": typeof machines_scqMachine;
  "machines/types": typeof machines_types;
  queries: typeof queries;
  "questions/answerFlow": typeof questions_answerFlow;
  "questions/answerFlowAdapter": typeof questions_answerFlowAdapter;
  "questions/answerFlowTypes": typeof questions_answerFlowTypes;
  "questions/queries": typeof questions_queries;
  "questions/questionPure": typeof questions_questionPure;
  rateLimits: typeof rateLimits;
  seed: typeof seed;
  telegramBot: typeof telegramBot;
  userMastery: typeof userMastery;
  userMessages: typeof userMessages;
  userReactions: typeof userReactions;
  users: typeof users;
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
