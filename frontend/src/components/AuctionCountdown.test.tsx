import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionCountdown } from "./AuctionCountdown";

describe("AuctionCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T18:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("az eredeti lejárat után indítja el a plusz öt perc másodperces visszaszámlálását", () => {
    render(<AuctionCountdown endsAt="2026-07-19T18:00:00.000Z" status="active" fiveMinuteRuleEnabled />);
    expect(screen.getByRole("timer")).toHaveTextContent("+5 perc hosszabbítás05:00");

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveTextContent("+5 perc hosszabbítás04:59");
    expect(screen.getByRole("timer").getAttribute("aria-label")).toContain("4 perc 59 másodperc");
  });

  it("az ötperces szabály nélkül nem kapcsol sürgős másodperces módba", () => {
    render(<AuctionCountdown endsAt="2026-07-19T18:04:02.000Z" status="active" fiveMinuteRuleEnabled={false} />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("0 óra 4 perc")).toBeInTheDocument();
  });

  it("a normál lejárat előtt még nem indítja el a hosszabbítást", () => {
    const { unmount } = render(<AuctionCountdown endsAt="2026-07-19T18:04:02.000Z" status="active" fiveMinuteRuleEnabled />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("0 óra 4 perc")).toBeInTheDocument();

    unmount();
    vi.setSystemTime(new Date("2026-07-19T18:04:02.000Z"));
    render(<AuctionCountdown endsAt="2026-07-19T18:04:02.000Z" status="active" fiveMinuteRuleEnabled />);
    expect(screen.getByRole("timer")).toHaveTextContent("05:00");
  });
});
