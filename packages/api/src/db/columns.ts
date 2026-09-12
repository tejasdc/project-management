import { check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/sqlite-core";
export { sqliteTable, text, real, index, uniqueIndex, check, primaryKey } from "drizzle-orm/sqlite-core";
export const uuid = (name = "") => text(name);
export const timestamp = (name = "", _options?: { withTimezone: boolean }) => integer(name, { mode: "timestamp_ms" });
export const boolean = (name = "") => integer(name, { mode: "boolean" });
export const jsonb = (name = "") => text(name, { mode: "json" });
export function sqliteEnum<T extends string, U extends [T, ...T[]]>(_type: string, values: U) {
  return (name = "") => text(name, { enum: values });
}

export function enumCheck(name: string, column: { enumValues?: readonly string[] } & import("drizzle-orm").SQLWrapper) {
  return check(name, sql`${column} IN (${sql.join((column.enumValues ?? []).map(value => sql.raw("'" + value.replaceAll("'", "''") + "'")), sql`, `)})`);
}
