import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, canManageBlog, isLoggedIn } from "../../auth";
import { I18nProvider } from "../../i18n";
import { ToastProvider } from "../../components/ui";
import AdminPages from "../admin/Pages";

vi.mock("../../auth", async () => {
  const apiFetch = vi.fn();
  const { createMockGossoClient } = await import("../../test/mockGossoClient");
  return {
    apiFetch,
    gossoClient: createMockGossoClient(apiFetch),
    canManageBlog: vi.fn(),
    isLoggedIn: vi.fn(),
    redirectToAuthorize: vi.fn(),
  };
});

const mockPage = {
  id: 10,
  title: "关于本站",
  slug: "about",
  summary: "关于本站的说明",
  content: "# 关于本站\n这是单页内容",
  template: "default",
  status: "published",
  show_in_nav: true,
  allow_comments: true,
  sort_order: 1,
  seo_title: "关于本站 - 官方说明",
  seo_description: "关于本站的官方说明与介绍",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
};

function renderPages() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <MemoryRouter>
          <AdminPages />
        </MemoryRouter>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("AdminPages", () => {
  beforeEach(() => {
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(canManageBlog).mockReturnValue(true);
    vi.mocked(apiFetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/api/admin/pages")) {
        return Response.json({ data: { list: [mockPage], total: 1 } });
      }
      if (url.includes("/api/ai/workflows")) {
        return Response.json({ data: [] });
      }
      return Response.json({ data: null });
    });
  });

  it("renders pages list and allows selecting a page to open the AI launcher", async () => {
    const user = userEvent.setup();
    renderPages();

    expect(await screen.findByText("关于本站")).toBeInTheDocument();
    expect(screen.getByText("/about")).toBeInTheDocument();

    const checkbox = screen.getByLabelText("选择 关于本站");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    expect(screen.getByText("已选择 1 页")).toBeInTheDocument();
    const aiButton = screen.getByRole("button", { name: /交给 ai/i });
    expect(aiButton).toBeInTheDocument();

    await user.click(aiButton);
    expect(await screen.findByText("将所选单页交给 AI")).toBeInTheDocument();
  });
});
