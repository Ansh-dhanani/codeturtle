import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { indexRepo, reindexRepo, processPREvent, testFunction } from "../../../inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    indexRepo,
    reindexRepo,
    processPREvent,
    testFunction,
  ],
});