import { Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";

import { MAX_BACKUP_BYTES } from "../lib/vault";

type LockScreenProps = {
  mode: "biometric" | "create" | "migrate" | "unlock";
  legacyCount?: number;
  error: string;
  biometricAvailable?: boolean;
  onBiometricUnlock?: () => Promise<void>;
  onSubmit: (password: string) => Promise<void>;
  onRestore?: (backup: string, password: string) => Promise<void>;
};

export function LockScreen({
  mode,
  legacyCount = 0,
  error,
  biometricAvailable = false,
  onBiometricUnlock,
  onSubmit,
  onRestore
}: LockScreenProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [biometricSubmitting, setBiometricSubmitting] = useState(false);
  const [restoreMode, setRestoreMode] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const restoring = !!onRestore && restoreMode;
  const isCreate = !restoring && (mode === "create" || mode === "migrate");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError("");
    if (isCreate && password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      if (restoring) {
        if (!backupFile || backupFile.size > MAX_BACKUP_BYTES) {
          setLocalError("Choose an encrypted backup smaller than 2 MB");
          return;
        }
        await onRestore(await backupFile.text(), password);
        setBackupFile(null);
        setRestoreMode(false);
      } else {
        await onSubmit(password);
      }
      setPassword("");
      setConfirmPassword("");
    } catch {
      setLocalError("Could not restore the backup. Check the file and its original vault password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBiometric() {
    if (!onBiometricUnlock) {
      return;
    }
    setLocalError("");
    setBiometricSubmitting(true);
    try {
      await onBiometricUnlock();
    } finally {
      setBiometricSubmitting(false);
    }
  }

  return (
    <main className="lock-shell">
      <section className="lock-panel">
        <div className="lock-panel__icon">
          {isCreate ? <ShieldCheck size={30} /> : <Lock size={30} />}
        </div>
        <h1>{restoring ? "Restore encrypted backup" : isCreate ? "Create password" : "Unlock vault"}</h1>
        <p>
          {restoring ? "Use the password from the original vault." : mode === "migrate"
            ? `${legacyCount} saved code${legacyCount === 1 ? "" : "s"} will be encrypted into your vault.`
            : mode === "create"
              ? "Encrypt your TOTP secrets before saving them."
              : mode === "biometric"
                ? "Use your device authenticator or enter your password."
              : "Enter your password to decrypt local TOTP secrets."}
        </p>

        {mode === "biometric" ? (
          <button
            className="primary-button"
            type="button"
            disabled={!biometricAvailable || biometricSubmitting}
            onClick={submitBiometric}
          >
            <Fingerprint size={18} />
            {biometricSubmitting ? "Checking" : "Unlock with biometrics"}
          </button>
        ) : null}

        <form className="lock-form" onSubmit={submit}>
          {restoring ? (
            <label className="field">
              <span>Encrypted backup file</span>
              <input type="file" accept=".json,application/json" required onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)} />
            </label>
          ) : null}
          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={isCreate ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </label>
          {isCreate ? (
            <label className="field">
              <span>Confirm password</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          ) : null}

          {localError || error ? <p className="error-banner" role="alert">{localError || error}</p> : null}

          <button className="primary-button" type="submit" disabled={submitting}>
            <KeyRound size={18} />
            {submitting ? "Working" : restoring ? "Restore backup" : isCreate ? "Create vault" : "Unlock"}
          </button>
        </form>
        {onRestore ? (
          <button className="text-button" type="button" disabled={submitting} onClick={() => {
            setPassword("");
            setConfirmPassword("");
            setBackupFile(null);
            setLocalError("");
            setRestoreMode(!restoreMode);
          }}>
            {restoring ? "Create a new vault instead" : "Restore encrypted backup"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
