import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { indexRepo, reindexRepo, processPREvent, processPRMention, testFunction } from "../../../inngest/functions";

export const maxDuration = 300; // Allows Vercel serverless function to run longer for heavy AI/indexing tasks

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    indexRepo,
    reindexRepo,
    processPREvent,
    processPRMention,
    testFunction,
  ],
});
