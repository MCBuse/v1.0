import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:3101";

async function asOperator(page: Page) {
  await page.context().addCookies([
    {
      name: "mcbuse_portal_access",
      // One operator session per test: the mock's one-minute limit is per session.
      value: `operator-access.${randomUUID()}`,
      url: BASE,
      httpOnly: true,
    },
  ]);
}

test("operator finds a merchant by name or email and starts one update", async ({
  page,
}) => {
  await asOperator(page);
  // Sign-in lands staff on the credit area; operators without it are sent here.
  await page.goto("/staff/credit-assessments");
  await expect(page).toHaveURL(/\/staff\/changes$/);
  await expect(
    page.getByRole("heading", { name: "Changes: update now" }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Staff areas" });
  await expect(
    nav.getByRole("link", { name: "Changes: update now" }),
  ).toBeVisible();
  await expect(nav.getByRole("link", { name: "Credit pilot" })).toHaveCount(0);

  // Each viewport uses its own merchant, so the three searches differ.
  const target = {
    mobile: {
      query: "fred@",
      option: "MCBuse — fred@mcbuse.example",
      name: "MCBuse",
      status: "Last update failed",
    },
    tablet: {
      query: "bäckerei",
      option: "Bäckerei Nord — team@baeckerei.example",
      name: "Bäckerei Nord",
      status: "Update waiting to run",
    },
  }[test.info().project.name] ?? {
    query: "aci",
    option: "Aci Café — owner@aci.example",
    name: "Aci Café",
    status: "Up to date",
  };
  const search = page.getByRole("combobox", {
    name: "Search by business name or owner email",
  });
  await search.fill("fred@");
  await expect(
    page.getByRole("option", { name: "MCBuse — fred@mcbuse.example" }),
  ).toBeVisible();
  await search.fill(target.query);
  const option = page.getByRole("option", { name: target.option });
  await expect(option).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page.getByText(target.status)).toBeVisible();

  const button = page.getByRole("button", { name: "Update now" });
  await expect(button).toBeDisabled();
  await page.getByLabel("Reason").fill("Merchant restocked croissants");
  await button.click();
  await expect(
    page.getByText(new RegExp(`Update started for ${target.name}`)),
  ).toBeVisible();

  await page.getByLabel("Reason").fill("Second try");
  await page.getByRole("button", { name: "Update now" }).click();
  await expect(
    page.getByText(/already running or was started less than a minute ago/),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("staff-update-now.png"),
    fullPage: true,
  });
});

test("credit analysts without the permission do not see or reach Update now", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "mcbuse_portal_access",
      value: "staff-access",
      url: BASE,
      httpOnly: true,
    },
  ]);
  await page.goto("/staff/credit-assessments");
  const nav = page.getByRole("navigation", { name: "Staff areas" });
  await expect(nav.getByRole("link", { name: "Credit pilot" })).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Changes: update now" }),
  ).toHaveCount(0);
  const response = await page.goto("/staff/changes");
  expect(response?.status()).toBe(404);
  expect(
    (await page.request.get("/api/staff/changes/merchants")).status(),
  ).toBe(403);
  expect((await page.request.get("/api/staff/changes/other")).status()).toBe(
    404,
  );
});
