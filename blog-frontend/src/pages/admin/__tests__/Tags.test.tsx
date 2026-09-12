import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../auth";

import Tags from "../Tags";
import { AppFeedbackProvider } from "../../../components/feedback/AppFeedbackProvider";

vi.mock("../../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } =
    await import("../../../test/mockGossoClient");
  return { apiFetch, gossoClient: createMockGossoClient(apiFetch) };
});

vi.mock("../../../hooks/useAdminGuard", () => ({
  useAdminGuard: () => true,
}));

function renderTags() {
  return render(
    <MemoryRouter>
      <AppFeedbackProvider>
        <Tags />
      </AppFeedbackProvider>
    </MemoryRouter>,
  );
}

describe("Admin Tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ data: [] }));
  });

  it("uses the Showcase tag card composition without retired tag-admin classes", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({ data: [{ name: "OpenAI", post_count: 3 }] }),
    );

    const { container } = renderTags();

    await screen.findByText("OpenAI");
    expect(container.querySelector('[class*="tag-admin-"]')).toBeNull();

    const rename = screen.getByRole("button", {
      name: "重命名标签 OpenAI",
    });
    const merge = screen.getByRole("button", { name: "合并标签 OpenAI" });
    const remove = screen.getByRole("button", { name: "删除标签 OpenAI" });

    expect(rename).toHaveAttribute("data-slot", "button");
    expect(merge).toHaveAttribute("data-slot", "button");
    expect(remove).toHaveAttribute("data-slot", "button");
    expect(remove).toHaveClass("text-destructive");

    fireEvent.click(screen.getByRole("checkbox", { name: "选择标签 OpenAI" }));
    expect(screen.getByText("已选择 1 个标签")).toBeInTheDocument();
    expect(
      screen.getByText("OpenAI").closest('[data-state="selected"]'),
    ).toBeTruthy();
  });

  it("uses controlled canonical modals for rename and delete", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({ data: [{ name: "OpenAI", post_count: 3 }] }),
    );

    renderTags();
    await screen.findByText("OpenAI");

    fireEvent.click(screen.getByRole("button", { name: "重命名标签 OpenAI" }));
    expect(
      screen.getByRole("dialog", { name: "重命名标签" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("新标签名称")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "删除标签 OpenAI" }));
    expect(
      screen.getByRole("dialog", { name: "删除标签" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("删除只移除标签关联，不删除文章。"),
    ).toBeInTheDocument();
  });
});
