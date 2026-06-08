import { Link, Save, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { TotpAccount, TotpAccountInput } from "../lib/accounts";
import { decodeBase32, parseOtpAuthUri, sanitizeSecret } from "../lib/totp";

type AccountFormProps = {
  editingAccount: TotpAccount | null;
  onSave: (input: TotpAccountInput) => Promise<void>;
  onCancel: () => void;
};

const DEFAULT_FORM: TotpAccountInput = {
  issuer: "",
  label: "",
  secret: "",
  period: 30,
  digits: 6,
  algorithm: "SHA1"
};

export function AccountForm({ editingAccount, onSave, onCancel }: AccountFormProps) {
  const [form, setForm] = useState<TotpAccountInput>(DEFAULT_FORM);
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingAccount) {
      setForm({
        issuer: editingAccount.issuer,
        label: editingAccount.label,
        secret: editingAccount.secret,
        period: editingAccount.period,
        digits: editingAccount.digits,
        algorithm: editingAccount.algorithm
      });
      setUri("");
    } else {
      setForm(DEFAULT_FORM);
      setUri("");
    }
    setError("");
  }, [editingAccount]);

  function importUri() {
    try {
      const parsed = parseOtpAuthUri(uri);
      setForm(parsed);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse otpauth URI");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      decodeBase32(form.secret);
      await onSave({
        ...form,
        secret: sanitizeSecret(form.secret)
      });
      setForm(DEFAULT_FORM);
      setUri("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <div className="account-form__header">
        <h2>{editingAccount ? "Edit code" : "Add code"}</h2>
        <button type="button" className="text-button" onClick={onCancel}>
          <X size={16} />
          Close
        </button>
      </div>

      <label className="field">
        <span>Paste setup key URL</span>
        <div className="field-row">
          <input
            value={uri}
            onChange={(event) => setUri(event.target.value)}
            placeholder="otpauth://totp/Issuer:name?secret=..."
            autoComplete="off"
          />
          <button type="button" className="square-button" onClick={importUri} aria-label="Import URL">
            <Link size={18} />
          </button>
        </div>
      </label>

      <div className="form-grid">
        <label className="field">
          <span>Issuer</span>
          <input
            value={form.issuer}
            onChange={(event) => setForm({ ...form, issuer: event.target.value })}
            placeholder="Google"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Account</span>
          <input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="name@example.com"
            autoComplete="off"
            required
          />
        </label>
      </div>

      <label className="field">
        <span>Secret key</span>
        <input
          value={form.secret}
          onChange={(event) => setForm({ ...form, secret: event.target.value })}
          placeholder="JBSW Y3DP EHPK 3PXP"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>

      <div className="form-grid form-grid--compact">
        <label className="field">
          <span>Digits</span>
          <select
            value={form.digits}
            onChange={(event) => setForm({ ...form, digits: Number(event.target.value) })}
          >
            <option value={6}>6</option>
            <option value={7}>7</option>
            <option value={8}>8</option>
          </select>
        </label>
        <label className="field">
          <span>Period</span>
          <input
            type="number"
            min={1}
            value={form.period}
            onChange={(event) => setForm({ ...form, period: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Algorithm</span>
          <select
            value={form.algorithm}
            onChange={(event) =>
              setForm({ ...form, algorithm: event.target.value as TotpAccountInput["algorithm"] })
            }
          >
            <option value="SHA1">SHA-1</option>
            <option value="SHA256">SHA-256</option>
            <option value="SHA512">SHA-512</option>
          </select>
        </label>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      <button className="primary-button" type="submit" disabled={saving}>
        <Save size={18} />
        {saving ? "Saving" : editingAccount ? "Save changes" : "Add code"}
      </button>
    </form>
  );
}
