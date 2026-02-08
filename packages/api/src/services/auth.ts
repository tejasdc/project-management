import { randomBytes, webcrypto } from "node:crypto";

const { subtle } = webcrypto;

export function generateApiKeyPlaintext(opts?: { environment?: "live" | "test" }) {
  const environment =
    opts?.environment ??
    (process.env.NODE_ENV === "production" ? "live" : "test");

  const hex = randomBytes(16).toString("hex"); // 32 hex chars
  return `pm_${environment}_${hex}`;
}

export async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}

export async function hashApiKey(plaintextKey: string, pepper: string) {
  return sha256Hex(`${pepper}:${plaintextKey}`);
}

