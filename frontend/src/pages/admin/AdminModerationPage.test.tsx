import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminModerationPage } from "./AdminModerationPage";

const mocks = vi.hoisted(() => ({ getModerationOverview: vi.fn(), createModerationAction: vi.fn(), createUserStrike: vi.fn(), revokeModerationAction: vi.fn(), revokeUserStrike: vi.fn() }));
vi.mock("../../api/moderation", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../api/moderation")>()), ...mocks }));

describe("AdminModerationPage", () => {
  beforeEach(() => { mocks.getModerationOverview.mockReset().mockResolvedValue({ actions: [], strikes: [] }); mocks.createModerationAction.mockReset().mockResolvedValue({}); mocks.createUserStrike.mockReset().mockResolvedValue({}); vi.spyOn(window, "confirm").mockReturnValue(true); });
  it("strike kiadását és részleges tiltást támogat", async () => {
    const { container } = render(<AdminModerationPage />); await waitFor(() => expect(mocks.getModerationOverview).toHaveBeenCalled());
    const forms = container.querySelectorAll("form");
    const actionForm = forms[0]; const strikeForm = forms[1];
    fireEvent.change(actionForm.querySelector('input[name="target_user_id"]')!, { target: { value: "12" } });
    fireEvent.change(actionForm.querySelector("select")!, { target: { value: "bidding_ban" } });
    fireEvent.change(actionForm.querySelector('textarea[name="reason"]')!, { target: { value: "Szabályszegés" } });
    fireEvent.change(actionForm.querySelector('input[name="expires_at"]')!, { target: { value: "2026-08-01T12:00" } });
    fireEvent.submit(actionForm);
    await waitFor(() => expect(mocks.createModerationAction).toHaveBeenCalled());
    fireEvent.change(strikeForm.querySelector('input[name="target_user_id"]')!, { target: { value: "12" } });
    fireEvent.change(strikeForm.querySelector('textarea[name="reason"]')!, { target: { value: "Teszt strike" } });
    fireEvent.submit(strikeForm);
    await waitFor(() => expect(mocks.createUserStrike).toHaveBeenCalled());
  });
  it("végleges tiltás előtt megerősítést kér", async () => {
    const { container } = render(<AdminModerationPage />); await waitFor(() => expect(mocks.getModerationOverview).toHaveBeenCalled());
    const form = container.querySelectorAll("form")[0];
    fireEvent.change(form.querySelector('input[name="target_user_id"]')!, { target: { value: "12" } }); fireEvent.change(form.querySelector("select")!, { target: { value: "permanent_ban" } }); fireEvent.change(form.querySelector('textarea[name="reason"]')!, { target: { value: "Súlyos szabályszegés" } }); fireEvent.submit(form);
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mocks.createModerationAction).toHaveBeenCalled());
  });

  it("magyarul és lejárattal jeleníti meg a megmaradó előzményeket", async () => {
    mocks.getModerationOverview.mockResolvedValue({
      actions: [{ id: 1, target_user_id: 12, target_user: { id: 12, username: "teszt-user", full_name: "Teszt User" }, action_type: "auction_creation_ban", reason: "Teszt indok", internal_note: null, starts_at: "2026-07-22T10:00:00Z", expires_at: "2026-07-24T10:00:00Z", revoked_at: "2026-07-23T10:00:00Z", created_at: "2026-07-22T10:00:00Z" }],
      strikes: [{ id: 2, user_id: 12, user: { id: 12, username: "teszt-user", full_name: "Teszt User" }, reason: "Teszt pont", severity: "medium", issued_at: "2026-07-22T10:00:00Z", expires_at: null, revoked_at: "2026-07-23T10:00:00Z" }],
    });

    render(<AdminModerationPage />);

    expect(await screen.findByText("teszt-user · Aukció-létrehozási tiltás")).toBeInTheDocument();
    expect(screen.getByText("teszt-user · Közepes")).toBeInTheDocument();
    expect(screen.getByText(/lejárat:/)).toBeInTheDocument();
    expect(screen.getAllByText(/Visszavonva:/)).toHaveLength(2);
    expect(screen.queryByText(/auction_creation_ban/)).not.toBeInTheDocument();
  });
});
