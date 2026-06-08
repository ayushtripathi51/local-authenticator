export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type ParsedOtpAuthUri = {
  issuer: string;
  label: string;
  secret: string;
  period: number;
  digits: number;
  algorithm: TotpAlgorithm;
};

export type GenerateTotpInput = {
  secret: string;
  timestamp?: number;
  period?: number;
  digits?: number;
  algorithm?: TotpAlgorithm;
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SUPPORTED_ALGORITHMS = new Set<TotpAlgorithm>(["SHA1", "SHA256", "SHA512"]);

export function sanitizeSecret(secret: string): string {
  return secret.replace(/[\s=-]/g, "").toUpperCase();
}

export function decodeBase32(secret: string): Uint8Array {
  const normalized = sanitizeSecret(secret);
  if (!normalized) {
    throw new Error("Secret is required");
  }
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error("Secret contains invalid Base32 characters");
  }

  let bits = "";
  for (const char of normalized) {
    const value = BASE32_ALPHABET.indexOf(char);
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return new Uint8Array(bytes);
}

export function parseOtpAuthUri(input: string): ParsedOtpAuthUri {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid otpauth URI");
  }

  if (url.protocol !== "otpauth:") {
    throw new Error("URI must start with otpauth://");
  }
  if (url.hostname.toLowerCase() !== "totp") {
    throw new Error("Only TOTP otpauth URIs are supported");
  }

  const secret = sanitizeSecret(url.searchParams.get("secret") ?? "");
  decodeBase32(secret);

  const rawAlgorithm = (url.searchParams.get("algorithm") ?? "SHA1")
    .replace("-", "")
    .toUpperCase() as TotpAlgorithm;
  if (!SUPPORTED_ALGORITHMS.has(rawAlgorithm)) {
    throw new Error("Unsupported TOTP algorithm");
  }

  const digits = parsePositiveInteger(url.searchParams.get("digits"), 6);
  if (![6, 7, 8].includes(digits)) {
    throw new Error("TOTP digits must be 6, 7, or 8");
  }

  const period = parsePositiveInteger(url.searchParams.get("period"), 30);
  const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const [issuerFromLabel, ...labelParts] = pathname.split(":");
  const issuerParam = url.searchParams.get("issuer")?.trim();
  const label = (labelParts.length > 0 ? labelParts.join(":") : issuerFromLabel).trim();
  const issuer = (issuerParam || (labelParts.length > 0 ? issuerFromLabel : "")).trim();

  if (!label) {
    throw new Error("TOTP label is required");
  }

  return {
    issuer,
    label,
    secret,
    period,
    digits,
    algorithm: rawAlgorithm
  };
}

export async function generateTotp({
  secret,
  timestamp = Date.now() / 1000,
  period = 30,
  digits = 6,
  algorithm = "SHA1"
}: GenerateTotpInput): Promise<string> {
  const counter = Math.floor(timestamp / period);
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(decodeBase32(secret)),
    { name: "HMAC", hash: cryptoHashName(algorithm) },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, toArrayBuffer(counterToBytes(counter)))
  );
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);
  const otp = binary % 10 ** digits;

  return otp.toString().padStart(digits, "0");
}

export function getCountdown(nowMs = Date.now(), period = 30) {
  const elapsed = Math.floor(nowMs / 1000) % period;
  const secondsRemaining = period - elapsed;
  return {
    secondsRemaining,
    progress: secondsRemaining / period
  };
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("TOTP numeric parameters must be positive");
  }
  return parsed;
}

function cryptoHashName(algorithm: TotpAlgorithm): "SHA-1" | "SHA-256" | "SHA-512" {
  if (algorithm === "SHA256") {
    return "SHA-256";
  }
  if (algorithm === "SHA512") {
    return "SHA-512";
  }
  return "SHA-1";
}

function counterToBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let value = BigInt(counter);
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
