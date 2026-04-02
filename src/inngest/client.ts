import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "CodeTurtle",
  eventKey: process.env.INNGEST_EVENT_KEY,
  eventApiBaseUrl: process.env.INNGEST_API_BASE_URL || "http://127.0.0.1:8288",
});
