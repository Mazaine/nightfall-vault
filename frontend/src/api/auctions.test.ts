import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuction } from "./auctions";
import { AUTH_TOKEN_STORAGE_KEY } from "./client";

describe("getAuction", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("bejelentkezve elküldi a tokent a résztvevői chat jogosultságához", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "test-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 42 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getAuction(42);

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-token");
  });
});
