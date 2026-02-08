import { badRequest } from "./errors.js";

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function parseLimit(raw: string | undefined, opts?: { defaultLimit?: number; maxLimit?: number }) {
  const defaultLimit = opts?.defaultLimit ?? 50;
  const maxLimit = opts?.maxLimit ?? 100;

  if (!raw) return defaultLimit;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw badRequest("Invalid limit");
  if (n <= 0) throw badRequest("Invalid limit");
  return Math.min(n, maxLimit);
}

export function parseOptionalBoolean(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  throw badRequest("Invalid boolean value");
}

export function encodeCursor(payload: unknown) {
  return base64UrlEncode(JSON.stringify(payload));
}

export function decodeCursor<T>(cursor: string): T {
  try {
    return JSON.parse(base64UrlDecode(cursor)) as T;
  } catch {
    throw badRequest("Invalid cursor");
  }
}
