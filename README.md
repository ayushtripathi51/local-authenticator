# Standalone Authenticator

A standalone Chrome extension for generating TOTP codes from a popup. It is designed to stay isolated from websites: no content scripts, no host permissions, no background page, and no website messaging surface.

## Features

- Google Authenticator-style popup UI.
- Add TOTP accounts manually or from `otpauth://` URLs.
- Live six-digit codes with countdown.
- Copy code button.
- Search, edit, and delete accounts.
- Encrypted vault with password setup and unlock screen.
- Optional platform biometric/passkey unlock for the active 24-hour session.
- Manual lock button.
- 24-hour unlock session using `chrome.storage.session`.

## Security Model

- The extension manifest only requests `storage`.
- Websites cannot access the vault through content scripts because there are no content scripts.
- Websites cannot call into the extension because there is no `externally_connectable` surface.
- Secrets are encrypted at rest with `@metamask/browser-passworder`, using the same class of PBKDF2 + AES-GCM browser vault design used by MetaMask tooling.
- The password is not stored.
- Decrypted secrets live in popup memory only while unlocked.
- The 24-hour convenience unlock stores exported vault key material in `chrome.storage.session`, not the raw password. It is cleared by manual lock, expiry, browser restart, extension reload, update, or disable.
- Biometric/passkey unlock uses WebAuthn with a platform authenticator and no explicit RP ID, which is the supported pattern for extension origins. It gates use of the cached 24-hour unlock key; after the session expires or manual lock clears it, the password is required again.
- Clipboard copy writes only the current TOTP code, not the secret.

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

This creates `totp-extension.zip` from the generated `dist/` folder.

## GitHub Releases

Compiled `dist/` output is intentionally not committed. Tagged releases build the extension and upload `totp-extension.zip` as a release artifact.

Create a release by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```
