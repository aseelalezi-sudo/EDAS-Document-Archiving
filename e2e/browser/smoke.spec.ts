import { expect, test, type Page } from "@playwright/test";

async function signInAsAdmin(page: Page) {
  await page.goto("/#/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.locator('input[autocomplete="username"]').fill("admin");
  await page.locator('input[autocomplete="current-password"]').fill("admin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/#\/dashboard/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
  });
});

test("the offline demo signs in and renders the dashboard", async ({ page }) => {
  await signInAsAdmin(page);
  await expect(page.getByText("Available documents").first()).toBeVisible();
  await expect(page.getByText("Recent documents").first()).toBeVisible();
});

test("the documents list opens a document and its preview route", async ({ page }) => {
  await signInAsAdmin(page);

  await page.getByRole("link", { name: "All Documents" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "All Documents" })).toBeVisible();

  await page.locator("tbody tr").first().click();
  await expect(page).toHaveURL(/#\/documents\/doc-\d+/);
  await expect(page.getByText(/^EDAS-\d+$/).first()).toBeVisible();

  const id = new URL(page.url()).hash.match(/documents\/(doc-\d+)/)?.[1];
  expect(id).toBeTruthy();

  await page.goto(`/#/documents/${id}/preview`);
  await expect(page.getByText("Preview requires the server connection")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
});

test("the language toggle switches direction and back", async ({ page }) => {
  await page.goto("/#/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");

  await page.getByRole("button", { name: /Switch language|تغيير اللغة/ }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("the production build ships a CSP without violations", async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    window.addEventListener("securitypolicyviolation", (event) => {
      const violation = event as SecurityPolicyViolationEvent;
      console.error(`CSP_VIOLATION ${violation.violatedDirective} ${violation.blockedURI}`);
    });
  });
  page.on("console", (message) => {
    if (message.text().includes("CSP_VIOLATION")) violations.push(message.text());
  });

  await page.goto("/#/login");
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await signInAsAdmin(page);
  await expect(page.getByText("Available documents").first()).toBeVisible();
  expect(violations).toEqual([]);
});
