import { pineconeClient, pineconeIndexName } from "@/lib/pinecone";
import { embed } from "ai";
import { google } from "@ai-sdk/google";

const BATCH_SIZE = 100;
const MAX_CONTENT_LENGTH = 8000;

function getPineconeIndex() {
  return pineconeClient.index(pineconeIndexName);
}

export async function generateEmbeddings(text: string) {
  const { embedding } = await embed({
    model: google.textEmbeddingModel("text-embedding-004"),
    value: text,
  });
  return embedding;
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

  for (const file of files) {
    const content = `file ${file.path}:\n${file.content}`;
    const truncatedContent = content.slice(0, MAX_CONTENT_LENGTH);
    try {
      const embedding = await generateEmbeddings(truncatedContent);
      vectors.push({
        id: `${repoId}-${file.path.replace(/\//g, "-")}`,
        values: embedding,
        metadata: {
          repoId,
          path: file.path,
          content: truncatedContent,
        },
      });
    } catch (error) {
      console.error(`Error generating embedding for file ${file.path}:`, error);
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
