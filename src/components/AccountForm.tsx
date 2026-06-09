import { Camera, Link, Save, Upload, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import type { TotpAccount, TotpAccountInput } from "../lib/accounts";
import { parseGoogleAuthenticatorMigrationUri } from "../lib/googleAuthenticator";
import { decodeQrFromCanvas, decodeQrFromImageFile } from "../lib/qr";
import { decodeBase32, parseOtpAuthUri, sanitizeSecret } from "../lib/totp";

type AccountFormProps = {
  editingAccount: TotpAccount | null;
  autoStartCamera?: boolean;
  onSave: (input: TotpAccountInput) => Promise<void>;
  onImportMany: (inputs: TotpAccountInput[]) => Promise<void>;
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

export function AccountForm({
  editingAccount,
  autoStartCamera = false,
  onSave,
  onImportMany,
  onCancel
}: AccountFormProps) {
  const [form, setForm] = useState<TotpAccountInput>(DEFAULT_FORM);
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  useEffect(() => {
    if (!videoRef.current || !cameraStream) {
      return;
    }
    videoRef.current.srcObject = cameraStream;
    void videoRef.current.play();
  }, [cameraStream]);

  useEffect(() => {
    if (!cameraScanning) {
      return;
    }

    let stopped = false;
    let frame = 0;
    const scan = async () => {
      if (stopped || !videoRef.current || !canvasRef.current) {
        return;
      }
      const video = videoRef.current;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context && canvas.width > 0 && canvas.height > 0) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const scanned = decodeQrFromCanvas(canvas);
            stopped = true;
            stopCamera();
            await importText(scanned);
            return;
          } catch {
            // No QR in this frame yet.
          }
        }
      }
      frame = window.requestAnimationFrame(scan);
    };

    frame = window.requestAnimationFrame(scan);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
    };
  }, [cameraScanning]);

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (autoStartCamera && !editingAccount && !cameraScanning && !cameraBusy) {
      void startInlineCamera();
    }
  }, [autoStartCamera, editingAccount]);

  async function importUri() {
    await importText(uri);
  }

  async function importText(input: string) {
    try {
      const trimmed = input.trim();
      if (trimmed.startsWith("otpauth-migration://")) {
        const parsed = parseGoogleAuthenticatorMigrationUri(trimmed);
        await onImportMany(parsed);
        setUri("");
        setError("");
        return;
      }
      const parsed = parseOtpAuthUri(trimmed);
      setForm(parsed);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import code");
    }
  }

  async function importImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    try {
      const scanned = await decodeQrFromImageFile(file);
      await importText(scanned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not scan QR image");
    }
  }

  async function startCamera() {
    if (isExtensionPopup()) {
      await openCameraScannerWindow();
      return;
    }
    await startInlineCamera();
  }

  async function startInlineCamera() {
    setError("");
    setCameraBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera scanning is not available in this browser");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      setCameraStream(stream);
      setCameraScanning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open camera");
    } finally {
      setCameraBusy(false);
    }
  }

  async function openCameraScannerWindow() {
    const scannerURL = chrome.runtime.getURL("index.html?camera=1");
    if (chrome.windows?.create) {
      await chrome.windows.create({
        url: scannerURL,
        type: "popup",
        width: 430,
        height: 700,
        focused: true
      });
      return;
    }
    window.open(scannerURL, "_blank", "popup,width=430,height=700");
  }

  function stopCamera() {
    setCameraScanning(false);
    setCameraStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
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
        <span>Paste setup key URL or Google export URI</span>
        <div className="field-row">
          <input
            value={uri}
            onChange={(event) => setUri(event.target.value)}
            placeholder="otpauth://totp/... or otpauth-migration://..."
            autoComplete="off"
          />
          <button type="button" className="square-button" onClick={importUri} aria-label="Import URL">
            <Link size={18} />
          </button>
        </div>
      </label>

      {!editingAccount ? (
        <div className="qr-import">
          <label className="secondary-button">
            <Upload size={17} />
            Upload QR image
            <input type="file" accept="image/*" onChange={importImage} />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={cameraScanning ? stopCamera : startCamera}
            disabled={cameraBusy}
          >
            <Camera size={17} />
            {cameraScanning ? "Stop camera" : cameraBusy ? "Opening" : "Scan camera"}
          </button>
        </div>
      ) : null}

      {cameraScanning ? (
        <div className="camera-preview">
          <video ref={videoRef} muted playsInline />
          <canvas ref={canvasRef} hidden />
        </div>
      ) : null}

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

function isExtensionPopup() {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id && window.location.search !== "?camera=1";
}
