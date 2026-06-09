import { Fingerprint, Lock, Plus, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TotpAccount, TotpAccountInput } from "./lib/accounts";
import { generateTotp, getCountdown } from "./lib/totp";
import {
  disableBiometricUnlock,
  enableBiometricUnlock,
  getBiometricEnrollment,
  isBiometricUnlockAvailable
} from "./lib/biometric";
import {
  addVaultAccount,
  createVault,
  deleteVaultAccount,
  getVaultStatus,
  lockVault,
  unlockVaultWithBiometric,
  unlockVault,
  updateVaultAccount,
  type UnlockedVault
} from "./lib/vault";
import { AccountCard } from "./components/AccountCard";
import { AccountForm } from "./components/AccountForm";
import { LockScreen } from "./components/LockScreen";

type CodeMap = Record<string, string>;

export function App() {
  const [vault, setVault] = useState<UnlockedVault | null>(null);
  const [lockMode, setLockMode] = useState<"biometric" | "loading" | "create" | "migrate" | "unlock">(
    "loading"
  );
  const [legacyCount, setLegacyCount] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [codes, setCodes] = useState<CodeMap>({});
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TotpAccount | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");

  const accounts = vault?.accounts ?? [];

  useEffect(() => {
    refreshVaultStatus();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshCodes() {
      const nextCodes: CodeMap = {};
      for (const account of accounts) {
        nextCodes[account.id] = await generateTotp({
          secret: account.secret,
          timestamp: now / 1000,
          period: account.period,
          digits: account.digits,
          algorithm: account.algorithm
        });
      }
      if (!cancelled) {
        setCodes(nextCodes);
      }
    }

    refreshCodes().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Could not generate codes");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accounts, now]);

  const visibleAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return accounts;
    }
    return accounts.filter((account) =>
      `${account.issuer} ${account.label}`.toLowerCase().includes(normalizedQuery)
    );
  }, [accounts, query]);

  async function refreshVaultStatus() {
    try {
      const [status, enrollment, available] = await Promise.all([
        getVaultStatus(),
        getBiometricEnrollment(),
        isBiometricUnlockAvailable()
      ]);
      setBiometricEnabled(!!enrollment);
      setBiometricAvailable(available);
      if (status.state === "unlocked") {
        setVault(status.vault);
        setLockMode("unlock");
      } else if (status.state === "biometric-locked") {
        setVault(null);
        setBiometricAvailable(status.biometricAvailable);
        setLockMode("biometric");
      } else if (status.state === "needs-password-migration") {
        setLockMode("migrate");
        setLegacyCount(status.legacyCount);
      } else {
        setLockMode(status.state === "new" ? "create" : "unlock");
      }
      setError("");
    } catch (err) {
      setLockMode("unlock");
      setError(err instanceof Error ? err.message : "Could not load vault");
    }
  }

  async function saveAccount(input: TotpAccountInput) {
    if (!vault) {
      return;
    }
    const nextVault = editingAccount
      ? await updateVaultAccount(vault, editingAccount.id, input)
      : await addVaultAccount(vault, input);
    setVault(nextVault);
    if (editingAccount) {
      setEditingAccount(null);
    }
    setShowForm(false);
  }

  async function removeAccount(id: string) {
    if (!vault) {
      return;
    }
    setVault(await deleteVaultAccount(vault, id));
  }

  async function submitPassword(password: string) {
    try {
      const nextVault =
        lockMode === "unlock" || lockMode === "biometric"
          ? await unlockVault(password)
          : await createVault(password);
      setVault(nextVault);
      setLockMode("unlock");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock vault");
    }
  }

  async function submitBiometricUnlock() {
    try {
      const nextVault = await unlockVaultWithBiometric();
      setVault(nextVault);
      setLockMode("unlock");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock with biometrics");
    }
  }

  async function toggleBiometricUnlock() {
    try {
      if (biometricEnabled) {
        await disableBiometricUnlock();
        setBiometricEnabled(false);
      } else {
        await enableBiometricUnlock("Local Authenticator vault");
        setBiometricEnabled(true);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update biometric unlock");
    }
  }

  async function lock() {
    await lockVault();
    setVault(null);
    setCodes({});
    setShowForm(false);
    setEditingAccount(null);
    setLockMode("unlock");
  }

  async function copyCode(account: TotpAccount) {
    const code = codes[account.id];
    if (!code) {
      return;
    }
    await navigator.clipboard.writeText(code);
    setCopiedId(account.id);
    window.setTimeout(() => setCopiedId(""), 1200);
  }

  function startAdd() {
    setEditingAccount(null);
    setShowForm(true);
  }

  function startEdit(account: TotpAccount) {
    setEditingAccount(account);
    setShowForm(true);
  }

  const countdown = getCountdown(now, 30);

  if (lockMode === "loading") {
    return (
      <main className="lock-shell">
        <section className="lock-panel">
          <div className="lock-panel__icon">
            <ShieldCheck size={30} />
          </div>
          <h1>Local Authenticator</h1>
          <p>Loading vault</p>
        </section>
      </main>
    );
  }

  if (!vault) {
    return (
      <LockScreen
        mode={
          lockMode === "migrate"
            ? "migrate"
            : lockMode === "create"
              ? "create"
              : lockMode === "biometric"
                ? "biometric"
                : "unlock"
        }
        legacyCount={legacyCount}
        error={error}
        biometricAvailable={biometricAvailable}
        onBiometricUnlock={submitBiometricUnlock}
        onSubmit={submitPassword}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand__icon">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1>Local Authenticator</h1>
            <p>Private TOTP vault</p>
          </div>
        </div>
        <div className="app-actions">
          <button
            className="biometric-button"
            type="button"
            disabled={!biometricAvailable && !biometricEnabled}
            onClick={toggleBiometricUnlock}
            aria-label={biometricEnabled ? "Disable biometric unlock" : "Enable biometric unlock"}
            title={biometricEnabled ? "Disable biometric unlock" : "Enable biometric unlock"}
          >
            <Fingerprint size={18} />
            <span>{biometricEnabled ? "On" : biometricAvailable ? "Bio" : "N/A"}</span>
          </button>
          <button className="lock-button" type="button" onClick={lock} aria-label="Lock vault">
            <Lock size={20} />
          </button>
          <button className="add-button" type="button" onClick={startAdd} aria-label="Add code">
            <Plus size={22} />
          </button>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      {showForm ? (
        <AccountForm
          editingAccount={editingAccount}
          onSave={saveAccount}
          onCancel={() => {
            setShowForm(false);
            setEditingAccount(null);
          }}
        />
      ) : null}

      <section className="search-bar" aria-label="Search accounts">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          autoComplete="off"
        />
      </section>

      {accounts.length === 0 ? (
        <section className="empty-state">
          <ShieldCheck size={38} />
          <h2>No codes yet</h2>
          <p>Add a setup key or otpauth URL to generate codes from this popup only.</p>
          <button className="primary-button" type="button" onClick={startAdd}>
            <Plus size={18} />
            Add first code
          </button>
        </section>
      ) : (
        <section className="account-list" aria-label="TOTP accounts">
          {visibleAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              code={codes[account.id] ?? "------"}
              seconds={getCountdown(now, account.period).secondsRemaining}
              progress={getCountdown(now, account.period).progress}
              copied={copiedId === account.id}
              onCopy={() => copyCode(account)}
              onEdit={() => startEdit(account)}
              onDelete={() => removeAccount(account.id)}
            />
          ))}
          {visibleAccounts.length === 0 ? (
            <p className="no-results">No matching accounts.</p>
          ) : null}
        </section>
      )}

      <footer className="app-footer">
        <span>{accounts.length} saved</span>
        <span>{countdown.secondsRemaining}s</span>
      </footer>
    </main>
  );
}
