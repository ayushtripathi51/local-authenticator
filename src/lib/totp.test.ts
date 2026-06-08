import { describe, expect, test } from "vitest";
import {
  decodeBase32,
  generateTotp,
  getCountdown,
  parseOtpAuthUri,
  sanitizeSecret
} from "./totp";

describe("decodeBase32", () => {
  test("decodes padded and spaced base32 secrets", () => {
    const bytes = decodeBase32(" JBSW Y3DP ==== ");
    expect(new TextDecoder().decode(bytes)).toBe("Hello");
  });

  test("rejects invalid base32 characters", () => {
    expect(() => decodeBase32("JBSWY3D!")).toThrow("Secret contains invalid Base32 characters");
  });
});

describe("sanitizeSecret", () => {
  test("normalizes grouped lowercase secrets", () => {
    expect(sanitizeSecret("jbsw y3dp")).toBe("JBSWY3DP");
  });
});

describe("parseOtpAuthUri", () => {
  test("parses a standard otpauth uri", () => {
    const parsed = parseOtpAuthUri(
      "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&period=30&digits=6&algorithm=SHA1"
    );

    expect(parsed).toEqual({
      issuer: "Example",
      label: "alice@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      period: 30,
      digits: 6,
      algorithm: "SHA1"
    });
  });

  test("rejects non-totp otpauth uri", () => {
    expect(() =>
      parseOtpAuthUri("otpauth://hotp/Example:alice?secret=JBSWY3DP&counter=1")
    ).toThrow("Only TOTP otpauth URIs are supported");
  });
});

describe("generateTotp", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  test.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"]
  ])("matches RFC 6238 vector at %s seconds", async (timestamp, expected) => {
    await expect(
      generateTotp({
        secret,
        timestamp,
        digits: 8,
        period: 30,
        algorithm: "SHA1"
      })
    ).resolves.toBe(expected);
  });
});

describe("getCountdown", () => {
  test("returns seconds remaining and progress", () => {
    expect(getCountdown(45_000, 30)).toEqual({
      secondsRemaining: 15,
      progress: 0.5
    });
  });
});
