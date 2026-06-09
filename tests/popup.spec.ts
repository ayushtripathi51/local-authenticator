import { expect, test } from "@playwright/test";

test("renders popup and creates a TOTP account from an otpauth URI", async ({ page }) => {
  await page.addInitScript(() => {
    const local = new Map<string, unknown>();
    const session = new Map<string, unknown>();
    const makeArea = (area: Map<string, unknown>) => ({
      get: async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        return Object.fromEntries(keys.map((storageKey) => [storageKey, area.get(storageKey)]));
      },
      set: async (items: Record<string, unknown>) => {
        Object.entries(items).forEach(([key, value]) => area.set(key, value));
      },
      remove: async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        keys.forEach((storageKey) => area.delete(storageKey));
      }
    });
    Object.defineProperty(window, "chrome", {
      value: {
        storage: {
          local: makeArea(local),
          session: makeArea(session)
        }
      }
    });
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: async () => true
      }
    });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: async () => ({
          type: "public-key",
          rawId: new Uint8Array([1, 2, 3, 4]).buffer
        }),
        get: async () => ({
          type: "public-key",
          rawId: new Uint8Array([1, 2, 3, 4]).buffer
        })
      }
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Create password" })).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByLabel("Confirm password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();

  await expect(page.getByRole("heading", { name: "No codes yet" })).toBeVisible();

  await page.getByRole("button", { name: "Add first code" }).click();
  await page
    .getByPlaceholder("otpauth://totp/Issuer:name?secret=...")
    .fill(
      "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
    );
  await page.getByRole("button", { name: "Import URL" }).click();
  await expect(page.getByPlaceholder("Google")).toHaveValue("Example");
  await expect(page.getByPlaceholder("name@example.com")).toHaveValue("alice@example.com");

  await page.locator("form").getByRole("button", { name: "Add code" }).click();

  await expect(page.getByText("Example").first()).toBeVisible();
  await expect(page.getByText("alice@example.com")).toBeVisible();
  await expect(page.locator(".account-card__code")).toHaveText(/\d{3} \d{3}/);
  await expect(page.getByRole("button", { name: "Enable biometric unlock" })).toBeVisible();
  await page.getByRole("button", { name: "Enable biometric unlock" }).click();
  await expect(page.getByRole("button", { name: "Disable biometric unlock" })).toBeVisible();

  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.getByRole("heading", { name: "Unlock vault" })).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("alice@example.com")).toBeVisible();
});
