import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { notePages, rawNotes } from "../db/schema/index.js";
import type { SourceMeta } from "@pm/shared";

const DOCUMENT_PAGE_BYTES = 64 * 1024;
type Note = typeof rawNotes.$inferSelect;
export function writeNotePayload(tx: Pick<typeof db, "insert">, noteId: string, content: string, sourceMeta?: SourceMeta) {
  const bytes = Buffer.from(JSON.stringify({ content, sourceMeta: sourceMeta ?? null }), "utf8");
  for (let offset = 0, page = 0; offset < bytes.length; offset += DOCUMENT_PAGE_BYTES, page++) {
    tx.insert(notePages).values({ rawNoteId: noteId, page, bytes: bytes.subarray(offset, offset + DOCUMENT_PAGE_BYTES) }).run();
  }
}
export function hydrateNote<T extends Note>(note: T): T {
  const pages = db.select({ bytes: notePages.bytes }).from(notePages)
    .where(eq(notePages.rawNoteId, note.id)).orderBy(asc(notePages.page)).all();
  // Inline fixture/import records remain readable; every new capture uses pages.
  if (!pages.length) return note;
  const payload = JSON.parse(Buffer.concat(pages.map(p => Buffer.from(p.bytes))).toString("utf8"));
  return { ...note, content: payload.content, sourceMeta: payload.sourceMeta };
}
