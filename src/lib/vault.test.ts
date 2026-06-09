import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TotpAccount } from "./accounts";
import {
  addVaultAccount,
  createVault,
  getBiometricVaultStatus,
  getVaultStatus,
  lockVault,
  unlockFromSession,
  unlockVault,
  VAULT_STORAGE_KEY,
  LEGACY_ACCOUNTS_KEY,
  SESSION_STORAGE_KEY
} from "./vault";
import { BIOMETRIC_STORAGE_KEY } from "./biometric";

const localStorageArea = new Map<string, unknown>();
const sessionStorageArea = new Map<string, unknown>();

function makeStorageArea(area: Map<string, unknown>) {
  return {
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.map((storageKey) => [storageKey, area.get(storageKey)]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.entries(items).forEach(([key, value]) => area.set(key, value));
    }),
    remove: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      keys.forEach((storageKey) => area.delete(storageKey));
    })
  };
}

beforeEach(() => {
  localStorageArea.clear();
  sessionStorageArea.clear();
  vi.useRealTimers();
  vi.stubGlobal("chrome", {
    storage: {
      local: makeStorageArea(localStorageArea),
      session: makeStorageArea(sessionStorageArea)
    }
  });
});

describe("encrypted vault", () => {
  test("creates an encrypted vault that does not persist plaintext secrets", async () => {
    const account: TotpAccount = {
      id: "a",
      issuer: "Example",
      label: "alice@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      period: 30,
      digits: 6,
      algorithm: "SHA1",
      createdAt: 1,
      updatedAt: 1
    };

    const unlocked = await createVault("correct horse battery staple", [account]);
    const persisted = String(localStorageArea.get(VAULT_STORAGE_KEY));

    expect(unlocked.accounts).toEqual([account]);
    expect(persisted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(persisted).not.toContain("alice@example.com");
    expect(sessionStorageArea.get(SESSION_STORAGE_KEY)).toMatchObject({
      expiresAt: expect.any(Number)
    });
  });

  test("fails to unlock with the wrong password", async () => {
    await createVault("right-password", []);

    await expect(unlockVault("wrong-password")).rejects.toThrow("Incorrect password");
  });

  test("restores from session before expiry and rejects after expiry", async () => {
    vi.setSystemTime(new Date("2026-06-08T00:00:00.000Z"));
    await createVault("password", []);

    await expect(unlockFromSession()).resolves.toMatchObject({ accounts: [] });

    vi.setSystemTime(new Date("2026-06-09T00:00:01.000Z"));
    await expect(unlockFromSession()).rejects.toThrow("Vault is locked");
  });

  test("reports biometric lock when enrolled and the session key is still cached", async () => {
    vi.setSystemTime(new Date("2026-06-08T00:00:00.000Z"));
    await createVault("password", []);
    localStorageArea.set(BIOMETRIC_STORAGE_KEY, {
      credentialId: "AQIDBA",
      label: "Authenticator vault",
      createdAt: Date.now()
    });

    await expect(getBiometricVaultStatus()).resolves.toEqual({
      state: "biometric-locked",
      biometricAvailable: false
    });
  });

  test("migrates legacy plaintext accounts and removes the plaintext key", async () => {
    localStorageArea.set(LEGACY_ACCOUNTS_KEY, [
      {
        id: "legacy",
        issuer: "Legacy",
        label: "legacy@example.com",
        secret: "JBSWY3DPEHPK3PXP",
        period: 30,
        digits: 6,
        algorithm: "SHA1",
        createdAt: 1,
        updatedAt: 1
      }
    ]);

    const status = await getVaultStatus();
    expect(status).toEqual({ state: "needs-password-migration", legacyCount: 1 });

    await createVault("password");

    expect(localStorageArea.has(LEGACY_ACCOUNTS_KEY)).toBe(false);
    expect(String(localStorageArea.get(VAULT_STORAGE_KEY))).not.toContain("JBSWY3DPEHPK3PXP");
  });

  test("updates encrypted vault accounts without writing plaintext storage", async () => {
    let unlocked = await createVault("password", []);
    unlocked = await addVaultAccount(unlocked, {
      issuer: "Example",
      label: "alice@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      period: 30,
      digits: 6,
      algorithm: "SHA1"
    });

    expect(unlocked.accounts).toHaveLength(1);
    expect(String(localStorageArea.get(VAULT_STORAGE_KEY))).not.toContain("JBSWY3DPEHPK3PXP");
    expect(localStorageArea.has(LEGACY_ACCOUNTS_KEY)).toBe(false);

    await lockVault();
    await expect(unlockVault("password")).resolves.toMatchObject({
      accounts: [{ label: "alice@example.com" }]
    });
  });

  test("clears session unlock material on lock", async () => {
    await createVault("password", []);

    await lockVault();

    expect(sessionStorageArea.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  test("requires chrome extension storage and never falls back to localStorage", async () => {
    vi.stubGlobal("chrome", undefined);

    await expect(getVaultStatus()).rejects.toThrow("Chrome storage is required");
  });
});
