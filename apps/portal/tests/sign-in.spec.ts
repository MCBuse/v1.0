import { expect, test } from "@playwright/test";

test("sign-in is keyboard-ready at each responsive size", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email address").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
});

test("submits credentials with POST and navigates without exposing them", async ({
  page,
}) => {
  let loginMethod = "";
  await page.route("**/api/auth/login", async (route) => {
    loginMethod = route.request().method();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.goto("/sign-in");
  await page.context().addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-access-token",
      url: "http://127.0.0.1:3001",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.getByLabel("Email address").fill("merchant@example.test");
  await page.getByLabel("Password").fill("not-a-real-secret");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect.poll(() => loginMethod).toBe("POST");
  await expect(page).toHaveURL("/overview");
  expect(page.url()).not.toContain("not-a-real-secret");
});
