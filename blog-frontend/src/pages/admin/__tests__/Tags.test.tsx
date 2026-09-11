import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";
import { ToastProvider } from "@gouno/ui-legacy";
import Tags from "../Tags";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return { apiFetch, gossoClient: createMockGossoClient(apiFetch) };
});

vi.mock("../../../hooks/useAdminGuard", () => ({
  useAdminGuard: () => true,
}));

describe("Admin Tags", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: [] }));
  });

  it("keeps tag names in a dedicated content region with canonical action buttons", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({ data: [{ name: "OpenAI", post_count: 3 }] }),
    );

    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <Tags />
        </ToastProvider>
      </MemoryRouter>,
    );

    await screen.findByText("OpenAI");
    expect(
      container.querySelector(".tag-admin-card__content"),
    ).toHaveTextContent("OpenAI");

    const rename = screen.getByRole("button", { name: "重命名" });
    const merge = screen.getByRole("button", { name: "合并" });
    const remove = screen.getByRole("button", { name: "删除" });

    expect(rename).toHaveAttribute("data-slot", "button");
    expect(merge).toHaveAttribute("data-slot", "button");
    expect(remove).toHaveAttribute("data-slot", "button");
    expect(remove).toHaveClass("text-destructive");
  });
});
