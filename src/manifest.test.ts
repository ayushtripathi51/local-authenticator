import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import manifest from "../manifest.json";

describe("extension manifest icons", () => {
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
});
