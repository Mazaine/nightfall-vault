import { expect, it, vi } from "vitest";
import { checkInventoryNames, inventoryTemplateCsv, inventoryTemplateHref } from "./inventoryImport";
import type { StockOperation } from "../api/inventory";
const initial = { id: 1, lookup_remaining: 20 } as StockOperation;
it("az üres minta a beküldött HKK Piac fejlécét tartalmazza, példányok vagy kitalált adatok nélkül", () => {
  expect(inventoryTemplateCsv).toBe("\uFEFFname;graphic_type;quantity;price;card_id;note\r\n");
  expect(decodeURIComponent(inventoryTemplateHref.split(",")[1])).toBe(inventoryTemplateCsv);
});
it("végigellenőrzi a neveket kézi kötegkattintások nélkül, egymás utáni kérésekkel", async () => {
  const middle = { ...initial, lookup_remaining: 10 }, done = { ...initial, lookup_remaining: 0 };
  const resolve = vi.fn().mockResolvedValueOnce(middle).mockResolvedValueOnce(done), progress = vi.fn(), wait = vi.fn().mockResolvedValue(undefined);
  expect(await checkInventoryNames(initial, { resolve, progress, wait, stopped: () => false })).toBe(done);
  expect(resolve).toHaveBeenCalledTimes(2); expect(progress).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledTimes(1); expect(wait.mock.calls[0][0]).toBeLessThanOrEqual(3100);
});
it("megállítható, és nem indít további kérést a folyamat megszakítása után", async () => {
  let stop = false;
  const resolve = vi.fn().mockResolvedValue({ ...initial, lookup_remaining: 10 });
  await checkInventoryNames(initial, { resolve, progress: () => { stop = true; }, stopped: () => stop });
  expect(resolve).toHaveBeenCalledTimes(1);
});
it("nem kezd végtelen ciklusba, ha nem történt előrelépés", async () => {
  const resolve = vi.fn().mockResolvedValue(initial);
  await checkInventoryNames(initial, { resolve, progress: vi.fn(), stopped: () => false });
  expect(resolve).toHaveBeenCalledTimes(1);
});
it("a forráshiba után megáll; a hiba nem jelent feltöltési sikert", async () => {
  const resolve = vi.fn().mockRejectedValue(new Error("A lapkereső nem érhető el")), progress = vi.fn();
  await expect(checkInventoryNames(initial, { resolve, progress, stopped: () => false })).rejects.toThrow("nem érhető el");
  expect(resolve).toHaveBeenCalledTimes(1); expect(progress).not.toHaveBeenCalled();
});
