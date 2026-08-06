import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileImagePreview } from "./FileImagePreview";

describe("FileImagePreview", () => {
  it("helyi előnézetet készít és unmountkor felszabadítja az object URL-t", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:nightfall-preview");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const file = new File(["image"], "kartya.png", { type: "image/png" });
    const { unmount } = render(<FileImagePreview file={file} alt="Kártya előnézete" />);
    expect(screen.getByRole("img", { name: "Kártya előnézete" })).toHaveAttribute("src", "blob:nightfall-preview");
    unmount();
    expect(create).toHaveBeenCalledWith(file);
    expect(revoke).toHaveBeenCalledWith("blob:nightfall-preview");
  });
});
