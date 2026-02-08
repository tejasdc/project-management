import { Command } from "commander";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import readline from "node:readline/promises";

import type { NoteSource } from "@pm/shared";
import chalk from "chalk";
import Table from "cli-table3";

import type { Config } from "./config.js";
import { getDefaultConfigPath, readConfig as readConfigFile, writeConfig as writeConfigFile } from "./config.js";

const red = (s: string) => chalk.red(s);
const green = (s: string) => chalk.green(s);
const dim = (s: string) => chalk.dim(s);
const yellow = (s: string) => chalk.yellow(s);
const cyan = (s: string) => chalk.cyan(s);

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

function maskKey(key: string) {
  const s = String(key);
  if (s.length <= 8) return "********";
  return `${"*".repeat(Math.min(12, s.length - 4))}${s.slice(-4)}`;
}

function normalizeRelPath(p: string) {
  // Keep externalId stable across OS path separators.
  return p.split(path.sep).join("/");
}

function tableForTerminal(opts?: { head?: string[]; colWidths?: number[]; wordWrap?: boolean }) {
  return new Table({
    head: opts?.head?.map((h) => chalk.bold(h)),
    colWidths: opts?.colWidths,
    wordWrap: opts?.wordWrap,
    style: { head: [], border: [] },
  });
}

function printMessage(message: string, kind: "info" | "success" | "warn" = "info") {
  const label =
    kind === "success" ? green("OK") : kind === "warn" ? yellow("WARN") : cyan("INFO");
  const t = tableForTerminal({ head: ["", ""] });
  t.push([label, message]);
  console.log(t.toString());
}

function toCell(value: unknown) {
  if (value === null || value === undefined) return dim("n/a");
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateAscii(s: string, max: number) {
  if (s.length <= max) return s;
  if (max <= 3) return s.slice(0, max);
  return `${s.slice(0, max - 3)}...`;
}

function toInlineCell(value: unknown, max = 60) {
  const s = toCell(value).replace(/\s+/g, " ").trim();
  return truncateAscii(s, max);
}

async function readConfig(): Promise<Config | null> {
  return readConfigFile();
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
        printMessage("No config found.", "warn");
        return;
      }
      const t = tableForTerminal({ head: ["Key", "Value"] });
      t.push(["Config path", dim(getDefaultConfigPath())]);
      t.push(["API URL", current.apiUrl]);
      t.push(["API key", dim(maskKey(current.apiKey))]);
      console.log(t.toString());
      return;
    }

    const apiUrl = opts.url ?? current?.apiUrl;
    const apiKey = opts.key ?? current?.apiKey;
    if (!apiUrl || !apiKey) throw new Error("Provide --url and --key (or use --show).");

    await writeConfigFile({ apiUrl, apiKey });
    const t = tableForTerminal({ head: ["Result", "Value"] });
    t.push([green("Saved"), dim(getDefaultConfigPath())]);
    t.push(["API URL", apiUrl]);
    t.push(["API key", dim(maskKey(apiKey))]);
    console.log(t.toString());
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
    const t = tableForTerminal({ head: ["Field", "Value"] });
    t.push(["Result", green("Captured")]);
    t.push(["Note", dim(shortId(noteId))]);
    t.push(["Deduped", deduped ? yellow("true") : green("false")]);
    console.log(t.toString());
  });

program
  .command("projects")
  .description("List projects")
  .action(async () => {
    const res = await apiFetch({ path: "/api/projects?status=active" });
    const table = tableForTerminal({ head: ["Name", "Id"] });
    for (const p of res.items ?? []) {
      table.push([p.name, dim(shortId(p.id))]);
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
    const table = tableForTerminal({ head: ["Status", "Content", "Id"], colWidths: [14, 70, 12], wordWrap: true });
    for (const t of res.items ?? []) {
      const status = String(t.status ?? "");
      const coloredStatus = status === "done" ? green(status) : status === "in_progress" ? yellow(status) : status;
      table.push([coloredStatus, t.content, dim(shortId(t.id))]);
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
    const t = tableForTerminal({ head: ["Field", "Value"] });
    t.push(["Result", green("Updated")]);
    t.push(["Entity", dim(shortId(res?.entity?.id ?? entityId))]);
    t.push(["Status", chalk.bold(res?.entity?.status ?? newStatus)]);
    console.log(t.toString());
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
    let considered = 0;

    const files: string[] = [];
    async function walk(dir: string) {
      let entries: import("node:fs").Dirent[];
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

    const displayed: Array<[string, string, string]> = [];
    const DISPLAY_LIMIT = 25;

    for (const filePath of files) {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      if (since && stat.mtime < since) continue;

      const rel = path.relative(baseDir, filePath);
      const relNorm = normalizeRelPath(rel);

      // Heuristic: Claude Code stores sessions under per-project folders, typically in a sessions/ subtree.
      // Only sync likely session artifacts to avoid uploading unrelated project metadata.
      const baseName = relNorm.split("/").pop() ?? relNorm;
      const isLikelySession =
        relNorm.endsWith(".jsonl") ||
        (relNorm.endsWith(".json") && (relNorm.includes("/sessions/") || baseName.includes("session")));
      if (!isLikelySession) continue;

      considered += 1;
      const externalId = `claude_code_session:${relNorm}`;

      if (opts.dryRun) {
        total += 1;
        if (displayed.length < DISPLAY_LIMIT) displayed.push([relNorm, dim("dry-run"), dim("-")]);
        continue;
      }

      const content = await fs.readFile(filePath, "utf8");
      const res = await apiFetch({
        path: "/api/notes/capture",
        method: "POST",
        body: {
          content: `Claude Code session: ${relNorm}\n\n${content}`,
          source: "cli" satisfies NoteSource,
          externalId,
          capturedAt: stat.mtime.toISOString(),
          sourceMeta: {
            kind: "claude_code_session",
            sessionPath: relNorm,
            mtimeMs: stat.mtimeMs,
            sizeBytes: stat.size,
          },
        },
      });

      total += 1;
      const noteId = res?.note?.id ? shortId(res.note.id) : "-";
      if (res?.deduped) {
        skippedCount += 1;
        if (displayed.length < DISPLAY_LIMIT) displayed.push([relNorm, dim("skipped (deduped)"), dim(noteId)]);
      } else {
        newCount += 1;
        if (displayed.length < DISPLAY_LIMIT) displayed.push([relNorm, green("uploaded"), dim(noteId)]);
      }
    }

    const itemsTable = tableForTerminal({ head: ["Session", "Outcome", "Note"] , colWidths: [60, 18, 10], wordWrap: true });
    for (const row of displayed) itemsTable.push(row);
    if (considered > DISPLAY_LIMIT) itemsTable.push([dim(`... (${considered - DISPLAY_LIMIT} more)`), dim(""), dim("")]);
    console.log(itemsTable.toString());

    const summary = tableForTerminal({ head: ["Metric", "Value"] });
    summary.push(["Considered", String(considered)]);
    summary.push(["Uploaded (new)", green(String(newCount))]);
    summary.push(["Skipped (deduped)", yellow(String(skippedCount))]);
    summary.push(["Uploaded/Skipped", String(total)]);
    if (since) summary.push(["Since", since.toISOString()]);
    if (opts.dryRun) summary.push(["Dry run", yellow("true")]);
    console.log(summary.toString());
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
      printMessage("No pending review items.", "success");
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const list = tableForTerminal({
        head: ["#", "Type", "Confidence", "Entity", "Suggestion", "Review"],
        colWidths: [4, 22, 12, 10, 48, 10],
        wordWrap: true,
      });
      items.forEach((it, idx) => {
        list.push([
          String(idx + 1),
          chalk.bold(String(it.reviewType ?? "")),
          formatConfidence(it.aiConfidence),
          dim(shortId(it.entityId)),
          dim(toInlineCell(it.aiSuggestion)),
          dim(shortId(it.id)),
        ]);
      });
      console.log(list.toString());

      for (const item of items) {
        const details = tableForTerminal({ head: ["Field", "Value"], colWidths: [18, 90], wordWrap: true });
        details.push(["Review", dim(shortId(item.id))]);
        details.push(["Type", chalk.bold(String(item.reviewType ?? ""))]);
        details.push(["Confidence", formatConfidence(item.aiConfidence)]);
        details.push(["Suggestion", dim(toCell(item.aiSuggestion))]);
        if (item.entityId) {
          const ent = await apiFetch({ path: `/api/entities/${item.entityId}` });
          details.push(["Entity", dim(shortId(item.entityId))]);
          details.push(["Content", String(ent.entity?.content ?? "")]);
          details.push(["Status", String(ent.entity?.status ?? "")]);
        }
        console.log(details.toString());

        const actions = tableForTerminal({ head: ["Key", "Action"] });
        actions.push([green("a"), "accept"]);
        actions.push([red("r"), "reject"]);
        actions.push([yellow("m"), "modify"]);
        actions.push([dim("s"), "skip"]);
        console.log(actions.toString());

        const action = (await rl.question(cyan("Action [a/r/m/s]: "))).trim().toLowerCase();
        if (action === "s" || action === "") continue;

        if (action === "a" || action === "r") {
          const status = action === "a" ? "accepted" : "rejected";
          const out = await apiFetch({
            path: `/api/review-queue/${item.id}/resolve`,
            method: "POST",
            body: { status },
          });
          const t = tableForTerminal({ head: ["Field", "Value"] });
          t.push(["Result", green("resolved")]);
          t.push(["Review", dim(shortId(out.item?.id ?? item.id))]);
          t.push(["Status", chalk.bold(String(out.item?.status ?? status))]);
          console.log(t.toString());
          continue;
        }

        if (action === "m") {
          const userResolution: Record<string, unknown> = {};
          if (item.reviewType === "type_classification") {
            const t = (await rl.question(cyan("New type (task|decision|insight): "))).trim();
            if (!["task", "decision", "insight"].includes(t)) {
              printMessage("Invalid type; skipping item.", "warn");
              continue;
            }
            userResolution.suggestedType = t;
          } else if (item.reviewType === "project_assignment") {
            const pid = (await rl.question(cyan("Project ID (blank to skip): "))).trim();
            if (pid) userResolution.suggestedProjectId = pid;
          } else if (item.reviewType === "epic_assignment") {
            const eid = (await rl.question(cyan("Epic ID (blank to skip): "))).trim();
            if (eid) userResolution.suggestedEpicId = eid;
          } else if (item.reviewType === "assignee_suggestion") {
            const aid = (await rl.question(cyan("Assignee user ID (blank to skip): "))).trim();
            if (aid) userResolution.suggestedAssigneeId = aid;
          } else if (item.reviewType === "duplicate_detection") {
            const did = (await rl.question(cyan("Duplicate entity ID: "))).trim();
            userResolution.duplicateEntityId = did;
          } else if (item.reviewType === "epic_creation") {
            const name = (await rl.question(cyan("Epic name: "))).trim();
            const desc = (await rl.question(cyan("Epic description (optional): "))).trim();
            userResolution.proposedEpicName = name;
            if (desc) userResolution.proposedEpicDescription = desc;
          } else {
            printMessage("Modify not supported for this review type; skipping.", "warn");
            continue;
          }

          const trainingComment = (await rl.question(cyan("Training comment (optional): "))).trim();

          const out = await apiFetch({
            path: `/api/review-queue/${item.id}/resolve`,
            method: "POST",
            body: { status: "modified", userResolution, trainingComment: trainingComment || undefined },
          });
          const t = tableForTerminal({ head: ["Field", "Value"], colWidths: [18, 90], wordWrap: true });
          t.push(["Result", green("resolved")]);
          t.push(["Review", dim(shortId(out.item?.id ?? item.id))]);
          t.push(["Status", chalk.bold(String(out.item?.status ?? "modified"))]);
          t.push(["Resolution", dim(toCell(userResolution))]);
          if (trainingComment) t.push(["Comment", trainingComment]);
          console.log(t.toString());
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
