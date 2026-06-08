import { decodeBase32, sanitizeSecret, type TotpAlgorithm } from "./totp";

export type TotpAccount = {
  id: string;
  issuer: string;
  label: string;
  secret: string;
  period: number;
  digits: number;
  algorithm: TotpAlgorithm;
  createdAt: number;
  updatedAt: number;
};

export type TotpAccountInput = {
  issuer: string;
  label: string;
  secret: string;
  period?: number;
  digits?: number;
  algorithm?: TotpAlgorithm;
};

export function createAccount(input: TotpAccountInput): TotpAccount {
  const now = Date.now();
  return normalizeAccount({
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  });
}

export function updateAccountInList(
  accounts: TotpAccount[],
  id: string,
  input: Partial<TotpAccountInput>
): TotpAccount[] {
  const index = accounts.findIndex((account) => account.id === id);
  if (index === -1) {
    throw new Error("Account not found");
  }

  const nextAccounts = [...accounts];
  nextAccounts[index] = normalizeAccount({
    ...nextAccounts[index],
    ...input,
    id,
    createdAt: nextAccounts[index].createdAt,
    updatedAt: Date.now()
  });
  return sortAccounts(nextAccounts);
}

export function deleteAccountFromList(accounts: TotpAccount[], id: string): TotpAccount[] {
  return sortAccounts(accounts.filter((account) => account.id !== id));
}

export function sortAccounts(accounts: TotpAccount[]): TotpAccount[] {
  return [...accounts].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function normalizeAccounts(accounts: TotpAccount[]): TotpAccount[] {
  return sortAccounts(accounts.map((account) => normalizeAccount(account)));
}

function normalizeAccount(
  account: TotpAccountInput & Pick<TotpAccount, "id" | "createdAt" | "updatedAt">
): TotpAccount {
  const issuer = account.issuer.trim();
  const label = account.label.trim();
  const secret = sanitizeSecret(account.secret);
  const period = account.period ?? 30;
  const digits = account.digits ?? 6;
  const algorithm = account.algorithm ?? "SHA1";

  if (!label) {
    throw new Error("Account label is required");
  }
  if (![6, 7, 8].includes(digits)) {
    throw new Error("TOTP digits must be 6, 7, or 8");
  }
  if (period <= 0) {
    throw new Error("TOTP period must be positive");
  }
  decodeBase32(secret);

  return {
    id: account.id,
    issuer,
    label,
    secret,
    period,
    digits,
    algorithm,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}
