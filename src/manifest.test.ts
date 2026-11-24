import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import manifest from "../manifest.json";

describe("extension manifest icons", () => {
  test("uses the public product name in extension metadata", () => {
    expect(manifest.name).toBe("Local Authenticator: Private TOTP Vault");
    expect(manifest.action.default_title).toBe("Local Authenticator");
  });

  test("declares raster PNG icons for Chrome toolbar and extension list", () => {
    const expectedIcons = {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    };

    expect(manifest.action.default_icon).toEqual(expectedIcons);
    expect(manifest.icons).toEqual(expectedIcons);

    for (const iconPath of Object.values(expectedIcons)) {
      expect(existsSync(`public/${iconPath}`), `${iconPath} exists`).toBe(true);
    }
  });

  test("keeps website access user-initiated and narrow", () => {
    expect(manifest.permissions).toEqual(["storage", "activeTab", "scripting"]);
    for (const key of ["host_permissions", "optional_host_permissions", "content_scripts", "externally_connectable", "background"]) {
      expect(manifest).not.toHaveProperty(key);
    }
  });
});
