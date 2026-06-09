import { describe, expect, test } from "vitest";
import { parseGoogleAuthenticatorMigrationUri } from "./googleAuthenticator";

describe("parseGoogleAuthenticatorMigrationUri", () => {
  test("parses Google Authenticator exported TOTP accounts", () => {
    const uri = migrationUri([
      otpParameter({
        secret: new TextEncoder().encode("Hello"),
        name: "alice@example.com",
        issuer: "Example",
        algorithm: 1,
        digits: 1,
        type: 2
      }),
      otpParameter({
        secret: new Uint8Array([1, 2, 3, 4, 5]),
        name: "Work:bob@example.com",
        issuer: "",
        algorithm: 2,
        digits: 2,
        type: 2
      })
    ]);

    expect(parseGoogleAuthenticatorMigrationUri(uri)).toEqual([
      {
        issuer: "Example",
        label: "alice@example.com",
        secret: "JBSWY3DP",
        period: 30,
        digits: 6,
        algorithm: "SHA1"
      },
      {
        issuer: "Work",
        label: "bob@example.com",
        secret: "AEBAGBAF",
        period: 30,
        digits: 8,
        algorithm: "SHA256"
      }
    ]);
  });

  test("rejects unsupported HOTP exports", () => {
    const uri = migrationUri([
      otpParameter({
        secret: new TextEncoder().encode("Hello"),
        name: "counter@example.com",
        issuer: "Example",
        algorithm: 1,
        digits: 1,
        type: 1
      })
    ]);

    expect(() => parseGoogleAuthenticatorMigrationUri(uri)).toThrow("Only TOTP exports are supported");
  });
});

function migrationUri(otpParameters: Uint8Array[]) {
  const payload = concat([
    ...otpParameters.map((parameter) => fieldBytes(1, parameter)),
    fieldVarint(2, 1),
    fieldVarint(3, otpParameters.length),
    fieldVarint(4, 0),
    fieldVarint(5, 123)
  ]);
  return `otpauth-migration://offline?data=${encodeURIComponent(base64(payload))}`;
}

function otpParameter(input: {
  secret: Uint8Array;
  name: string;
  issuer: string;
  algorithm: number;
  digits: number;
  type: number;
}) {
  return concat([
    fieldBytes(1, input.secret),
    fieldString(2, input.name),
    fieldString(3, input.issuer),
    fieldVarint(4, input.algorithm),
    fieldVarint(5, input.digits),
    fieldVarint(6, input.type)
  ]);
}

function fieldString(field: number, value: string) {
  return fieldBytes(field, new TextEncoder().encode(value));
}

function fieldBytes(field: number, value: Uint8Array) {
  return concat([varint((field << 3) | 2), varint(value.length), value]);
}

function fieldVarint(field: number, value: number) {
  return concat([varint(field << 3), varint(value)]);
}

function varint(value: number) {
  const bytes: number[] = [];
  let next = value;
  while (next >= 0x80) {
    bytes.push((next & 0x7f) | 0x80);
    next >>= 7;
  }
  bytes.push(next);
  return new Uint8Array(bytes);
}

function concat(chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function base64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}
