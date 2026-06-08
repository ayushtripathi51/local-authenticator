import { describe, expect, test, vi } from "vitest";
import {
  createAccount,
  deleteAccountFromList,
  sortAccounts,
  updateAccountInList,
  type TotpAccount
} from "./accounts";

vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  randomUUID: () => "fixed-id"
});

describe("account helpers", () => {
  test("creates accounts with normalized fields", () => {
    const created = createAccount({
      issuer: " Example ",
      label: " alice@example.com ",
      secret: "jbsw y3dp",
      period: 30,
      digits: 6,
      algorithm: "SHA1"
    });

    expect(created).toMatchObject({
      id: "fixed-id",
      issuer: "Example",
      label: "alice@example.com",
      secret: "JBSWY3DP",
      period: 30,
      digits: 6,
      algorithm: "SHA1"
    });
  });

  test("updates an existing account without changing other accounts", () => {
    const first: TotpAccount = {
      id: "a",
      issuer: "First",
      label: "one",
      secret: "JBSWY3DP",
      period: 30,
      digits: 6,
      algorithm: "SHA1",
      createdAt: 1,
      updatedAt: 1
    };
    const second: TotpAccount = {
      ...first,
      id: "b",
      issuer: "Second"
    };

    const updated = updateAccountInList([first, second], "b", { issuer: "Updated", label: " two " });

    expect(updated).toMatchObject([
      { id: "b", issuer: "Updated", label: "two" },
      { id: "a", issuer: "First", label: "one" }
    ]);
  });

  test("deletes an account by id", () => {
    const account: TotpAccount = {
      id: "a",
      issuer: "Example",
      label: "alice",
      secret: "JBSWY3DP",
      period: 30,
      digits: 6,
      algorithm: "SHA1",
      createdAt: 1,
      updatedAt: 1
    };

    expect(deleteAccountFromList([account], "a")).toEqual([]);
  });

  test("sorts newest updated accounts first", () => {
    expect(
      sortAccounts([
        { id: "a", issuer: "A", label: "a", secret: "JBSWY3DP", period: 30, digits: 6, algorithm: "SHA1", createdAt: 1, updatedAt: 1 },
        { id: "b", issuer: "B", label: "b", secret: "JBSWY3DP", period: 30, digits: 6, algorithm: "SHA1", createdAt: 2, updatedAt: 5 }
      ])
    ).toMatchObject([{ id: "b" }, { id: "a" }]);
  });
});
