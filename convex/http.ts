import { httpRouter } from "convex/server";
import { handleUpdate } from "./telegramBot";
import { env } from "./bot";

const path = env.ENVIRONMENT === "production"
  ? "/4b798ca0-025b-410d-bce4-46efc89e0785"
  : "/dev";

const http = httpRouter();

http.route({
  path,
  method: "POST",
  handler: handleUpdate,
});

export default http;
