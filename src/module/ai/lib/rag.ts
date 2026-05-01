import { pineconeClient, pineconeIndexName } from "@/lib/pinecone";
import { embed } from "ai";
import { google } from "@ai-sdk/google";

const BATCH_SIZE = 100;
const MAX_CONTENT_LENGTH = 8000;
const EMBEDDING_BATCH_SIZE = 10; // Batch embeddings for faster processing

function getPineconeIndex() {
  return pineconeClient.index(pineconeIndexName);
}

export async function generateEmbeddings(text: string) {
  const { embedding } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: text,
  });
  return embedding;
}

async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchPromises = batch.map(async (text) => {
      try {
        return await generateEmbeddings(text);
      } catch (error) {
        console.error(`Error generating embedding for batch slice:`, error);
        return null;
      }
    });
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  return results;
}

export async function indexCodebase(
  repoId: string,
  files: { path: string; content: string }[],
) {
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
  const index = getPineconeIndex();
  const embedding = await generateEmbeddings(query);

  const filter = repoId ? { repoId } : undefined;

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
  const index = getPineconeIndex();
  await index.deleteMany({ filter: { repoId } });
  console.log(`Deleted vectors for repo ${repoId}`);
}
