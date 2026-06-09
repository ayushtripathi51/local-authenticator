# Privacy Policy

**Effective date:** June 10, 2026

Local Authenticator: Private TOTP Vault ("Local Authenticator") is a browser
extension that stores time-based one-time password (TOTP) accounts in an
encrypted vault and generates two-factor authentication codes locally.

## Data Collection

Local Authenticator does not collect, sell, share, transmit, or monetize
personal information.

The extension does not use analytics, advertising, tracking technologies,
telemetry, or remote application servers.

## Data Stored on Your Device

The extension may store the following data locally:

- TOTP account labels, issuers, configuration, and secret keys.
- The encrypted local vault containing your TOTP accounts.
- Biometric or passkey enrollment metadata when biometric unlock is enabled.
- Temporary unlock-session key material in Chrome extension session storage.

TOTP secrets are encrypted before being saved. The vault password is not
stored.

## QR Codes and Camera Access

QR images and Google Authenticator export data are processed locally within
the browser extension.

When camera scanning is selected, the extension requests camera access through
the browser. Camera access is used only to detect QR codes while the scanner is
open. The extension does not record, upload, retain, or transmit camera images
or video.

Users can deny camera access and import a QR image or enter account details
manually instead.

## Biometric and Passkey Unlock

Optional biometric or passkey unlock uses the browser's WebAuthn platform
authenticator. The extension does not receive or store fingerprint, facial, or
other biometric data.

Where supported, WebAuthn PRF-derived material is used to protect local vault
session key material. Biometric verification is handled by the operating
system and browser.

## Network and Website Access

Local Authenticator does not send TOTP secrets, generated codes, passwords,
QR data, or vault contents to external servers.

The extension does not request host permissions, inject content scripts into
websites, or provide an externally connectable website messaging interface.

## Permissions

The extension requests the following Chrome permission:

- `storage`: Used to save the encrypted vault, local settings, biometric
  enrollment metadata, and temporary unlock-session data on the user's device.

Camera access is requested by the browser only when the user starts the camera
scanner.

## Data Retention and Deletion

Data remains on the user's device until it is edited or deleted by the user,
the extension is removed along with its stored data, or browser storage is
cleared.

Users can delete individual TOTP accounts from the extension. Removing the
extension through Chrome may also remove its locally stored extension data,
subject to Chrome's storage behavior.

## Security

Local Authenticator uses local encryption to protect stored TOTP secrets.
However, no software or storage mechanism can guarantee absolute security.
Users are responsible for protecting access to their browser profile, device,
vault password, and recovery information.

## Children's Privacy

Local Authenticator does not knowingly collect personal information from
children or any other users.

## Changes to This Policy

This policy may be updated when extension functionality or privacy practices
change. Updates will be published in this repository with a revised effective
date when appropriate.

## Contact

For privacy questions or support, open an issue at:

https://github.com/iamkunal9/local-authenticator/issues

