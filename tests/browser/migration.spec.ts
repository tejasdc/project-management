import { test, expect } from "@playwright/test";
test("register, persistent project, live update, capture, logout and login", async ({ page, context }, testInfo) => {
  const suffix = crypto.randomUUID().slice(0, 8), email = suffix + "@example.test";
  const errors: string[] = [];
  const navigationDiagnostics: string[] = [];
  let navigating = false;
  const apiOrigin = new URL(process.env.CLARIFY_TEST_API ?? testInfo.project.use.baseURL!).origin;
  await page.addInitScript(() => {
    window.addEventListener("error", event => console.debug("UNCAUGHT_JS:" + event.message));
    window.addEventListener("unhandledrejection", event => console.debug("UNCAUGHT_JS:" + String(event.reason)));
  });
  page.on("console", message => { if (message.text().startsWith("UNCAUGHT_JS:")) errors.push(message.text()); });
  page.on("pageerror", error => {
    const diagnostic = error.stack?.split("\n")[0] ?? "";
    const prefix = "Fetch API cannot load " + apiOrigin;
    const path = diagnostic.slice(prefix.length).split("?")[0];
    const ownedRead = /^\/api\/(projects(?:\/[\da-f-]+\/dashboard)?|review-queue\/count)$/.test(path);
    if (testInfo.project.use.browserName === "webkit" && navigating && diagnostic.startsWith(prefix)
      && diagnostic.endsWith(" due to access control checks.") && ownedRead) navigationDiagnostics.push(diagnostic);
    else errors.push(error.message);
  });
  await page.goto("/projects");
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await page.getByPlaceholder("Name", { exact: true }).fill("Browser " + suffix);
  await page.getByPlaceholder("Email", { exact: true }).fill(email);
  await page.getByPlaceholder("Password (min 8 characters)").fill("browser verification password");
  await page.getByLabel("Workspace invitation code").fill(process.env.CLARIFY_INVITATION ?? "test-invitation");
  await page.getByRole("button", { name: "Create Account", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ New Project" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Browser project " + suffix);
  await page.getByRole("button", { name: "Create Project", exact: true }).click();
  await expect(page.getByText("Browser project " + suffix, { exact: true })).toBeVisible();
  navigating = true;
  try { await page.reload(); } finally { navigating = false; }
  await expect(page.getByText("Browser project " + suffix, { exact: true })).toBeVisible();

  const key = await page.evaluate(() => localStorage.getItem("pm_api_key"));
  const updated = await context.request.post((process.env.CLARIFY_TEST_API ?? "") + "/api/projects", {
    headers: { authorization: "Bearer " + key }, data: { name: "Live update " + suffix },
  });
  expect(updated.status()).toBe(201);
  await expect(page.getByText("Live update " + suffix, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("projects.png"), fullPage: true, animations: "disabled" });

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Type your thought, idea, or note...").fill("Browser capture " + suffix);
  const saved = page.waitForResponse(response => response.url().endsWith("/api/notes/capture") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Capture", exact: true }).last().click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByText("Browser capture " + suffix, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close modal", exact: true }).click();
  await page.getByRole("link", { name: "History", exact: true }).first().click();
  await page.getByRole("button", { name: /Raw notes/i }).click();
  await expect(page.getByText("Browser capture " + suffix, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("history.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("pm_api_key"))).toBeFalsy();
  await page.getByPlaceholder("Email", { exact: true }).fill(email);
  await page.getByPlaceholder("Password", { exact: true }).fill("browser verification password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.getByRole("button", { name: "Raw notes", exact: true }).click();
  await expect(page.getByText("Browser capture " + suffix, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await testInfo.attach("native-navigation-diagnostics", { body: JSON.stringify(navigationDiagnostics), contentType: "application/json" });
});
