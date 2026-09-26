// OWNER: T0 (wave 0). The two surfaces answer 200 and render their stubs.
import { expect, test } from "@playwright/test";

test("GET / renders the nine marketing section stubs", async ({ page, request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  await page.goto("/");
  await expect(page.locator('[data-surface="marketing"]')).toBeVisible();
  const ids = await page.locator("main section[data-stub]").evaluateAll((els) => els.map((e) => e.id));
  expect(ids).toEqual(["proof", "negation", "wrong", "comment", "severity", "pipeline", "record", "accuracy", "run"]);
  await expect(page).toHaveTitle("PRGuard — proven, or it doesn't block");
});

test("GET /overview renders the dashboard stub", async ({ page, request }) => {
  const res = await request.get("/overview");
  expect(res.status()).toBe(200);
  await page.goto("/overview");
  await expect(page.locator('[data-surface="app"] section[data-stub][data-route="/overview"]')).toBeVisible();
  await expect(page.getByText("/overview", { exact: true })).toBeVisible();
});
