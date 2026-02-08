export const qk = {
  projects: () => ["projects"] as const,
  projectDashboard: (projectId: string) => ["projects", projectId, "dashboard"] as const,
  entities: (filters: Record<string, unknown>) => ["entities", filters] as const,
  entity: (entityId: string) => ["entities", entityId] as const,
  entityEvents: (entityId: string) => ["entities", entityId, "events"] as const,
  reviewQueue: (filters: Record<string, unknown>) => ["reviewQueue", filters] as const,
  reviewQueueCount: (filters: Record<string, unknown>) => ["reviewQueue", "count", filters] as const,
  apiKeys: () => ["auth", "apiKeys"] as const,
  tags: (q?: string) => ["tags", q ?? ""] as const,
};
