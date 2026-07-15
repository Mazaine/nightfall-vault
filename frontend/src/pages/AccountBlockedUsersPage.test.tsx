import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountBlockedUsersPage } from "./AccountBlockedUsersPage";

const mocks = vi.hoisted(() => ({ listBlocks: vi.fn(), unblockUser: vi.fn() }));

vi.mock("../api/blocks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/blocks")>()),
  ...mocks,
}));

describe("AccountBlockedUsersPage", () => {
  beforeEach(() => {
    mocks.listBlocks.mockReset();
    mocks.unblockUser.mockReset();
    mocks.listBlocks.mockResolvedValue([{ username: "anna", full_name: "Anna Kártyabarlang", blocked_at: "2026-07-15T10:00:00Z" }]);
    mocks.unblockUser.mockResolvedValue(undefined);
  });

  it("a backend valódi mezőiből kompakt profilkártyát jelenít meg", async () => {
    render(<MemoryRouter><AccountBlockedUsersPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Anna Kártyabarlang" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@anna" })).toHaveAttribute("href", "/users/anna");
    expect(screen.getByText("Blokkolás időpontja")).toBeInTheDocument();
    expect(screen.queryByText("@")).not.toBeInTheDocument();
  });

  it("feloldás után azonnal eltávolítja a profilt a listából", async () => {
    render(<MemoryRouter><AccountBlockedUsersPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Blokkolás feloldása" }));

    await waitFor(() => expect(mocks.unblockUser).toHaveBeenCalledWith("anna"));
    expect(screen.queryByRole("heading", { name: "Anna Kártyabarlang" })).not.toBeInTheDocument();
  });
});
