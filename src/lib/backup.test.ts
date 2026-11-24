import { encrypt } from '@metamask/browser-passworder';
import { expect, test, vi } from 'vitest';
import * as vault from './vault';

const account = { id: 'demo', issuer: 'Example', label: 'test', secret: 'JBSWY3DPEHPK3PXP', period: 45, digits: 8, algorithm: 'SHA256' as const, createdAt: 1, updatedAt: 2 };
const password = 'fixture password only';
async function fixture() {
  const local = new Map<string, unknown>();
  const session = new Map<string, unknown>();
  const area = (map: Map<string, unknown>) => ({
    get: async (keys: string | string[]) => Object.fromEntries([keys].flat().map(k => [k, map.get(k)])),
    set: async (values: Record<string, unknown>) => Object.entries(values).forEach(([k, v]) => map.set(k, v)),
    remove: async (keys: string | string[]) => [keys].flat().forEach(k => map.delete(k))
  });
  vi.stubGlobal('chrome', { storage: { local: area(local), session: area(session) } });
  return { local, session, ciphertext: await encrypt(password, { accounts: [account] }) };
}

test('restores the same account parameters without transferring device credentials', async () => {
  const { local, session, ciphertext } = await fixture();
  local.set(vault.VAULT_STORAGE_KEY, ciphertext);
  const backup = await vault.exportVaultBackup();
  expect(backup).not.toContain(account.secret);
  local.clear();
  expect((await vault.restoreVaultBackup(backup, password)).accounts).toEqual([account]);
  expect([...local.keys()]).toEqual([vault.VAULT_STORAGE_KEY]);
  expect([...session.keys()]).toEqual([]);
});

test('wrong password or an existing vault cannot change storage', async () => {
  const { local, ciphertext } = await fixture();
  const backup = JSON.stringify({ version: 1, format: 'local-authenticator', ciphertext });
  await expect(vault.restoreVaultBackup(backup, 'incorrect password')).rejects.toThrow();
  expect(local.size).toBe(0);
  local.set(vault.LEGACY_ACCOUNTS_KEY, [account]);
  await expect(vault.restoreVaultBackup(backup, password)).rejects.toThrow(/already exists/);
  expect(local.size).toBe(1);
});

test('restores a backup taken after a normal account edit', async () => {
  const { local } = await fixture();
  const created = await vault.createVault(password, [account]);
  await vault.updateVaultAccount(created, account.id, { siteOrigin: 'https://login.example.test' });
  const backup = await vault.exportVaultBackup();
  local.clear();
  const restored = await vault.restoreVaultBackup(backup, password);
  expect(restored.accounts[0]).toMatchObject({ secret: account.secret, siteOrigin: 'https://login.example.test' });
});

test('rejects a paired origin that is not an exact https origin', async () => {
  const { local } = await fixture();
  const bad = await encrypt(password, { accounts: [{ ...account, siteOrigin: 'https://login.example.test/path' }] });
  await expect(vault.restoreVaultBackup(JSON.stringify({ version: 1, format: 'local-authenticator', ciphertext: bad }), password)).rejects.toThrow();
  expect(local.size).toBe(0);
});
