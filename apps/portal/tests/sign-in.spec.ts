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

test("redirects an anonymous merchant-route request to sign-in", async ({
  page,
}) => {
  await page.goto("/transactions");
  await expect(page).toHaveURL("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("signs in a provisioned merchant without exposing credentials", async ({
  context,
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("merchant@example.test");
  await page.getByLabel("Password").fill("merchant-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/overview");
  expect(page.url()).not.toContain("merchant-password");
  const cookies = await context.cookies();
  expect(
    cookies.find((cookie) => cookie.name === "mcbuse_portal_access"),
  ).toMatchObject({
    httpOnly: true,
    value: "merchant-access",
  });
  expect(
    cookies.find((cookie) => cookie.name === "mcbuse_portal_refresh"),
  ).toMatchObject({
    httpOnly: true,
    value: "merchant-refresh",
  });
  expect(
    cookies.find((cookie) => cookie.name === "mcbuse_portal_csrf"),
  ).toMatchObject({
    httpOnly: false,
  });
});

test("rejects a valid consumer account that has no merchant membership", async ({
  context,
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("consumer@example.test");
  await page.getByLabel("Password").fill("consumer-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/sign-in");
  await expect(
    page.getByText("This account does not have merchant portal access"),
  ).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === "mcbuse_portal_access")).toBe(
    false,
  );
});

test("rotates an expired session before rendering a merchant route", async ({
  context,
  page,
}, testInfo) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "expired-access",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "mcbuse_portal_refresh",
      value: "expired-refresh",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/overview");
  await expect(page).toHaveURL("/overview");
  await expect(
    page.getByRole("navigation", {
      name: testInfo.project.name === "desktop" ? "Primary" : "Mobile",
    }),
  ).toBeVisible();
  const cookies = await context.cookies();
  expect(
    cookies.find((cookie) => cookie.name === "mcbuse_portal_access")?.value,
  ).toBe("refreshed-access");
  expect(
    cookies.find((cookie) => cookie.name === "mcbuse_portal_refresh")?.value,
  ).toBe("refreshed-refresh");
});

test("clears forged session cookies before showing a merchant route", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "forged-access",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "mcbuse_portal_refresh",
      value: "forged-refresh",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/overview");
  await expect(page).toHaveURL("/sign-in");
  const cookies = await context.cookies();
  expect(
    cookies.some((cookie) => cookie.name.startsWith("mcbuse_portal_")),
  ).toBe(false);
});

test("logs out remotely and clears all portal cookies", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one logout proof is enough");

  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("merchant@example.test");
  await page.getByLabel("Password").fill("merchant-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/overview");
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL("/sign-in");
  const cookies = await context.cookies();
  expect(
    cookies.some((cookie) => cookie.name.startsWith("mcbuse_portal_")),
  ).toBe(false);
});
