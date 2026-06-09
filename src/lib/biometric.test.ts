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
    type: "public-key",
    getClientExtensionResults: () => ({
      prf: {
        results: {
          first: new Uint8Array([5, 6, 7, 8]).buffer
        }
      }
    })
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
    const enrollment = await enableBiometricUnlock("Local Authenticator vault", "exported-key");

    expect(enrollment).toMatchObject({
      credentialId: "AQIDBA",
      label: "Local Authenticator vault",
      prfSalt: expect.any(String),
      wrappedKey: expect.any(String)
    });
    expect(String(localStorageArea.get(BIOMETRIC_STORAGE_KEY))).not.toContain("exported-key");
    expect(navigator.credentials.create).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        authenticatorSelection: expect.objectContaining({
          authenticatorAttachment: "platform",
          userVerification: "required"
        }),
        extensions: expect.objectContaining({
          prf: expect.objectContaining({
            eval: expect.objectContaining({
              first: expect.any(ArrayBuffer)
            })
          })
        }),
        rp: { name: "Local Authenticator" },
        user: expect.objectContaining({
          displayName: "Local Authenticator vault",
          name: "Local Authenticator vault"
        })
      })
    });
  });

  test("authenticates only the enrolled credential id", async () => {
    await enableBiometricUnlock("Local Authenticator vault", "exported-key");

    await expect(authenticateBiometricUnlock()).resolves.toEqual({
      credentialId: "AQIDBA",
      exportedKeyString: "exported-key",
      verifiedAt: expect.any(Number)
    });
    expect(navigator.credentials.get).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        allowCredentials: [{ id: expect.any(ArrayBuffer), type: "public-key" }],
        extensions: expect.objectContaining({
          prf: expect.objectContaining({
            eval: expect.objectContaining({
              first: expect.any(ArrayBuffer)
            })
          })
        }),
        userVerification: "required"
      })
    });
  });

  test("rejects if the authenticator returns a different credential", async () => {
    await enableBiometricUnlock("Local Authenticator vault", "exported-key");
    vi.mocked(navigator.credentials.get).mockResolvedValue(
      credential(new Uint8Array([9, 9, 9, 9])) as Credential
    );

    await expect(authenticateBiometricUnlock()).rejects.toThrow("Biometric credential mismatch");
  });

  test("removes the enrollment", async () => {
    await enableBiometricUnlock("Local Authenticator vault", "exported-key");

    await disableBiometricUnlock();

    await expect(getBiometricEnrollment()).resolves.toBeNull();
  });

  test("rejects durable enrollment when the authenticator does not return a PRF key", async () => {
    vi.mocked(navigator.credentials.create).mockResolvedValue({
      id: "credential-id",
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      type: "public-key",
      getClientExtensionResults: () => ({})
    } as PublicKeyCredential);

    await expect(enableBiometricUnlock("Local Authenticator vault", "exported-key")).rejects.toThrow(
      "Biometric key wrapping is not available on this device"
    );
    expect(localStorageArea.has(BIOMETRIC_STORAGE_KEY)).toBe(false);
  });
});
