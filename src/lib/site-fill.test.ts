import { expect, test, vi } from "vitest";
import { fillSiteCode } from "./site-fill";

function fixture() {
  const target = { tabId: 7, origin: "https://login.example.test" };
  const active = vi.fn(async () => target);
  const approve = vi.fn(async () => true);
  const code = vi.fn(async () => "123456");
  const fill = vi.fn(async () => true);
  return { target, active, approve, code, fill };
}

test("fills only the paired tab after fresh verification", async () => {
  const {target, ...io} = fixture();
  expect(await fillSiteCode(target.origin, io)).toBe(true);
  expect(io.fill).toHaveBeenCalledExactlyOnceWith(target, "123456");
  expect(io.approve.mock.invocationCallOrder[0]).toBeLessThan(io.code.mock.invocationCallOrder[0]);
});

test("denial or changed tab never generates or fills a code", async () => {
  const {target, ...io} = fixture();
  io.approve.mockResolvedValueOnce(false);
  await expect(fillSiteCode(target.origin, io)).rejects.toThrow();
  io.active.mockResolvedValueOnce(target).mockResolvedValueOnce({...target, tabId: 9});
  await expect(fillSiteCode(target.origin, io)).rejects.toThrow();
  await expect(fillSiteCode("https://example.test", io)).rejects.toThrow();
  expect(io.code).not.toHaveBeenCalled();
  expect(io.fill).not.toHaveBeenCalled();
});

import { fillOneTimeCode } from "./site-fill";

function page(html: string) {
  document.body.innerHTML = html;
  HTMLElement.prototype.checkVisibility = () => true;
  return Array.from(document.querySelectorAll("input"));
}

test("fills exactly one empty one-time-code field and fires input", () => {
  const [field] = page('<input autocomplete="one-time-code" inputmode="numeric">');
  const seen = vi.fn();
  field.addEventListener("input", seen);
  expect(fillOneTimeCode(location.origin, "123456")).toBe(true);
  expect(field.value).toBe("123456");
  expect(seen).toHaveBeenCalledOnce();
});

test("refuses ambiguous, prefilled, guessed or wrong-origin fields", () => {
  page('<input autocomplete="one-time-code"><input autocomplete="one-time-code">');
  expect(fillOneTimeCode(location.origin, "123456")).toBe(false);
  page('<input autocomplete="one-time-code" value="1">');
  expect(fillOneTimeCode(location.origin, "123456")).toBe(false);
  page('<input name="otp">');
  expect(fillOneTimeCode(location.origin, "123456")).toBe(false);
  const [field] = page('<input autocomplete="one-time-code">');
  expect(fillOneTimeCode("https://other.example.test", "123456")).toBe(false);
  expect(field.value).toBe("");
});
