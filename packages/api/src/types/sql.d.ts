declare module "*.sql" { const sql: string; export default sql; }
declare module "*drizzle-sqlite/migrations.js" {
  const migrations: { journal: { entries: { idx: number; when: number; tag: string; breakpoints: boolean }[] }; migrations: Record<string, string> };
  export default migrations;
}
