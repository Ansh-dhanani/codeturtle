import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { indexRepo, reindexRepo, processPREvent, processPRMention, testFunction } from "../../../inngest/functions";

export const maxDuration = 300; // Allows Vercel serverless function to run longer for heavy AI/indexing tasks

const inngestHandler = serve({
  client: inngest,
  functions: [
    indexRepo,
    reindexRepo,
    processPREvent,
    processPRMention,
    testFunction,
  ],
});

type Handler = (request: Request, context?: unknown) => Response | Promise<Response>;

const notConfigured = () =>
  new Response("INNGEST_SIGNING_KEY is not configured", { status: 503 });

// Inngest SDK verifies request signatures only when INNGEST_SIGNING_KEY is
// set. In production, refuse to serve unverifiable traffic rather than
// execute review jobs for anyone who knows the URL.
function withSigningKeyGuard(handler: Handler): Handler {
  return async (request: Request, context?: unknown) => {
    if (process.env.NODE_ENV === "production" && !process.env.INNGEST_SIGNING_KEY) {
      return notConfigured();
    }
    return handler(request, context);
  };
}

export const GET = withSigningKeyGuard(inngestHandler.GET as unknown as Handler) as unknown as typeof inngestHandler.GET;
export const POST = withSigningKeyGuard(inngestHandler.POST as unknown as Handler) as unknown as typeof inngestHandler.POST;
export const PUT = withSigningKeyGuard(inngestHandler.PUT as unknown as Handler) as unknown as typeof inngestHandler.PUT;
