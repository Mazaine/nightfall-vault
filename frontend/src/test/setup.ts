import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

Object.defineProperty(window, "scrollTo", { configurable: true, writable: true, value: vi.fn() });

if (typeof window.localStorage?.setItem !== "function") {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
    },
  });
}
