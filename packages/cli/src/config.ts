import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type Config = {
  apiUrl: string;
  apiKey: string;
};

export function getDefaultConfigPath() {
  return path.join(os.homedir(), ".pm", "config.json");
}

export async function readConfig(opts?: { configPath?: string }): Promise<Config | null> {
  const configPath = opts?.configPath ?? getDefaultConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    if (!parsed.apiUrl || !parsed.apiKey) return null;
    return { apiUrl: parsed.apiUrl, apiKey: parsed.apiKey };
  } catch {
    return null;
  }
}

export async function writeConfig(cfg: Config, opts?: { configPath?: string }) {
  const configPath = opts?.configPath ?? getDefaultConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

