import {
  decrypt,
  decryptWithDetail,
  encrypt,
  encryptWithDetail,
  importKey
} from "@metamask/browser-passworder";
import {
  createAccount,
  deleteAccountFromList,
  normalizeAccounts,
  sortAccounts,
  updateAccountInList,
  type TotpAccount,
  type TotpAccountInput
} from "./accounts";

export const VAULT_STORAGE_KEY = "totp.encryptedVault";
export const LEGACY_ACCOUNTS_KEY = "totp.accounts";
export const SESSION_STORAGE_KEY = "totp.unlockSession";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type VaultPayload = {
  accounts: TotpAccount[];
};

export type UnlockedVault = {
  accounts: TotpAccount[];
  exportedKeyString: string;
};

export type VaultStatus =
  | { state: "new" }
  | { state: "locked" }
  | { state: "unlocked"; vault: UnlockedVault }
  | { state: "needs-password-migration"; legacyCount: number };

type UnlockSession = {
  exportedKeyString: string;
  expiresAt: number;
};

export async function getVaultStatus(): Promise<VaultStatus> {
  const storage = getChromeStorage();
  const result = await storage.local.get([VAULT_STORAGE_KEY, LEGACY_ACCOUNTS_KEY]);

  if (typeof result[VAULT_STORAGE_KEY] === "string") {
    try {
      return { state: "unlocked", vault: await unlockFromSession() };
    } catch {
      return { state: "locked" };
    }
  }

  const legacyAccounts = parseLegacyAccounts(result[LEGACY_ACCOUNTS_KEY]);
  if (legacyAccounts.length > 0) {
    return {
      state: "needs-password-migration",
      legacyCount: legacyAccounts.length
    };
  }

  return { state: "new" };
}

export async function createVault(
  password: string,
  initialAccounts?: TotpAccount[]
): Promise<UnlockedVault> {
  assertPassword(password);
  const storage = getChromeStorage();
  const result = await storage.local.get(LEGACY_ACCOUNTS_KEY);
  const legacyAccounts = parseLegacyAccounts(result[LEGACY_ACCOUNTS_KEY]);
  const accounts = normalizeAccounts(initialAccounts ?? legacyAccounts);
  const encrypted = await encryptWithDetail(password, { accounts });

  await storage.local.set({ [VAULT_STORAGE_KEY]: encrypted.vault });
  await storage.local.remove(LEGACY_ACCOUNTS_KEY);
  await saveSession(encrypted.exportedKeyString);

  return {
    accounts,
    exportedKeyString: encrypted.exportedKeyString
  };
}

export async function unlockVault(password: string): Promise<UnlockedVault> {
  assertPassword(password);
  const vault = await readEncryptedVault();
  const result = await decryptWithDetail(password, vault);
  const payload = parseVaultPayload(result.vault);

  await saveSession(result.exportedKeyString);

  return {
    accounts: payload.accounts,
    exportedKeyString: result.exportedKeyString
  };
}

export async function unlockFromSession(now = Date.now()): Promise<UnlockedVault> {
  const storage = getChromeStorage();
  const result = await storage.session.get(SESSION_STORAGE_KEY);
  const session = result[SESSION_STORAGE_KEY] as UnlockSession | undefined;

  if (!session?.exportedKeyString || session.expiresAt <= now) {
    await storage.session.remove(SESSION_STORAGE_KEY);
    throw new Error("Vault is locked");
  }

  const vault = await readEncryptedVault();
  const key = await importKey(session.exportedKeyString);
  const payload = parseVaultPayload(await decrypt("", vault, key));

  return {
    accounts: payload.accounts,
    exportedKeyString: session.exportedKeyString
  };
}

export async function saveUnlockedVault(unlocked: UnlockedVault): Promise<UnlockedVault> {
  const storage = getChromeStorage();
  const currentVault = await readEncryptedVault();
  const currentSalt = readVaultSalt(currentVault);
  const key = await importKey(unlocked.exportedKeyString);
  const accounts = normalizeAccounts(unlocked.accounts);
  const encryptedVault = await encrypt("", { accounts }, key, currentSalt);

  await storage.local.set({ [VAULT_STORAGE_KEY]: encryptedVault });
  await storage.local.remove(LEGACY_ACCOUNTS_KEY);

  return {
    accounts,
    exportedKeyString: unlocked.exportedKeyString
  };
}

export async function addVaultAccount(
  unlocked: UnlockedVault,
  input: TotpAccountInput
): Promise<UnlockedVault> {
  return saveUnlockedVault({
    ...unlocked,
    accounts: [createAccount(input), ...unlocked.accounts]
  });
}

export async function updateVaultAccount(
  unlocked: UnlockedVault,
  id: string,
  input: Partial<TotpAccountInput>
): Promise<UnlockedVault> {
  return saveUnlockedVault({
    ...unlocked,
    accounts: updateAccountInList(unlocked.accounts, id, input)
  });
}

export async function deleteVaultAccount(
  unlocked: UnlockedVault,
  id: string
): Promise<UnlockedVault> {
  return saveUnlockedVault({
    ...unlocked,
    accounts: deleteAccountFromList(unlocked.accounts, id)
  });
}

export async function lockVault(): Promise<void> {
  await getChromeStorage().session.remove(SESSION_STORAGE_KEY);
}

async function saveSession(exportedKeyString: string): Promise<void> {
  await getChromeStorage().session.set({
    [SESSION_STORAGE_KEY]: {
      exportedKeyString,
      expiresAt: Date.now() + SESSION_TTL_MS
    } satisfies UnlockSession
  });
}

async function readEncryptedVault(): Promise<string> {
  const result = await getChromeStorage().local.get(VAULT_STORAGE_KEY);
  const vault = result[VAULT_STORAGE_KEY];
  if (typeof vault !== "string") {
    throw new Error("No vault found");
  }
  return vault;
}

function parseVaultPayload(value: unknown): VaultPayload {
  if (!value || typeof value !== "object" || !Array.isArray((value as VaultPayload).accounts)) {
    throw new Error("Invalid vault data");
  }
  return {
    accounts: sortAccounts((value as VaultPayload).accounts)
  };
}

function readVaultSalt(vault: string): string {
  const parsed = JSON.parse(vault) as { salt?: unknown };
  if (typeof parsed.salt !== "string") {
    throw new Error("Invalid vault salt");
  }
  return parsed.salt;
}

function parseLegacyAccounts(value: unknown): TotpAccount[] {
  return Array.isArray(value) ? normalizeAccounts(value as TotpAccount[]) : [];
}

function assertPassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
}

function getChromeStorage(): typeof chrome.storage {
  if (!globalThis.chrome?.storage?.local || !globalThis.chrome?.storage?.session) {
    throw new Error("Chrome storage is required");
  }
  return chrome.storage;
}
