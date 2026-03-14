import { type ActionCtx, httpAction } from "./_generated/server.js";
import bot from "../telegram/bot.js";

// Export the HTTP action for handling Telegram webhooks
export const handleUpdate = httpAction(async (ctx: ActionCtx, request: Request) => {
  try {
    // Initialize the bot if it hasn't been initialized yet
    if (!bot.isInited()) {
      await bot.init();
    }

    // Parse the JSON body of the request
    const update = await request.json();

    // Let the bot handle the update
    await bot.handleUpdate(update);

    // Return a success response
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error handling update:", error);
    return new Response("Error", { status: 500 });
  }
});
