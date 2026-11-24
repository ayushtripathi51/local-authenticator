import "@testing-library/jest-dom/vitest";

Object.defineProperty(navigator, "locks", {
  configurable: true,
  value: { request: async (_name: string, action: () => Promise<unknown>) => action() }
});
