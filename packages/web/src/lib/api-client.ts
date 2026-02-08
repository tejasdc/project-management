import { hc } from "hono/client";
import type { AppType } from "@pm/api";

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL ?? "";

const API_KEY_STORAGE = "pm_api_key";

export function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string) {
  try {
    localStorage.setItem(API_KEY_STORAGE, key);
    window.dispatchEvent(new Event("pm_api_key_changed"));
  } catch {
    // ignore
  }
}

export const api = hc<AppType>(API_BASE_URL, {
  headers: () => {
    const k = getApiKey();
    const h: Record<string, string> = {};
    if (k) h.authorization = `Bearer ${k}`;
    return h;
  },
});

export async function unwrapJson<T>(res: Response): Promise<T> {
  const json = (await res.json()) as any;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { code?: string; status?: number; details?: unknown };
    err.code = json?.error?.code;
    err.status = json?.error?.status ?? res.status;
    err.details = json?.error?.details;
    throw err;
  }
  return json as T;
}
