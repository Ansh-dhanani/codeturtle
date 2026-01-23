import {Pinecone} from "@pinecone-database/pinecone";

export const pineconeClient = new Pinecone({
    apiKey: process.env.PINECONE_DB_API_KEY!
});

export const pineconeIndexName = "codeturtle-vector-embedding-v1";