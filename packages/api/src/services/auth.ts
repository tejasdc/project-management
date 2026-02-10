import { randomBytes, webcrypto } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";

import { db } from "../db/index.js";
import { apiKeys, users } from "../db/schema/index.js";

const { subtle } = webcrypto;

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

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
