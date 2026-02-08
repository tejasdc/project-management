import { randomBytes, webcrypto } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { apiKeys, users } from "../db/schema/index.js";

const { subtle } = webcrypto;

export async function generateApiKey() {
  const hex = randomBytes(16).toString("hex"); // 32 hex chars
  const plaintextKey = `pm_live_${hex}`;
  const keyHash = await hashApiKey(plaintextKey);
  return { plaintextKey, keyHash };
}

export async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}

export async function hashApiKey(plaintextKey: string) {
  return sha256Hex(plaintextKey);
}

export async function validateApiKey(plaintextKey: string) {
  const keyHash = await hashApiKey(plaintextKey);
  const apiKey = await db.query.apiKeys.findFirst({
    where: (t, q) => and(eq(t.keyHash, keyHash), isNull(t.revokedAt)),
  });
  if (!apiKey) return null;

  const user = await db.query.users.findFirst({
    where: (t, q) => eq(t.id, apiKey.userId),
  });
  if (!user) return null;

  return { apiKey, user };
}
