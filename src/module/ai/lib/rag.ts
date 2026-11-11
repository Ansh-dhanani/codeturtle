import { getPineconeClient, pineconeIndexName } from "@/lib/pinecone";
import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";
import { withTimeout } from "@/lib/with-timeout";

const BATCH_SIZE = 100;
const MAX_CONTENT_LENGTH = 8000;

// Existing Pinecone index is dimension 1024; embeddings MUST match or upserts 400.
const EMBEDDING_MODEL = process.env.GOOGLE_EMBEDDING_MODEL || "gemini-embedding-001";
const EMBEDDING_FALLBACK_MODEL = "gemini-embedding-001";
const EMBEDDING_DIM = 1024;

/** Returns an embedding using the configured model, falling back to embedding-001 on failure. Dimension fixed to 1024 to match Pinecone index. */
async function embedWithFallback(value: string) {
  try {
    const { embedding } = await withTimeout(
      () => embed({ model: google.textEmbeddingModel(EMBEDDING_MODEL), value, providerOptions: { google: { outputDimensionality: EMBEDDING_DIM } } }),
      30_000,
      "embedWithFallback",
    );
    return embedding;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[rag] ${EMBEDDING_MODEL} failed (${message}); falling back to ${EMBEDDING_FALLBACK_MODEL}`);
    const { embedding } = await withTimeout(
      () => embed({ model: google.textEmbeddingModel(EMBEDDING_FALLBACK_MODEL), value, providerOptions: { google: { outputDimensionality: EMBEDDING_DIM } } }),
      30_000,
      "embedWithFallback(fallback)",
    );
    return embedding;
  }
}

// Probes Pinecone for the index once per process; cached to avoid repeated 404's.
let indexAvailablePromise: Promise<boolean> | null = null;
async function isIndexAvailable(): Promise<boolean> {
  if (!indexAvailablePromise) {
    indexAvailablePromise = (async () => {
      try {
        const client = getPineconeClient();
        if (!client) {
          console.warn("[rag] PINECONE_DB_API_KEY not set; RAG disabled for this process");
          return false;
        }
        await client.describeIndex(pineconeIndexName);
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[rag] Pinecone index "${pineconeIndexName}" unavailable (${message}); RAG disabled for this process`,
        );
        return false;
      }
    })();
  }
  return indexAvailablePromise;
}

function getPineconeIndex() {
  const client = getPineconeClient();
  if (!client) {
    throw new Error("Pinecone client is not configured (PINECONE_DB_API_KEY missing)");
  }
  return client.index(pineconeIndexName);
}

export async function generateEmbeddings(text: string) {
  return withTimeout(
    () => embedWithFallback(text),
    60_000,
    "generateEmbeddings",
  );
}

async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  try {
    const { embeddings } = await withTimeout(
      () =>
        embedMany({
          model: google.textEmbeddingModel(EMBEDDING_MODEL),
          values: texts.map((t) => t.slice(0, 10000)),
          providerOptions: { google: { outputDimensionality: EMBEDDING_DIM } },
        }),
      90_000,
      "generateEmbeddingsBatch",
    );
    return embeddings;
  } catch (error) {
    console.warn(`[rag] ${EMBEDDING_MODEL} batch embedding failed; falling back to ${EMBEDDING_FALLBACK_MODEL}`, error instanceof Error ? error.message : error);
    try {
      const { embeddings } = await withTimeout(
        () =>
          embedMany({
            model: google.textEmbeddingModel(EMBEDDING_FALLBACK_MODEL),
            values: texts.map((t) => t.slice(0, 10000)),
            providerOptions: { google: { outputDimensionality: EMBEDDING_DIM } },
          }),
        90_000,
        "generateEmbeddingsBatch(fallback)",
      );
      return embeddings;
    } catch (fallbackError) {
      console.error("[rag] Fallback embedding batch also failed:", fallbackError instanceof Error ? fallbackError.message : fallbackError);
      return new Array(texts.length).fill(null);
    }
  }
}

export async function indexCodebase(
  repoId: string,
  files: { path: string; content: string }[],
) {
  if (!(await isIndexAvailable())) {
    console.warn("Pinecone index unavailable - skipping indexing");
    return;
  }
  const index = getPineconeIndex();
  const vectors: Array<{
    id: string;
    values: number[];
    metadata: { repoId: string; path: string; content: string };
  }> = [];

  // Prepare all content first
  const fileContents = files.map((file) => {
    const content = `file ${file.path}:\n${file.content}`;
    return content.slice(0, MAX_CONTENT_LENGTH);
  });

  console.log(`Generating embeddings for ${fileContents.length} files...`);

  // Generate embeddings in batches
  const embeddings = await generateEmbeddingsBatch(fileContents);

  // Build vectors from embeddings
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const embedding = embeddings[i];
    if (embedding) {
      vectors.push({
        id: `${repoId}-${file.path.replace(/\//g, "-")}`,
        values: embedding,
        metadata: {
          repoId,
          path: file.path,
          content: fileContents[i],
        },
      });
    } else {
      console.warn(`Skipping file ${file.path} due to embedding failure`);
    }
  }

  if (vectors.length === 0) {
    console.warn(`No vectors generated for repo ${repoId}`);
    return { indexed: 0 };
  }

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await index.upsert(batch);
  }

  console.log(`Indexed ${vectors.length} vectors for repo ${repoId}`);
  return { indexed: vectors.length };
}

export async function queryCodebase(query: string, repoId?: string, topK: number = 10) {
  if (!(await isIndexAvailable())) {
    console.warn("Pinecone index unavailable - skipping RAG query");
    return [];
  }
  const index = getPineconeIndex();
  const embedding = await generateEmbeddings(query);

  const filter = repoId ? { repoId: { $eq: repoId } } : undefined;

  const results = await index.query({
    vector: embedding,
    topK,
    filter,
    includeMetadata: true,
  });

  return results.matches.map((match) => ({
    path: match.metadata?.path as string,
    content: match.metadata?.content as string,
    repoId: match.metadata?.repoId as string,
    score: match.score,
  }));
}

export async function deleteRepoVectors(repoId: string) {
  if (!(await isIndexAvailable())) {
    console.warn("Pinecone index unavailable - skipping delete");
    return;
  }
  const index = getPineconeIndex();

  // Query filter works on this index; metadata-filter deletes are rejected.
  // So: find matching IDs first, then delete them.
  let ids: string[] = [];
  async function collectIds() {
    const matches = await (await index.query({ topK: 10000, vector: Array(1024).fill(0.01), filter: { repoId: { $eq: repoId } } })).matches ?? [];
    ids = matches.map((m) => m.id ?? "").filter(Boolean) as string[];
  }
  await collectIds();

  if (ids.length === 0) {
    console.log(`No vectors to delete for repo ${repoId}`);
    return;
  }

  await index.deleteMany(ids);
  console.log(`Deleted ${ids.length} vector(s) for repo ${repoId}`);
}
