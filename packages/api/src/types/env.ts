import type { apiKeys, users } from "../db/schema/index.js";

export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;

export type AppEnv = {
  Variables: {
    requestId: string;
    user: User;
    apiKey: ApiKey;
  };
};

