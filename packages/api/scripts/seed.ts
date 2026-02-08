import { db } from "../src/db/index.js";
import { apiKeys, users } from "../src/db/schema/index.js";
import { generateApiKey } from "../src/services/auth.js";

async function main() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    // Idempotent: don't create multiple seed users/keys.
    console.log("Seed skipped: users already exist.");
    return;
  }

  const { plaintextKey, keyHash } = await generateApiKey();

  const [user] = await db
    .insert(users)
    .values({
      name: "Admin",
      email: "admin@local",
    })
    .returning();

  await db.insert(apiKeys).values({
    userId: user!.id,
    name: "seed",
    keyHash,
  });

  console.log("Seed complete.");
  console.log("User:", user!.email);
  console.log("API key (plaintext, shown once):", plaintextKey);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
