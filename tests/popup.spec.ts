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
          rawId: new Uint8Array([1, 2, 3, 4]).buffer,
          getClientExtensionResults: () => ({
            prf: {
              results: {
                first: new Uint8Array([5, 6, 7, 8]).buffer
              }
            }
          })
        }),
        get: async () => ({
          type: "public-key",
          rawId: new Uint8Array([1, 2, 3, 4]).buffer,
          getClientExtensionResults: () => ({
            prf: {
              results: {
                first: new Uint8Array([5, 6, 7, 8]).buffer
              }
            }
          })
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
    .getByPlaceholder("otpauth://totp/... or otpauth-migration://...")
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

  await page.getByRole("button", { name: "Add code" }).click();
  await page
    .getByPlaceholder("otpauth://totp/... or otpauth-migration://...")
    .fill(
      migrationUri([
        otpParameter({
          secret: new TextEncoder().encode("Hello"),
          name: "Migration:carol@example.com",
          issuer: "",
          algorithm: 1,
          digits: 1,
          type: 2
        }),
        otpParameter({
          secret: new Uint8Array([1, 2, 3, 4, 5]),
          name: "dave@example.com",
          issuer: "Imported",
          algorithm: 2,
          digits: 2,
          type: 2
        })
      ])
    );
  await page.getByRole("button", { name: "Import URL" }).click();
  await expect(page.getByText("carol@example.com")).toBeVisible();
  await expect(page.getByText("dave@example.com")).toBeVisible();

  await expect(page.getByRole("button", { name: "Enable biometric unlock" })).toBeVisible();
  await page.getByRole("button", { name: "Enable biometric unlock" }).click();
  await expect(page.getByRole("heading", { name: "Enable biometric unlock" })).toBeVisible();
  await expect(page.getByLabel("Vault password")).toHaveAttribute("type", "password");
  await page.getByLabel("Vault password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByRole("button", { name: "Disable biometric unlock" })).toBeVisible();

  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.getByRole("heading", { name: "Unlock vault" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock with biometrics" })).toBeVisible();
  await page.getByRole("button", { name: "Unlock with biometrics" }).click();
  await expect(page.getByText("alice@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.getByRole("heading", { name: "Unlock vault" })).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText("alice@example.com")).toBeVisible();
});

function migrationUri(otpParameters: Uint8Array[]) {
  const payload = concat([
    ...otpParameters.map((parameter) => fieldBytes(1, parameter)),
    fieldVarint(2, 1),
    fieldVarint(3, otpParameters.length),
    fieldVarint(4, 0),
    fieldVarint(5, 123)
  ]);
  return `otpauth-migration://offline?data=${encodeURIComponent(Buffer.from(payload).toString("base64"))}`;
}

function otpParameter(input: {
  secret: Uint8Array;
  name: string;
  issuer: string;
  algorithm: number;
  digits: number;
  type: number;
}) {
  return concat([
    fieldBytes(1, input.secret),
    fieldString(2, input.name),
    fieldString(3, input.issuer),
    fieldVarint(4, input.algorithm),
    fieldVarint(5, input.digits),
    fieldVarint(6, input.type)
  ]);
}

function fieldString(field: number, value: string) {
  return fieldBytes(field, new TextEncoder().encode(value));
}

function fieldBytes(field: number, value: Uint8Array) {
  return concat([varint((field << 3) | 2), varint(value.length), value]);
}

function fieldVarint(field: number, value: number) {
  return concat([varint(field << 3), varint(value)]);
}

function varint(value: number) {
  const bytes: number[] = [];
  let next = value;
  while (next >= 0x80) {
    bytes.push((next & 0x7f) | 0x80);
    next >>= 7;
  }
  bytes.push(next);
  return new Uint8Array(bytes);
}

function concat(chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
