import { httpRouter } from "convex/server";
import { handleUpdate } from "./telegramBot";

const http = httpRouter();

// Route for handling Telegram bot webhooks
http.route({
  path: "/telegram",
  method: "POST",
  handler: handleUpdate,
});

export default http;
