import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";
import { ToastProvider } from "../../../components/ui";
import Tags from "../Tags";

vi.mock("../../../auth", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../../hooks/useAdminGuard", () => ({
  useAdminGuard: () => true,
}));

describe("Admin Tags", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: [] }));
  });

  it("keeps tag names in a dedicated left-aligned content region with shared action buttons", async () => {
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
    expect(screen.getByRole("button", { name: "重命名" })).toHaveClass("btn");
    expect(screen.getByRole("button", { name: "合并" })).toHaveClass("btn");
    expect(screen.getByRole("button", { name: "删除" })).toHaveClass(
      "btn-danger",
    );
  });
});
