import { Command } from "commander";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import readline from "node:readline/promises";

import type { NoteSource } from "@pm/shared";

type Config = {
  apiUrl: string;
  apiKey: string;
};

const CONFIG_DIR = path.join(os.homedir(), ".pm");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function red(s: string) {
  return `\u001b[31m${s}\u001b[0m`;
}
function green(s: string) {
  return `\u001b[32m${s}\u001b[0m`;
}
function dim(s: string) {
  return `\u001b[2m${s}\u001b[0m`;
}

async function readConfig(): Promise<Config | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    if (!parsed.apiUrl || !parsed.apiKey) return null;
    return { apiUrl: parsed.apiUrl, apiKey: parsed.apiKey };
  } catch {
    return null;
  }
}

async function writeConfig(cfg: Config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

async function requireConfig() {
  const cfg = await readConfig();
  if (!cfg) {
    throw new Error(`Missing config. Run: pm config --url http://localhost:3000 --key <API_KEY>`);
  }
  return cfg;
}

async function apiFetch(opts: { path: string; method?: string; body?: unknown }) {
  const cfg = await requireConfig();
  const url = new URL(opts.path, cfg.apiUrl).toString();

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`${msg}${json?.error?.code ? ` (${json.error.code})` : ""}`);
  }

  return json;
}

function tryGitBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return undefined;
  }
}

const program = new Command();
program.name("pm").description("AI-powered project management CLI").version("0.0.1");

program
  .command("config")
  .description("Set or show API configuration")
  .option("--url <url>", "API base URL, e.g. http://localhost:3000")
  .option("--key <key>", "API key (Bearer token)")
  .option("--show", "Print current config")
  .action(async (opts) => {
    const current = await readConfig();
    if (opts.show) {
      if (!current) {
        console.log(dim("No config found."));
        return;
      }
      console.log(JSON.stringify({ apiUrl: current.apiUrl, apiKey: "********" }, null, 2));
      return;
    }

    const apiUrl = opts.url ?? current?.apiUrl;
    const apiKey = opts.key ?? current?.apiKey;
    if (!apiUrl || !apiKey) throw new Error("Provide --url and --key (or use --show).");

    await writeConfig({ apiUrl, apiKey });
    console.log(green("Config saved."));
  });

program
  .command("capture")
  .description("Capture a note for AI extraction")
  .argument("<content...>", "Note content")
  .action(async (parts: string[]) => {
    const content = parts.join(" ").trim();
    const source: NoteSource = "cli";
    const sourceMeta = {
      workingDirectory: process.cwd(),
      gitBranch: tryGitBranch(),
    };

    const res = await apiFetch({
      path: "/api/notes/capture",
      method: "POST",
      body: { content, source, sourceMeta, capturedAt: new Date().toISOString() },
    });

    console.log(JSON.stringify(res, null, 2));
  });

program
  .command("projects")
  .description("List projects")
  .action(async () => {
    const res = await apiFetch({ path: "/api/projects" });
    for (const p of res.items ?? []) {
      console.log(`${p.name}  ${dim(p.id)}`);
    }
  });

program
  .command("tasks")
  .description("List tasks")
  .option("--project <projectId>", "Filter by projectId")
  .option("--status <status>", "Filter by status")
  .option("--assignee <assigneeId>", "Filter by assigneeId")
  .action(async (opts) => {
    const params = new URLSearchParams();
    params.set("type", "task");
    if (opts.project) params.set("projectId", opts.project);
    if (opts.status) params.set("status", opts.status);
    if (opts.assignee) params.set("assigneeId", opts.assignee);
    const res = await apiFetch({ path: `/api/entities?${params.toString()}` });

    for (const t of res.items ?? []) {
      console.log(`${t.status.padEnd(12)} ${t.content}  ${dim(t.id)}`);
    }
  });

program
  .command("status")
  .description("Transition an entity status")
  .argument("<entityId>", "Entity UUID")
  .argument("<newStatus>", "New status")
  .action(async (entityId: string, newStatus: string) => {
    const res = await apiFetch({
      path: `/api/entities/${entityId}/status`,
      method: "POST",
      body: { newStatus },
    });
    console.log(JSON.stringify(res, null, 2));
  });

program
  .command("review")
  .description("Review pending low-confidence items")
  .option("--limit <n>", "Max items (default 20)", "20")
  .action(async (opts) => {
    const limit = Number(opts.limit || "20");
    const res = await apiFetch({ path: `/api/review-queue?status=pending&limit=${limit}` });
    const items = (res.items ?? []) as any[];
    if (items.length === 0) {
      console.log(green("No pending review items."));
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const item of items) {
        console.log("");
        console.log(`${item.reviewType}  ${dim(item.id)}`);
        console.log(`confidence: ${item.aiConfidence}`);
        console.log(`suggestion: ${JSON.stringify(item.aiSuggestion)}`);
        if (item.entityId) {
          const ent = await apiFetch({ path: `/api/entities/${item.entityId}` });
          console.log(`entity: ${ent.entity.content}`);
        }

        const action = (await rl.question("Action [a]ccept [r]eject [m]odify [s]kip: ")).trim().toLowerCase();
        if (action === "s" || action === "") continue;

        if (action === "a" || action === "r") {
          const status = action === "a" ? "accepted" : "rejected";
          const out = await apiFetch({
            path: `/api/review-queue/${item.id}/resolve`,
            method: "POST",
            body: { status },
          });
          console.log(green(`resolved: ${out.item.status}`));
          continue;
        }

        if (action === "m") {
          const userResolution: Record<string, unknown> = {};
          if (item.reviewType === "type_classification") {
            const t = (await rl.question("New type (task|decision|insight): ")).trim();
            userResolution.suggestedType = t;
          } else if (item.reviewType === "project_assignment") {
            const pid = (await rl.question("Project ID (blank to clear): ")).trim();
            if (pid) userResolution.suggestedProjectId = pid;
          } else if (item.reviewType === "epic_assignment") {
            const eid = (await rl.question("Epic ID (blank to clear): ")).trim();
            if (eid) userResolution.suggestedEpicId = eid;
          } else if (item.reviewType === "assignee_suggestion") {
            const aid = (await rl.question("Assignee user ID (blank to clear): ")).trim();
            if (aid) userResolution.suggestedAssigneeId = aid;
          } else if (item.reviewType === "duplicate_detection") {
            const did = (await rl.question("Duplicate entity ID: ")).trim();
            userResolution.duplicateEntityId = did;
          } else if (item.reviewType === "epic_creation") {
            const name = (await rl.question("Epic name: ")).trim();
            const desc = (await rl.question("Epic description (optional): ")).trim();
            userResolution.proposedEpicName = name;
            if (desc) userResolution.proposedEpicDescription = desc;
          } else {
            console.log(dim("Modify not supported for this review type; skipping."));
            continue;
          }

          const trainingComment = (await rl.question("Training comment (optional): ")).trim();

          const out = await apiFetch({
            path: `/api/review-queue/${item.id}/resolve`,
            method: "POST",
            body: { status: "modified", userResolution, trainingComment: trainingComment || undefined },
          });
          console.log(green(`resolved: ${out.item.status}`));
        }
      }
    } finally {
      rl.close();
    }
  });

program.configureOutput({
  outputError: (str, write) => write(red(str)),
});

program.parseAsync(process.argv).catch((err) => {
  console.error(red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

