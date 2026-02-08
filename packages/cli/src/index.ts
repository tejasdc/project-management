import { Command } from "commander";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import readline from "node:readline/promises";
import { createHash } from "node:crypto";

import type { NoteSource } from "@pm/shared";
import chalk from "chalk";
import Table from "cli-table3";

type Config = {
  apiUrl: string;
  apiKey: string;
};

const CONFIG_DIR = path.join(os.homedir(), ".pm");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const red = (s: string) => chalk.red(s);
const green = (s: string) => chalk.green(s);
const dim = (s: string) => chalk.dim(s);
const yellow = (s: string) => chalk.yellow(s);

function formatConfidence(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return dim("n/a");
  if (n >= 0.9) return green(n.toFixed(2));
  if (n >= 0.7) return yellow(n.toFixed(2));
  return red(n.toFixed(2));
}

function shortId(id: unknown) {
  if (!id) return "";
  const s = String(id);
  return s.length > 8 ? s.slice(0, 8) : s;
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

    const noteId = res?.note?.id;
    const deduped = Boolean(res?.deduped);
    console.log(`${green("Captured")} ${dim(shortId(noteId))} ${deduped ? dim("(deduped)") : ""}`.trim());
  });

program
  .command("projects")
  .description("List projects")
  .action(async () => {
    const res = await apiFetch({ path: "/api/projects" });
    const table = new Table({
      head: [chalk.bold("Name"), chalk.bold("Status"), chalk.bold("Id")],
      style: { head: [], border: [] },
    });
    for (const p of res.items ?? []) {
      table.push([p.name, p.status, dim(shortId(p.id))]);
    }
    console.log(table.toString());
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
    const table = new Table({
      head: [chalk.bold("Status"), chalk.bold("Content"), chalk.bold("Id")],
      colWidths: [14, 70, 12],
      wordWrap: true,
      style: { head: [], border: [] },
    });
    for (const t of res.items ?? []) {
      table.push([t.status, t.content, dim(shortId(t.id))]);
    }
    console.log(table.toString());
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
    console.log(`${green("Updated")} ${dim(shortId(res?.entity?.id ?? entityId))} -> ${chalk.bold(res?.entity?.status ?? newStatus)}`);
  });

program
  .command("session-sync")
  .description("Upload Claude Code session files from ~/.claude/projects/ as raw notes")
  .option("--since <iso>", "Only include sessions modified at/after this ISO timestamp")
  .option("--dry-run", "Don't upload; just print what would be sent")
  .action(async (opts) => {
    const baseDir = path.join(os.homedir(), ".claude", "projects");
    const since = opts.since ? new Date(String(opts.since)) : null;
    if (since && Number.isNaN(since.getTime())) throw new Error("Invalid --since timestamp");

    let newCount = 0;
    let skippedCount = 0;
    let total = 0;

    const files: string[] = [];
    async function walk(dir: string) {
      let entries: any[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(p);
          continue;
        }
        if (e.isFile()) files.push(p);
      }
    }

    await walk(baseDir);
    files.sort();

    for (const filePath of files) {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      if (since && stat.mtime < since) continue;

      total += 1;
      const rel = path.relative(baseDir, filePath);
      const externalId = createHash("sha256").update(`${filePath}:${stat.mtimeMs}`).digest("hex");

      if (opts.dryRun) {
        console.log(`${dim("DRY")} ${rel}`);
        continue;
      }

      const content = await fs.readFile(filePath, "utf8");
      const res = await apiFetch({
        path: "/api/notes/capture",
        method: "POST",
        body: {
          content,
          source: "cli" satisfies NoteSource,
          externalId,
          capturedAt: stat.mtime.toISOString(),
          sourceMeta: {
            kind: "claude_session",
            sessionPath: rel,
            absolutePath: filePath,
            mtimeMs: stat.mtimeMs,
            sizeBytes: stat.size,
          },
        },
      });

      if (res?.deduped) skippedCount += 1;
      else newCount += 1;
      process.stdout.write(".");
    }

    if (!opts.dryRun && total > 0) process.stdout.write("\n");
    console.log(`${green("session-sync")} ${newCount} new, ${skippedCount} skipped (${total} scanned)`);
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
        console.log(`${chalk.bold(item.reviewType)}  ${dim(item.id)}`);
        console.log(`confidence: ${formatConfidence(item.aiConfidence)}`);
        console.log(`suggestion: ${dim(JSON.stringify(item.aiSuggestion))}`);
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
