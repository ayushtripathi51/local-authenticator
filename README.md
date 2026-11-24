# Local Authenticator: Private TOTP Vault

A standalone Chrome extension for generating private 2FA codes from an encrypted local TOTP vault. It has no persistent website access: no registered content scripts, no host permissions, no background page, and no website messaging surface. Optional autofill runs only in the active tab after you request it.

## Features

- Google Authenticator-style popup UI.
- Add TOTP accounts manually, from `otpauth://` URLs, or from Google Authenticator export QR images/camera scans.
- Live six-digit codes with countdown.
- Copy code button.
- Search, edit, and delete accounts.
- Encrypted vault with password setup and unlock screen.
- Optional platform biometric/passkey unlock for the active 24-hour session.
- Manual lock button.
- 24-hour unlock session using `chrome.storage.session`.
- Encrypted backup download and restore into a fresh vault (moves accounts between installs without exposing setup keys).
- Per-account site pairing: pair an account with one exact `https://` origin, then fill its code on that site after fresh device verification.

## Security Model

- The extension manifest requests `storage`, `activeTab` and `scripting`. It has no host permissions, no content scripts, no background page and no `externally_connectable` surface.
- `activeTab` grants access to the current tab only after you click the toolbar button. The popup reads that tab's origin to offer pairing and runs one fill function in it; it never reads the page or its fields otherwise.
- Filling requires: the account is paired with the tab's exact origin, biometric unlock is enabled, a fresh platform-authenticator verification succeeds, and the same tab and top-level document are still active afterwards. The page must contain exactly one empty, visible, enabled `autocomplete="one-time-code"` input. The extension sets the value and dispatches `input`; it never submits the form. Codes within three seconds of expiry are not filled.
- The website receives an ordinary TOTP code; the biometric check only authorises its release on this device.
- Websites cannot access the vault: they cannot call the extension, and the fill function receives only the current code.
- Websites cannot call into the extension because there is no `externally_connectable` surface.
- Secrets are encrypted at rest with `@metamask/browser-passworder`, using the same class of PBKDF2 + AES-GCM browser vault design used by MetaMask tooling.
- The password is not stored.
- Decrypted secrets live in popup memory only while unlocked.
- The 24-hour convenience unlock stores exported vault key material in `chrome.storage.session`, not the raw password. Without biometric unlock it is cleared by manual lock, expiry, browser restart, extension reload, update, or disable.
- Biometric/passkey unlock uses WebAuthn with a platform authenticator and no explicit RP ID, which is the supported pattern for extension origins. When enabled, manual lock keeps the vault closed in the UI but requires successful device verification before the cached session key can be reused. New enrollments also wrap the vault session key with WebAuthn PRF material so biometric unlock can restore the session after expiry on devices that support PRF.
- Clipboard copy writes only the current TOTP code, not the secret.

## Backup, Restore and Migration

- **Download encrypted backup** (footer of the unlocked popup) saves `local-authenticator-backup.json`: the vault ciphertext in a small JSON envelope. It contains no plaintext secrets or labels, and it can be restored only with the vault password it was created with. Biometric enrollment and unlock sessions are not included; enable biometric unlock again after restoring.
- **Restore encrypted backup** appears only on a fresh install (no vault yet). It never replaces or merges into an existing vault.
- An unpacked build gets its own extension ID and storage, so it starts empty, separate from a Chrome Web Store install. Keep the unpacked folder at one fixed path: Chrome derives the ID from that path, so rebuilding into the same folder keeps the vault.

### Migrating from 0.3.0 (no export button)

0.3.0 cannot download a vault backup. If your existing store install can receive an in-place update that adds **Download encrypted backup**, export from that updated install, then restore into the fresh unpacked build. Do not remove the existing install to try to transfer its data. If an in-place update is not available, use the original authenticator's official export or your saved setup keys. The popup supports `otpauth://` URLs and Google Authenticator export QR codes; verify the resulting codes before retiring your original authenticator. Site labels are not trusted as origins: pair each account manually on its sign-in page.

## Install From Source

```bash
npm install
npm run build
```

Then load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist/` folder.

## Development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
npm run build
npm run test:e2e
npm audit
```

## Release Package

Create a zipped extension package:

```bash
npm run package:extension
```

This creates `local-authenticator-private-totp-vault.zip` from the generated `dist/` folder.

## GitHub Releases

Compiled `dist/` output is intentionally not committed. Tagged releases build the extension and upload `local-authenticator-private-totp-vault.zip` as a release artifact.

Create a release by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```
