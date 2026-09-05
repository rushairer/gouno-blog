import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";
import { ToastProvider } from "@gouno/ui";
import Categories from "../Categories";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return { apiFetch, gossoClient: createMockGossoClient(apiFetch) };
});

vi.mock("../../../hooks/useAdminGuard", () => ({
  useAdminGuard: () => true,
}));

describe("Admin Categories", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: [] }));
  });

  it("opens category creation in the right-side drawer with AI Slug assistant", async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <Categories />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("还没有分类。创建第一个分类来组织长期主题。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "新建分类" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));
    const form = screen
      .getByRole("dialog", { name: "新建分类" })
      .querySelector(".drawer-form");
    expect(form?.querySelectorAll(".field")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "智能生成 Slug 候选" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建分类" })).toHaveClass(
      "btn-primary",
    );
  });
});
