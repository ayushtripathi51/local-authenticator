import { decrypt, encrypt } from "@metamask/browser-passworder";

export const BIOMETRIC_STORAGE_KEY = "totp.biometricUnlock";

export type BiometricEnrollment = {
  credentialId: string;
  label: string;
  createdAt: number;
  prfSalt?: string;
  wrappedKey?: string;
};

export type BiometricAuthentication = {
  credentialId: string;
  exportedKeyString?: string;
  verifiedAt: number;
};

const RP_NAME = "Local Authenticator";
const PRF_SALT_LENGTH = 32;

type PrfCredential = PublicKeyCredential & {
  getClientExtensionResults?: () => {
    prf?: {
      results?: {
        first?: ArrayBuffer;
      };
    };
  };
};

type WrappedKeyPayload = {
  exportedKeyString: string;
};

export async function isBiometricUnlockAvailable(): Promise<boolean> {
  const credentialApi = globalThis.PublicKeyCredential;
  if (!credentialApi || !navigator.credentials?.create || !navigator.credentials?.get) {
    return false;
  }

  try {
    if (credentialApi.isUserVerifyingPlatformAuthenticatorAvailable) {
      return await credentialApi.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

export async function getBiometricEnrollment(): Promise<BiometricEnrollment | null> {
  const result = await getChromeStorage().local.get(BIOMETRIC_STORAGE_KEY);
  const enrollment = result[BIOMETRIC_STORAGE_KEY];
  if (!isBiometricEnrollment(enrollment)) {
    return null;
  }
  return enrollment;
}

export async function enableBiometricUnlock(
  label: string,
  exportedKeyString: string
): Promise<BiometricEnrollment> {
  if (!(await isBiometricUnlockAvailable())) {
    throw new Error("Biometric unlock is not available on this device");
  }

  const userId = randomBuffer(32);
  const prfSalt = randomBuffer(PRF_SALT_LENGTH);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBuffer(32),
      rp: { name: RP_NAME },
      user: {
        id: userId,
        name: label,
        displayName: label
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 }
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required"
      },
      timeout: 60_000,
      attestation: "none",
      extensions: {
        prf: {
          eval: {
            first: prfSalt
          }
        }
      }
    } as PublicKeyCredentialCreationOptions
  });

  if (!isPublicKeyCredential(credential)) {
    throw new Error("Biometric enrollment failed");
  }

  const prfKey = getPrfKey(credential);
  const prfKeyString = arrayBufferToBase64Url(prfKey);
  const wrappedKey = await encrypt(prfKeyString, { exportedKeyString } satisfies WrappedKeyPayload);
  const enrollment: BiometricEnrollment = {
    credentialId: arrayBufferToBase64Url(credential.rawId),
    label,
    createdAt: Date.now(),
    prfSalt: arrayBufferToBase64Url(prfSalt),
    wrappedKey
  };
  await getChromeStorage().local.set({ [BIOMETRIC_STORAGE_KEY]: enrollment });
  return enrollment;
}

export async function authenticateBiometricUnlock(): Promise<BiometricAuthentication> {
  const enrollment = await getBiometricEnrollment();
  if (!enrollment) {
    throw new Error("Biometric unlock is not enabled");
  }
  if (!(await isBiometricUnlockAvailable())) {
    throw new Error("Biometric unlock is not available on this device");
  }

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomBuffer(32),
      allowCredentials: [
        {
          id: base64UrlToArrayBuffer(enrollment.credentialId),
          type: "public-key"
        }
      ],
      extensions: enrollment.prfSalt
        ? {
            prf: {
              eval: {
                first: base64UrlToArrayBuffer(enrollment.prfSalt)
              }
            }
          }
        : undefined,
      userVerification: "required",
      timeout: 60_000
    } as PublicKeyCredentialRequestOptions
  });

  if (!isPublicKeyCredential(credential)) {
    throw new Error("Biometric authentication failed");
  }

  const credentialId = arrayBufferToBase64Url(credential.rawId);
  if (credentialId !== enrollment.credentialId) {
    throw new Error("Biometric credential mismatch");
  }

  const exportedKeyString =
    enrollment.prfSalt && enrollment.wrappedKey
      ? await unwrapExportedKey(credential, enrollment.wrappedKey)
      : undefined;

  return {
    credentialId,
    exportedKeyString,
    verifiedAt: Date.now()
  };
}

export async function disableBiometricUnlock(): Promise<void> {
  await getChromeStorage().local.remove(BIOMETRIC_STORAGE_KEY);
}

export function hasDurableBiometricUnlock(enrollment: BiometricEnrollment | null): boolean {
  return !!enrollment?.prfSalt && !!enrollment.wrappedKey;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomBuffer(length: number): ArrayBuffer {
  const bytes = randomBytes(length);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function isBiometricEnrollment(value: unknown): value is BiometricEnrollment {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as BiometricEnrollment).credentialId === "string" &&
    typeof (value as BiometricEnrollment).label === "string" &&
    typeof (value as BiometricEnrollment).createdAt === "number" &&
    ((value as BiometricEnrollment).prfSalt === undefined ||
      typeof (value as BiometricEnrollment).prfSalt === "string") &&
    ((value as BiometricEnrollment).wrappedKey === undefined ||
      typeof (value as BiometricEnrollment).wrappedKey === "string")
  );
}

function isPublicKeyCredential(value: Credential | null): value is PublicKeyCredential {
  return (
    !!value &&
    value.type === "public-key" &&
    "rawId" in value &&
    value.rawId instanceof ArrayBuffer
  );
}

function getChromeStorage(): Pick<typeof chrome.storage, "local"> {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error("Chrome storage is required");
  }
  return chrome.storage;
}

function getPrfKey(credential: PublicKeyCredential): ArrayBuffer {
  const prfKey = (credential as PrfCredential).getClientExtensionResults?.().prf?.results?.first;
  if (!(prfKey instanceof ArrayBuffer)) {
    throw new Error("Biometric key wrapping is not available on this device");
  }
  return prfKey;
}

async function unwrapExportedKey(
  credential: PublicKeyCredential,
  wrappedKey: string
): Promise<string> {
  const prfKeyString = arrayBufferToBase64Url(getPrfKey(credential));
  const payload = (await decrypt(prfKeyString, wrappedKey)) as Partial<WrappedKeyPayload>;
  if (typeof payload.exportedKeyString !== "string") {
    throw new Error("Biometric unlock data is invalid");
  }
  return payload.exportedKeyString;
}
