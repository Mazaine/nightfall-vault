import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";

describe("apiRequest magyar hibaállapotok", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("magyar, felhasználóbarát üzenetet ad hálózati hiba esetén", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiRequest("/api/test", { authenticated: false })).rejects.toMatchObject({
      status: 0,
      message: "Nem sikerült kapcsolódni a kiszolgálóhoz. Ellenőrizd a kapcsolatot, majd próbáld újra.",
    });
  });

  it("nem jeleníti meg a nyers szerverhibát", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(apiRequest("/api/test", { authenticated: false })).rejects.toMatchObject({
      status: 500,
      message: "A kiszolgáló átmenetileg nem érhető el. Próbáld újra később.",
    });
  });

  it("a proxy nem JSON-os 413 válaszát nem nevezi hálózati hibának", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Request Entity Too Large", { status: 413 })));

    await expect(apiRequest("/api/upload", { method: "POST", body: new FormData() })).rejects.toMatchObject({
      status: 413,
      message: "A feltöltött fájl túl nagy.",
    });
  });

  it("az ismeretlen HTTP elutasítást megkülönbözteti a kapcsolódási hibától", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Request", { status: 400 })));

    await expect(apiRequest("/api/upload", { authenticated: false })).rejects.toMatchObject({
      status: 400,
      message: "A kiszolgáló visszautasította a kérést. Ellenőrizd az adatokat, majd próbáld újra.",
    });
  });

  it("magyarra fordítja a gyakori validációs mezőhibákat", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { message: "Validation error", errors: { email: "Value is not a valid email address", title: "Field required" } },
    }), { status: 422, headers: { "Content-Type": "application/json" } })));

    await expect(apiRequest("/api/test", { authenticated: false })).rejects.toMatchObject({
      status: 422,
      message: "Ellenőrizd a megadott adatokat.",
      fieldErrors: { email: "Érvényes e-mail-címet adj meg.", title: "A mező kitöltése kötelező." },
    });
  });
});
