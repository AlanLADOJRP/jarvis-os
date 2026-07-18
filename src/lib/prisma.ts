import "server-only";
import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma__: PrismaClient | undefined;
}

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. Add DATABASE_URL and DIRECT_URL to .env.local from your Supabase project before using Prisma-backed API routes.",
    );
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export function getPrisma() {
  if (process.env.NODE_ENV === "production") {
    return createPrismaClient();
  }

  if (!globalThis.__prisma__) {
    globalThis.__prisma__ = createPrismaClient();
  }

  return globalThis.__prisma__;
}
