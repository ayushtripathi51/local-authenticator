import { Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";

type LockScreenProps = {
  mode: "biometric" | "create" | "migrate" | "unlock";
  legacyCount?: number;
  error: string;
  biometricAvailable?: boolean;
  onBiometricUnlock?: () => Promise<void>;
  onSubmit: (password: string) => Promise<void>;
};

export function LockScreen({
  mode,
  legacyCount = 0,
  error,
  biometricAvailable = false,
  onBiometricUnlock,
  onSubmit
}: LockScreenProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [biometricSubmitting, setBiometricSubmitting] = useState(false);
  const isCreate = mode === "create" || mode === "migrate";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError("");
    if (isCreate && password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(password);
      setPassword("");
      setConfirmPassword("");
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
        <h1>{mode === "unlock" ? "Unlock vault" : "Create password"}</h1>
        <p>
          {mode === "migrate"
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

          {localError || error ? <p className="error-banner">{localError || error}</p> : null}

          <button className="primary-button" type="submit" disabled={submitting}>
            <KeyRound size={18} />
            {submitting ? "Working" : mode === "unlock" ? "Unlock" : "Create vault"}
          </button>
        </form>
      </section>
    </main>
  );
}
