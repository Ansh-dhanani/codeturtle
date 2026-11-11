import { Pinecone } from "@pinecone-database/pinecone";

let client: Pinecone | null = null;

/** Lazily construct the client so a missing API key never crashes module import. */
export function getPineconeClient(): Pinecone | null {
  const apiKey = process.env.PINECONE_DB_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Pinecone({ apiKey });
  return client;
}

export const pineconeIndexName = "codeturtle-vector-embedding-v1";
