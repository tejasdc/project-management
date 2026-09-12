import { sql, type SQLWrapper } from "drizzle-orm";
// A JSON table carries the set as one value, including filters larger than 100 IDs.
export function inArray(column: SQLWrapper, values: readonly unknown[]) {
  return sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(values)}))`;
}
export function notInArray(column: SQLWrapper, values: readonly unknown[]) {
  return sql`${column} NOT IN (SELECT value FROM json_each(${JSON.stringify(values)}))`;
}
