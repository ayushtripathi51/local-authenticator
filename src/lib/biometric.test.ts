import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  authenticateBiometricUnlock,
  BIOMETRIC_STORAGE_KEY,
  disableBiometricUnlock,
  enableBiometricUnlock,
  getBiometricEnrollment,
  isBiometricUnlockAvailable
} from "./biometric";

const localStorageArea = new Map<string, unknown>();

function makeStorageArea(area: Map<string, unknown>) {
  return {
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.map((storageKey) => [storageKey, area.get(storageKey)]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.entries(items).forEach(([key, value]) => area.set(key, value));
    }),
    remove: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      keys.forEach((storageKey) => area.delete(storageKey));
    })
  };
}

function credential(id: Uint8Array) {
  return {
    id: "credential-id",
    rawId: id.buffer.slice(id.byteOffset, id.byteOffset + id.byteLength),
    type: "public-key"
  } as PublicKeyCredential;
}

beforeEach(() => {
  localStorageArea.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: makeStorageArea(localStorageArea)
    }
  });
  vi.stubGlobal("PublicKeyCredential", {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(async () => true)
  });
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: {
      create: vi.fn(async () => credential(new Uint8Array([1, 2, 3, 4]))),
      get: vi.fn(async () => credential(new Uint8Array([1, 2, 3, 4])))
    }
  });
});

describe("biometric unlock", () => {
  test("reports unavailable when platform WebAuthn is missing", async () => {
    vi.stubGlobal("PublicKeyCredential", undefined);

    await expect(isBiometricUnlockAvailable()).resolves.toBe(false);
  });

  test("enrolls a platform credential without storing vault secrets", async () => {
    const enrollment = await enableBiometricUnlock("Authenticator vault");

    expect(enrollment).toMatchObject({
      credentialId: "AQIDBA",
      label: "Authenticator vault"
    });
    expect(String(localStorageArea.get(BIOMETRIC_STORAGE_KEY))).not.toContain("JBSWY3DPEHPK3PXP");
    expect(navigator.credentials.create).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        authenticatorSelection: expect.objectContaining({
          authenticatorAttachment: "platform",
          userVerification: "required"
        }),
        rp: { name: "Standalone Authenticator" },
        user: expect.objectContaining({
          displayName: "Authenticator vault",
          name: "Authenticator vault"
        })
      })
    });
  });

  test("authenticates only the enrolled credential id", async () => {
    await enableBiometricUnlock("Authenticator vault");

    await expect(authenticateBiometricUnlock()).resolves.toEqual({
      credentialId: "AQIDBA",
      verifiedAt: expect.any(Number)
    });
    expect(navigator.credentials.get).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        allowCredentials: [{ id: expect.any(ArrayBuffer), type: "public-key" }],
        userVerification: "required"
      })
    });
  });

  test("rejects if the authenticator returns a different credential", async () => {
    await enableBiometricUnlock("Authenticator vault");
    vi.mocked(navigator.credentials.get).mockResolvedValue(
      credential(new Uint8Array([9, 9, 9, 9])) as Credential
    );

    await expect(authenticateBiometricUnlock()).rejects.toThrow("Biometric credential mismatch");
  });

  test("removes the enrollment", async () => {
    await enableBiometricUnlock("Authenticator vault");

    await disableBiometricUnlock();

    await expect(getBiometricEnrollment()).resolves.toBeNull();
  });
});
