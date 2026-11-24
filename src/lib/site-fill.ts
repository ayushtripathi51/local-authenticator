type Target = { tabId: number; origin: string; documentId?: string };
type FillIO = {
  active: () => Promise<Target | null>;
  approve: () => Promise<boolean>;
  code: () => Promise<string>;
  fill: (target: Target, code: string) => Promise<boolean>;
};
export async function fillSiteCode(origin: string, io: FillIO): Promise<boolean> {
  const target = await io.active();
  if (!target || target.origin !== origin) throw new Error("Open the paired site before filling");
  if (!(await io.approve())) throw new Error("Device verification was not approved");
  const current = await io.active();
  if (!current || current.tabId !== target.tabId || current.origin !== target.origin || current.documentId !== target.documentId) {
    throw new Error("The paired page changed during approval");
  }
  const code = await io.code();
  if (!/^\d{6,8}$/.test(code)) throw new Error("Invalid generated code");
  return io.fill(target, code);
}

export function exactHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}

export async function currentSite(): Promise<Target | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = exactHttpsOrigin(tab?.url);
  if (!origin || tab?.id === undefined || tab.pendingUrl) return null;
  return { tabId: tab.id, origin };
}

export async function currentDocument(): Promise<Target | null> {
  const target = await currentSite();
  if (!target) return null;
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId: target.tabId, frameIds: [0] },
    func: () => location.origin
  });
  return probe?.frameId === 0 && probe.result === target.origin && probe.documentId ? { ...target, documentId: probe.documentId } : null;
}

export async function fillDocument(target: Target, code: string): Promise<boolean> {
  if (!target.documentId) return false;
  const tab = await currentSite();
  if (tab?.tabId !== target.tabId || tab.origin !== target.origin) return false;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: target.tabId, documentIds: [target.documentId] },
    func: fillOneTimeCode,
    args: [target.origin, code]
  });
  return result?.frameId === 0 && result.result === true;
}

// Chrome serializes this function into the isolated world. Keep it self-contained.
export function fillOneTimeCode(origin: string, code: string): boolean {
  if (window.top !== window || location.origin !== origin || !/^\d{6,8}$/.test(code)) return false;
  const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input[autocomplete="one-time-code"]'));
  if (fields.length !== 1) return false;
  const field = fields[0];
  if (!['text', 'tel', 'number', 'password'].includes(field.type) || field.value || field.matches(':disabled') || field.readOnly ||
      !field.checkVisibility({ visibilityProperty: true, opacityProperty: true }) ||
      (field.maxLength !== -1 && field.maxLength < code.length)) return false;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!set) return false;
  set.call(field, code);
  field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  return true;
}
