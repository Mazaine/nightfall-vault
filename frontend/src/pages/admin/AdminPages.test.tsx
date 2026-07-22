import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuditLogsPage } from "./AdminAuditLogsPage";
import { AdminDashboardPage } from "./AdminDashboardPage";
import { AdminReportsPage } from "./AdminReportsPage";
import { AdminUsersPage } from "./AdminUsersPage";

const adminMocks = vi.hoisted(() => ({
  getAdminStats: vi.fn(),
  listAdminUsers: vi.fn(),
  searchAdminUsers: vi.fn(),
  listAuditLogs: vi.fn(),
}));
const reportMocks = vi.hoisted(() => ({
  listAdminReports: vi.fn(),
  updateAdminReportStatus: vi.fn(),
  updateAdminReportPriority: vi.fn(),
  updateAdminReportNote: vi.fn(),
}));

vi.mock("../../api/admin", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../api/admin")>()), ...adminMocks }));
vi.mock("../../api/reports", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../api/reports")>()), ...reportMocks }));

const user = {
  id: 7, email: "anna@example.test", username: "anna", full_name: "Anna Kártyabarlang", role: "user" as const,
  is_active: true, is_email_verified: true, created_at: "2026-07-20T10:00:00Z", updated_at: "2026-07-20T10:00:00Z",
};
const report = {
  id: 11, reporter_id: 7, reporter_username: "anna", target_type: "auction" as const, auction_id: 1001,
  auction_title: "Teszt aukció", reported_user_id: null, reported_username: null, reason: "counterfeit", details: "Teszt részlet",
  status: "open" as const, priority: "normal" as const, admin_note: "Belső jegyzet", public_resolution: null,
  assigned_admin_id: null, assigned_admin_username: null, related_open_reports: 1, related_total_reports: 1,
  created_at: "2026-07-20T10:00:00Z", updated_at: "2026-07-20T10:00:00Z", resolved_at: null,
};

describe("admin felületek", () => {
  beforeEach(() => {
    adminMocks.getAdminStats.mockReset().mockResolvedValue({ total_auctions: 10, active_auctions: 4, today_auctions: 2, sold_auctions: 3, open_reports: 5, total_users: 8, new_users: 1 });
    adminMocks.listAdminUsers.mockReset().mockResolvedValue([user]);
    adminMocks.searchAdminUsers.mockReset().mockResolvedValue([user]);
    adminMocks.listAuditLogs.mockReset().mockResolvedValue({ items: [{ id: 1, action: "report_status_changed", user_id: 2, auction_id: 1001, created_at: "2026-07-20T10:00:00Z", path: "/api/admin/reports/11/status", method: "PUT", status_code: 200, metadata_json: null }], limit: 100, offset: 0 });
    reportMocks.listAdminReports.mockReset().mockResolvedValue({ items: [report], total: 1, limit: 50, offset: 0 });
    reportMocks.updateAdminReportStatus.mockReset().mockResolvedValue({ ...report, status: "under_review" });
    reportMocks.updateAdminReportPriority.mockReset().mockResolvedValue({ ...report, priority: "high" });
    reportMocks.updateAdminReportNote.mockReset().mockResolvedValue(report);
  });

  it("valós statisztikákkal tölti be a dashboardot", async () => {
    render(<AdminDashboardPage />);
    expect(await screen.findByText("Aktív aukció")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(adminMocks.getAdminStats).toHaveBeenCalledOnce();
  });

  it("betölti és kereshetővé teszi a felhasználólistát", async () => {
    render(<MemoryRouter><AdminUsersPage /></MemoryRouter>);
    expect(await screen.findByText("Anna Kártyabarlang")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Keresés név, felhasználónév vagy e-mail alapján"), { target: { value: "Anna" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(adminMocks.searchAdminUsers).toHaveBeenCalledWith("Anna"));
  });

  it("az API oldalszerkezetéből jeleníti meg az auditnaplót", async () => {
    render(<AdminAuditLogsPage />);
    expect(await screen.findByText("Jelentés állapotának módosítása")).toBeInTheDocument();
    expect(screen.getByText("Frissítés: /api/admin/reports/11/status")).toBeInTheDocument();
    expect(screen.getByText("Sikeres")).toBeInTheDocument();
    expect(screen.queryByText("200")).not.toBeInTheDocument();
  });

  it("megnyitja a jelentés részleteit, valamint módosítja a státuszt és prioritást", async () => {
    render(<MemoryRouter><AdminReportsPage /></MemoryRouter>);
    expect(await screen.findByLabelText("A(z) 11. jelentés részletei")).toBeInTheDocument();
    expect(screen.getAllByText("Hamis vagy hamisítványgyanús tétel").length).toBeGreaterThan(0);
    expect(screen.queryByText("counterfeit")).not.toBeInTheDocument();
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[2], { target: { value: "under_review" } });
    await waitFor(() => expect(reportMocks.updateAdminReportStatus).toHaveBeenCalledWith(11, "under_review"));
    fireEvent.change(selects[3], { target: { value: "high" } });
    await waitFor(() => expect(reportMocks.updateAdminReportPriority).toHaveBeenCalledWith(11, "high"));
  });

  it("az üres admin kereséshez érthető állapotot és törlési műveletet ad", async () => {
    adminMocks.listAdminUsers.mockResolvedValueOnce([]);
    render(<MemoryRouter><AdminUsersPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Nincs a keresésnek megfelelő felhasználó" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keresés törlése" })).toBeInTheDocument();
  });

  it("az admin dashboard hibája után újrapróbálható", async () => {
    adminMocks.getAdminStats.mockRejectedValueOnce(new Error("Átmeneti adminhiba"));
    render(<AdminDashboardPage />);
    expect(await screen.findByText("Átmeneti adminhiba")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Újrapróbálás" }));
    expect(await screen.findByText("Aktív aukció")).toBeInTheDocument();
  });
});
