import { beforeEach, describe, expect, it } from "vitest";
import { disableBidConfirmation, isBidConfirmationDisabled, resetBidConfirmation } from "./bidConfirmation";

describe("bid confirmation device preference", () => {
  beforeEach(() => localStorage.clear());

  it("csak a helyi eszközön tárolható és visszaállítható", () => {
    expect(isBidConfirmationDisabled()).toBe(false);
    disableBidConfirmation();
    expect(isBidConfirmationDisabled()).toBe(true);
    resetBidConfirmation();
    expect(isBidConfirmationDisabled()).toBe(false);
  });
});
