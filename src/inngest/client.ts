import { Inngest } from "inngest";

const eventApiBaseUrl =
  process.env.INNGEST_API_BASE_URL ||
  (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8288" : undefined);

export const inngest = new Inngest({
  id: "CodeTurtle",
  eventKey: process.env.INNGEST_EVENT_KEY,
  eventApiBaseUrl,
});
