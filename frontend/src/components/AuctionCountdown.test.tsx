import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionCountdown } from "./AuctionCountdown";

describe("AuctionCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T18:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("az utolsó öt percben másodpercenként számol vissza", () => {
    render(<AuctionCountdown endsAt="2026-07-19T18:05:00.000Z" status="active" fiveMinuteRuleEnabled />);
    expect(screen.getByRole("timer")).toHaveTextContent("5 perces licitvédelem05:00");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveTextContent("04:59");
  });

  it("új endsAt értéknél ismét öt percről indul", () => {
    const view = render(<AuctionCountdown endsAt="2026-07-19T18:04:00.000Z" status="active" fiveMinuteRuleEnabled />);
    expect(screen.getByRole("timer")).toHaveTextContent("04:00");
    view.rerender(<AuctionCountdown endsAt="2026-07-19T18:05:00.000Z" status="active" fiveMinuteRuleEnabled />);
    expect(screen.getByRole("timer")).toHaveTextContent("05:00");
    expect(screen.getByRole("timer").getAttribute("aria-label")).toContain("Új licitnél");
  });

  it("az ötperces szabály nélkül nem kapcsol másodperces módba", () => {
    render(<AuctionCountdown endsAt="2026-07-19T18:04:02.000Z" status="active" fiveMinuteRuleEnabled={false} />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("0 óra 4 perc")).toBeInTheDocument();
  });

  it("öt percnél távolabb normál visszaszámlálást mutat", () => {
    render(<AuctionCountdown endsAt="2026-07-19T18:06:00.000Z" status="active" fiveMinuteRuleEnabled />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("0 óra 6 perc")).toBeInTheDocument();
  });
});
