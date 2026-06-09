import type { TotpAccountInput } from "./accounts";
import { sanitizeSecret } from "./totp";

type OtpParameter = {
  secret?: Uint8Array;
  name?: string;
  issuer?: string;
  algorithm?: number;
  digits?: number;
  type?: number;
};

const TOTP_TYPE = 2;

export function parseGoogleAuthenticatorMigrationUri(input: string): TotpAccountInput[] {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid Google Authenticator export URI");
  }

  if (url.protocol !== "otpauth-migration:" || url.hostname !== "offline") {
    throw new Error("QR code is not a Google Authenticator export");
  }

  const encodedData = url.searchParams.get("data");
  if (!encodedData) {
    throw new Error("Google Authenticator export is missing data");
  }

  const payload = decodeBase64(encodedData.replace(/ /g, "+"));
  const fields = readMessage(payload);
  const accounts = fields
    .filter((field): field is Extract<Field, { wireType: 2 }> => field.number === 1 && field.wireType === 2)
    .map((field) => parseOtpParameter(field.bytesValue));

  if (accounts.length === 0) {
    throw new Error("Google Authenticator export has no accounts");
  }

  return accounts.map(accountFromOtpParameter);
}

function parseOtpParameter(bytes: Uint8Array): OtpParameter {
  const parameter: OtpParameter = {};
  for (const field of readMessage(bytes)) {
    if (field.number === 1 && field.wireType === 2) {
      parameter.secret = field.bytesValue;
    } else if (field.number === 2 && field.wireType === 2) {
      parameter.name = decodeText(field.bytesValue);
    } else if (field.number === 3 && field.wireType === 2) {
      parameter.issuer = decodeText(field.bytesValue);
    } else if (field.number === 4 && field.wireType === 0) {
      parameter.algorithm = field.varintValue;
    } else if (field.number === 5 && field.wireType === 0) {
      parameter.digits = field.varintValue;
    } else if (field.number === 6 && field.wireType === 0) {
      parameter.type = field.varintValue;
    }
  }
  return parameter;
}

function accountFromOtpParameter(parameter: OtpParameter): TotpAccountInput {
  if (parameter.type !== TOTP_TYPE) {
    throw new Error("Only TOTP exports are supported");
  }
  if (!parameter.secret || parameter.secret.length === 0) {
    throw new Error("Google Authenticator account is missing a secret");
  }

  const { issuer, label } = splitIssuerAndLabel(parameter.issuer ?? "", parameter.name ?? "");
  if (!label) {
    throw new Error("Google Authenticator account is missing a label");
  }

  return {
    issuer,
    label,
    secret: sanitizeSecret(base32Encode(parameter.secret)),
    period: 30,
    digits: mapDigits(parameter.digits ?? 1),
    algorithm: mapAlgorithm(parameter.algorithm ?? 1)
  };
}

function splitIssuerAndLabel(rawIssuer: string, rawName: string) {
  const issuer = rawIssuer.trim();
  const name = rawName.trim();
  if (issuer) {
    return { issuer, label: stripIssuerPrefix(name, issuer) };
  }
  const [issuerFromName, ...labelParts] = name.split(":");
  if (labelParts.length > 0) {
    return { issuer: issuerFromName.trim(), label: labelParts.join(":").trim() };
  }
  return { issuer: "", label: name };
}

function stripIssuerPrefix(name: string, issuer: string) {
  const prefix = `${issuer}:`;
  return name.startsWith(prefix) ? name.slice(prefix.length).trim() : name;
}

function mapAlgorithm(value: number): TotpAccountInput["algorithm"] {
  if (value === 1 || value === 0) return "SHA1";
  if (value === 2) return "SHA256";
  if (value === 3) return "SHA512";
  throw new Error("Unsupported TOTP algorithm");
}

function mapDigits(value: number) {
  if (value === 1 || value === 0) return 6;
  if (value === 2) return 8;
  throw new Error("Unsupported TOTP digit count");
}

type Field =
  | { number: number; wireType: 0; varintValue: number }
  | { number: number; wireType: 2; bytesValue: Uint8Array };

function readMessage(bytes: Uint8Array): Field[] {
  const fields: Field[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const number = tag.value >> 3;
    const wireType = tag.value & 0x07;
    if (number <= 0) {
      throw new Error("Google Authenticator export data is invalid");
    }

    if (wireType === 0) {
      const value = readVarint(bytes, offset);
      offset = value.offset;
      fields.push({ number, wireType, varintValue: value.value });
    } else if (wireType === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      const end = offset + length.value;
      if (end > bytes.length) {
        throw new Error("Google Authenticator export data is truncated");
      }
      fields.push({ number, wireType, bytesValue: bytes.slice(offset, end) });
      offset = end;
    } else {
      throw new Error("Google Authenticator export uses an unsupported field");
    }
  }
  return fields;
}

function readVarint(bytes: Uint8Array, startOffset: number) {
  let offset = startOffset;
  let value = 0;
  let shift = 0;
  while (offset < bytes.length) {
    const byte = bytes[offset];
    offset += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return { value, offset };
    }
    shift += 7;
    if (shift > 35) {
      throw new Error("Google Authenticator export data is invalid");
    }
  }
  throw new Error("Google Authenticator export data is truncated");
}

function base32Encode(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }

  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += alphabet[Number.parseInt(chunk, 2)];
  }
  return output;
}

function decodeBase64(value: string) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new Error("Google Authenticator export data is invalid");
  }
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}
